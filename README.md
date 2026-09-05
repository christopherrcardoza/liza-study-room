# SideBar — Liza's Study Workspace

Compiled static application and encrypted personal study pack. A separate private study link is required to open the content. This repository does not include a source PDF or the unlock key.

The browser edition includes the original study activities, source lookup, reviewed document import/OCR, assignments, rule capture, reviewed question drafts, short-audio tools and selected games. Optional OCR, speech transcription and small-model drafts run on the visitor's device and require engine/model downloads.

Encrypted automatic workspace sync is configured for the owner's Supabase project. Visitors using the existing study key connect automatically; no Supabase login is needed. `sync-config.json` contains public connection details, not the study key or a database secret. Live encrypted read/write, incorrect-proof rejection, direct-table denial, backup round trip and stale-save protection have been checked. Original PDFs/images/audio are not uploaded or synced; the shared workspace supports approved extracted text and study progress. Existing on-device study progress remains available. Free-project quotas and inactivity pausing still apply; download encrypted backups and wait for the site's Synced status before closing after edits. Physical two-device browser testing remains separate from the API checks.

The private key protects the guide and shared workspace, not the public application/game code or game assets. Anyone with the full private link can access the protected study content. CourtSim's large assets and redistribution notices are under `games/courtsim/`; downloading the full game can exceed 600 MB. This is a personal study aid, not an official certification product or complete desktop replacement.
