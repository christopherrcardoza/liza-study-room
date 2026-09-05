-- Run once in a NEW Supabase Free project. Never run against unrelated tables.
-- This is a generic schema; it contains no keys, user content or room proof.
-- The UI generates a separate one-row provisioning statement containing only a hash.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists sidebar_private;
revoke all on schema sidebar_private from public, anon, authenticated;
create table if not exists sidebar_private.rooms (
  room_id text primary key check (room_id ~ '^[a-zA-Z0-9_-]{8,80}$'),
  proof_hash text not null check (proof_hash ~ '^[a-f0-9]{64}$'),
  revision bigint not null default 0,
  payload jsonb,
  updated_at timestamptz not null default now()
);
alter table sidebar_private.rooms enable row level security;
revoke all on sidebar_private.rooms from public, anon, authenticated;

create or replace function public.sidebar_room_read(p_room text, p_proof text, p_revision bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r sidebar_private.rooms%rowtype;
begin
  if p_revision is null or p_revision < -1 then raise sqlstate 'PT400' using message = 'Invalid revision'; end if;
  if length(p_proof) <> 43 then raise sqlstate 'PT401' using message = 'Room access refused'; end if;
  select * into r from sidebar_private.rooms
    where room_id = p_room and proof_hash = encode(extensions.digest(p_proof, 'sha256'), 'hex');
  if not found then raise sqlstate 'PT401' using message = 'Room access refused'; end if;
  return jsonb_build_object('revision', r.revision, 'changed', r.revision <> p_revision,
    'payload', case when r.revision <> p_revision then r.payload else null end);
end $$;

create or replace function public.sidebar_room_write(p_room text, p_proof text, p_revision bigint, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r sidebar_private.rooms%rowtype;
begin
  if p_revision is null or p_revision < 0 then raise sqlstate 'PT400' using message = 'Invalid revision'; end if;
  if length(p_proof) <> 43 then raise sqlstate 'PT401' using message = 'Room access refused'; end if;
  select * into r from sidebar_private.rooms
    where room_id = p_room and proof_hash = encode(extensions.digest(p_proof, 'sha256'), 'hex') for update;
  if not found then raise sqlstate 'PT401' using message = 'Room access refused'; end if;
  if r.revision is distinct from p_revision then raise sqlstate 'PT409' using message = 'Revision conflict'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or p_payload->>'version' is distinct from '1'
    or jsonb_typeof(p_payload->'iv') is distinct from 'string'
    or jsonb_typeof(p_payload->'ciphertext') is distinct from 'string'
    or length(p_payload->>'iv') <> 16
    or length(p_payload->>'ciphertext') < 24
    or length(p_payload::text) > 11000000 then
    raise sqlstate 'PT413' using message = 'Invalid or oversized encrypted workspace';
  end if;
  update sidebar_private.rooms set revision = r.revision + 1, payload = p_payload, updated_at = now() where room_id = p_room;
  return jsonb_build_object('revision', r.revision + 1, 'changed', false, 'payload', null);
end $$;
revoke all on function public.sidebar_room_read(text,text,bigint) from public;
revoke all on function public.sidebar_room_write(text,text,bigint,jsonb) from public;
grant execute on function public.sidebar_room_read(text,text,bigint) to anon;
grant execute on function public.sidebar_room_write(text,text,bigint,jsonb) to anon;
commit;
