
const LIC_DIR = new URL('../licenses/', import.meta.url).href;

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
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { close(); e.stopPropagation(); }
  });

  const body = panel.querySelector('.lic-body');
  if (body) {
    body.tabIndex = 0;
    body.addEventListener('wheel', (e) => {
      const before = body.scrollTop;
      body.scrollTop += e.deltaY;
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

function mount() {
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

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) { close(); e.preventDefault(); }
  });

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

export { open as openLicenses, close as closeLicenses, toggle as toggleLicenses };

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
