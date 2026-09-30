// =========================================================================
// COURTSIM-NOTICE-052 -- CREDITS & LICENCES, REACHABLE IN EVERY VIEW MODE.
//
// WHY THIS FILE EXISTS.
//
// This build ships twenty-one Microsoft Rocketbox avatars and a 75.7 MB
// NVIDIA Audio2Face model. Rocketbox is MIT. MIT has no credit clause: it
// requires the copyright notice AND the full permission notice to be
// included in all copies or substantial portions of the software. The NVIDIA
// Open Model License section 3.1 requires a copy of the agreement AND a file
// named `Notice` carrying one exact sentence.
//
// The published site does both. THIS build -- the one that goes to a
// classroom -- carried no notice of any kind until this job.
// COURTSIM-LEGAL-051 measured that and handed it over; see
// reports/HANDOFF_TO_LEGAL_LANE_UPDATE_20260918.md sections 5.3 and 6.3.
//
// WHY IT IS A KEY AND NOT JUST A BUTTON.
//
// ROOM ONLY sets #courtroom-toolbar to display:none, and ROOM ONLY is the
// mode the founder calls the real one -- it is also what STUDENT VIEW is. A
// toolbar button alone would make the notice unreachable in exactly the mode
// most likely to be in front of a class. So this follows the route N
// (speaker names), D (dictation) and L (lightboard) already take: a key,
// registered on the window, that survives Room Only, Desk, All Controls,
// fullscreen and cinema. K, because A C D F H L N P V are taken.
//
// WHY IT BUILDS ITS OWN DOM AND ITS OWN STYLE.
//
// Same pattern import_ui.js documents: one script tag is the only change any
// other file needs. It also means this module has ZERO imports -- it cannot
// be broken by another lane's refactor, it needs nothing from css/style.css
// (which is a shared file), and the live-session build's module-graph walk
// copies exactly one extra file to carry it. A notice that only renders when
// everything else loaded correctly is a notice that disappears exactly when
// something is wrong.
//
// THE STATIC PAGE IS THE ONE THAT SURVIVES EVERYTHING. licenses/index.html
// has no script and no stylesheet link: it opens from the dev server, from
// the published site, from file:// on a USB stick, and with JavaScript off.
// This panel is the convenience; that page is the guarantee.
// =========================================================================

// licenses/ sits beside js/ in every tree this ships in -- the dev tree, the
// live-session dist (build_live.mjs copies modules to js/ and the notices to
// licenses/), and the published site. Resolved from this module's own URL
// rather than from document.baseURI so it is correct whatever page mounts it.
// The import map's ?v= cache-buster is dropped by the URL parse, which is
// what we want: these are static texts, not modules.
const LIC_DIR = new URL('../licenses/', import.meta.url).href;

// The two notices that this build is actually obliged to deliver, embedded
// verbatim. They are embedded, not only fetched, for one reason: if the
// fetch fails -- file://, an offline copy, a server that does not serve
// .txt, a path that moved -- the requirement must still be met by the bytes
// already on screen. A notice behind a network request is a notice that can
// be absent.
const ROCKETBOX_MIT = `MIT License

Copyright (c) 2020 Microsoft

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

const NVIDIA_NOTICE = 'Licensed by NVIDIA Corporation under the NVIDIA Open Model License';

// Every component, in the order a reader should meet them: the two that ship
// as bytes first, then the one vendored in the tree, then the CDN runtime.
const COMPONENTS = [
  {
    name: 'Microsoft Rocketbox avatars',
    what: 'The twenty-one people in this courtroom (modified GLB conversions)',
    licence: 'MIT License — Copyright (c) 2020 Microsoft',
    file: 'LICENSE-Rocketbox.txt',
    shipped: true,
  },
  {
    name: 'NVIDIA Audio2Face-3D-v2.3-Mark',
    what: 'The facial animation model and the reduced lip-sync data derived from it',
    licence: 'NVIDIA Open Model License',
    file: 'LICENSE-NVIDIA-Open-Model.txt',
    extra: [
      ['Notice', 'The Notice file section 3.1 requires by name'],
      ['NVIDIA-Trustworthy-AI-Terms.txt', 'Incorporated Trustworthy AI terms'],
    ],
    shipped: true,
  },
  {
    name: 'Basis Universal transcoder',
    what: 'KTX2 texture decoding (Binomial LLC), vendored in web/vendor/basis/',
    licence: 'Apache License 2.0',
    file: 'LICENSE-Apache-2.0.txt',
    extra: [['LICENSE-BasisUniversal.txt', 'How the licence was established']],
    shipped: true,
  },
  {
    name: 'three.js 0.169.0',
    what: 'The 3D renderer',
    licence: 'MIT License — Copyright © 2010-2024 three.js authors',
    file: 'LICENSE-three.js.txt',
  },
  {
    name: 'Pyodide 0.26.4',
    what: 'Python in the browser, which runs the scoring',
    licence: 'Mozilla Public License 2.0',
    file: 'LICENSE-Pyodide-MPL-2.0.txt',
  },
  {
    name: 'Transformers.js 3.0.0',
    what: 'Runs the speech models in the browser',
    licence: 'Apache License 2.0',
    file: 'LICENSE-Apache-2.0.txt',
  },
  {
    name: 'kokoro-js 1.2.1',
    what: 'The text-to-speech voices',
    licence: 'Apache License 2.0',
    file: 'LICENSE-Apache-2.0.txt',
  },
  {
    name: 'ONNX Runtime Web',
    what: 'Model inference',
    licence: 'MIT License — Copyright (c) Microsoft Corporation',
    file: 'LICENSE-onnxruntime.txt',
  },
  {
    name: 'Kokoro-82M v1.0 ONNX',
    what: 'The voice model weights, fetched when first needed',
    licence: 'Apache License 2.0',
    file: 'LICENSE-Apache-2.0.txt',
  },
  {
    name: 'whisper-tiny.en',
    what: 'The speech-recognition model weights, fetched when first needed',
    licence: 'Apache License 2.0',
    file: 'LICENSE-Apache-2.0.txt',
  },
];

const CSS = `
#licenses-popup {
  position: fixed; z-index: 9200;
  top: 6vh; left: 50%; transform: translateX(-50%);
  width: min(880px, 94vw); max-height: 86vh;
  display: flex; flex-direction: column;
  background: #171a21; color: #e7e9ee;
  border: 1px solid #39404f; border-radius: 10px;
  box-shadow: 0 18px 60px rgba(0,0,0,.6);
  font: 14px/1.55 system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
#licenses-popup[hidden] { display: none; }
#licenses-popup .lic-bar {
  flex: 0 0 auto; display: flex; align-items: center; gap: 10px;
  padding: 9px 12px; border-bottom: 1px solid #2c313d;
  background: #1e222b; border-radius: 10px 10px 0 0;
}
#licenses-popup .lic-bar strong { font-size: 15px; font-weight: 600; }
#licenses-popup .lic-bar .lic-spacer { flex: 1 1 auto; }
#licenses-popup .lic-bar button {
  font: inherit; cursor: pointer; color: #e7e9ee;
  background: #2b3140; border: 1px solid #3d4557; border-radius: 5px;
  padding: 3px 10px;
}
#licenses-popup .lic-bar button:hover { background: #38404f; }
#licenses-popup .lic-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 14px 18px 22px; }
#licenses-popup h3 { margin: 18px 0 4px; font-size: 15px; }
#licenses-popup h3:first-child { margin-top: 0; }
#licenses-popup p { margin: 6px 0; max-width: 72ch; }
#licenses-popup a { color: #8fc4ff; }
#licenses-popup pre {
  background: #0e1015; border: 1px solid #2c313d; border-radius: 6px;
  padding: 12px 14px; overflow-x: auto; white-space: pre-wrap;
  font: 12px/1.5 ui-monospace, Consolas, "Courier New", monospace; color: #cdd3de;
}
#licenses-popup .lic-dim { color: #aeb6c4; }
#licenses-popup table { border-collapse: collapse; width: 100%; margin: 8px 0 4px; }
#licenses-popup th, #licenses-popup td {
  text-align: left; padding: 5px 8px; border-bottom: 1px solid #262b35; vertical-align: top;
}
#licenses-popup th { color: #9aa3b2; font-weight: 600; font-size: 13px; }
#licenses-popup .lic-text-box { margin: 6px 0 0; }
#licenses-backdrop {
  position: fixed; inset: 0; z-index: 9190; background: rgba(0,0,0,.45);
}
#licenses-backdrop[hidden] { display: none; }
.licenses-footer-link { color: #8fc4ff; }
`;

let panel = null;
let backdrop = null;
let lastFocus = null;

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function componentRows() {
  return COMPONENTS.map((c) => {
    const links = [`<a href="${LIC_DIR}${c.file}" target="_blank" rel="noopener">${esc(c.file)}</a>`]
      .concat((c.extra || []).map(([f, label]) =>
        `<a href="${LIC_DIR}${f}" target="_blank" rel="noopener">${esc(label)}</a>`));
    return `<tr><td><strong>${esc(c.name)}</strong><br><span class="lic-dim">${esc(c.what)}</span></td>`
      + `<td>${esc(c.licence)}${c.shipped ? '<br><span class="lic-dim">ships inside this build</span>' : ''}</td>`
      + `<td>${links.join('<br>')}</td></tr>`;
  }).join('');
}

function buildPanel() {
  const style = document.createElement('style');
  style.id = 'licenses-ui-style';
  style.textContent = CSS;
  document.head.appendChild(style);

  backdrop = document.createElement('div');
  backdrop.id = 'licenses-backdrop';
  backdrop.hidden = true;
  backdrop.addEventListener('click', close);

  panel = document.createElement('div');
  panel.id = 'licenses-popup';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Credits and licences');
  panel.innerHTML = `
    <div class="lic-bar">
      <strong>Credits &amp; licences</strong>
      <span class="lic-spacer"></span>
      <button type="button" id="licenses-openpage-btn"
        title="Open the full notices page in a new tab. It needs no JavaScript and works from a file on disk.">Full page &#8599;</button>
      <button type="button" id="licenses-close-btn" title="Close (Esc, or K)">&times; Close</button>
    </div>
    <div class="lic-body">
      <p>
        CourtSim is built on work by other people. Everything it uses is named
        below, with the licence it is under and the complete text of that
        licence shipped beside this build.
      </p>

      <h3>The people in this courtroom — Microsoft Rocketbox, MIT</h3>
      <p>
        The twenty-one avatars are modified conversion derivatives of
        <a href="https://github.com/microsoft/Microsoft-Rocketbox" target="_blank" rel="noopener">Microsoft Rocketbox</a>.
        <strong>Copyright (c) 2020 Microsoft.</strong> MIT does not ask for
        credit — it asks that the copyright notice and the permission notice
        below travel with every copy. Here it is in full:
      </p>
      <pre class="lic-text-box">${esc(ROCKETBOX_MIT)}</pre>

      <h3>The faces — NVIDIA Audio2Face-3D, NVIDIA Open Model License</h3>
      <p>
        Section 3.1 of that agreement requires a copy of the agreement and a
        file named <code>Notice</code> carrying exactly this sentence. Both
        ship in this build:
      </p>
      <pre class="lic-text-box">${esc(NVIDIA_NOTICE)}</pre>

      <h3>Everything, with its licence text</h3>
      <table>
        <tr><th>Component</th><th>Licence</th><th>Full text</th></tr>
        ${componentRows()}
      </table>
      <p class="lic-dim">
        Blender and <code>@gltf-transform/cli</code> prepare assets on the
        developer's machine. They are build tools and are not part of this
        build.
      </p>
      <p class="lic-dim">
        CourtSim's own code carries no licence of its own; by default that
        means all rights reserved. This page covers software and model assets
        only. Nobody who assembled it is a lawyer and none of it is legal
        advice — every licence named was retrieved and read, and the texts
        ship beside this build so they can be read again.
      </p>
      <p>
        <a href="${LIC_DIR}index.html" target="_blank" rel="noopener">Open the full notices page</a>
        &nbsp;·&nbsp;
        <a href="${LIC_DIR}PROVENANCE.md" target="_blank" rel="noopener">PROVENANCE.md</a>
      </p>
    </div>`;

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);

  const closeBtn = panel.querySelector('#licenses-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', close);
  const pageBtn = panel.querySelector('#licenses-openpage-btn');
  if (pageBtn) {
    pageBtn.addEventListener('click', () => {
      window.open(LIC_DIR + 'index.html', '_blank', 'noopener');
    });
  }
  // A dialog that swallows the app's shortcuts while it is open would be a
  // trap; a dialog that leaks its own typing into them is worse. Only Esc is
  // taken here, and only while the panel is open.
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { close(); e.stopPropagation(); }
  });

  // THE LICENCE TEXT IS LONGER THAN THE PANEL AND IT HAS TO BE POSSIBLE TO
  // READ ALL OF IT. The body is `overflow-y: auto`, which is normally
  // enough. It is not relied on:
  //   - the wheel is applied to the body DIRECTLY, so it cannot be lost to
  //     anything else on the page that might claim the event, and it cannot
  //     scroll the room behind the dialog instead;
  //   - the body is focusable (tabindex below), so PageUp/PageDown, the
  //     arrow keys and Home/End work without a mouse at all.
  // Measured through a driven browser: the body reports scrollHeight 1679
  // against clientHeight 724, so there IS material below the fold to reach.
  const body = panel.querySelector('.lic-body');
  if (body) {
    body.tabIndex = 0;
    body.addEventListener('wheel', (e) => {
      const before = body.scrollTop;
      body.scrollTop += e.deltaY;
      // Only claim the event if it actually moved something. At the very top
      // or the very bottom the page underneath should behave normally.
      if (body.scrollTop !== before) { e.preventDefault(); e.stopPropagation(); }
    }, { passive: false });
  }
}

function isOpen() { return !!panel && !panel.hidden; }

function open() {
  if (!panel) buildPanel();
  lastFocus = document.activeElement;
  backdrop.hidden = false;
  panel.hidden = false;
  // Focus the BODY, not the close button: it is the scrollable region, so
  // PageDown and the arrow keys read the licence rather than doing nothing.
  // Esc still closes from anywhere inside the panel.
  const first = panel.querySelector('.lic-body') || panel.querySelector('#licenses-close-btn');
  if (first) { try { first.focus(); } catch (_) { /* focus is best effort */ } }
}

function close() {
  if (!panel) return;
  panel.hidden = true;
  backdrop.hidden = true;
  if (lastFocus && typeof lastFocus.focus === 'function') {
    try { lastFocus.focus(); } catch (_) { /* the element may be gone */ }
  }
  lastFocus = null;
}

function toggle() { if (isOpen()) close(); else open(); }

// -------------------------------------------------------------------------
// Mount. Everything below is defensive on purpose: this module must not be
// able to put an error in the console on a cold boot of any page that
// includes it, including pages that have none of these elements.
// -------------------------------------------------------------------------
function mount() {
  // 1. The toolbar control.
  //
  //    index.html ships it as a real <a href="licenses/index.html">, not as
  //    a <button>, and that is deliberate: if this module ever fails to load
  //    the control still WORKS -- it just navigates to the static notices
  //    page instead of opening the panel. A dead control that looks alive is
  //    the one failure mode a notice must not have. When the module is here,
  //    the click is intercepted and the panel opens in place instead.
  //
  //    If the element is missing entirely (the live-session build has no
  //    #window-presets), one is created where a host exists; the K key and
  //    the footer link cover the rest.
  const host = document.getElementById('window-presets');
  let btn = document.getElementById('licenses-open-btn');
  if (!btn && host) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'licenses-open-btn';
    btn.textContent = 'CREDITS & LICENCES (K)';
    const lb = document.getElementById('lightboard-open-btn');
    if (lb && lb.parentNode === host) host.insertBefore(btn, lb.nextSibling);
    else host.appendChild(btn);
  }
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      toggle();
    });
  }

  // 2. The key. Registered on window in the bubble phase, so any control
  //    that is genuinely handling K first still wins, and skipped entirely
  //    while text is being typed -- the same guard main.js's own courtroom
  //    handler uses, for the same reason.
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (e.key !== 'k' && e.key !== 'K') return;
    const t = e.target;
    const typing = !!t && (
      t.isContentEditable
      || t.tagName === 'TEXTAREA'
      || (t.tagName === 'INPUT' && String(t.type || '').toLowerCase() !== 'range')
    );
    if (typing) return;
    toggle();
    e.preventDefault();
  });

  // 3. Esc closes from anywhere, not only from inside the panel.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) { close(); e.preventDefault(); }
  });

  // 4. A visible link on any screen that has a footer slot for one. The
  //    static markup in index.html already carries one on the selection
  //    screen; this catches pages that do not (live.html), and never paints
  //    anything over the courtroom.
  const slot = document.getElementById('licenses-footer-slot');
  if (slot && !slot.querySelector('a')) {
    const a = document.createElement('a');
    a.className = 'licenses-footer-link';
    a.href = LIC_DIR + 'index.html';
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Credits & licences';
    slot.appendChild(a);
  }
}

// Exported so a caller can open it directly if one ever wants to. Nothing
// currently imports this module; it mounts itself.
export { open as openLicenses, close as closeLicenses, toggle as toggleLicenses };

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
