// FIELD-TEST-BUILD-001 (web lane) -- reusable popup-window chrome: a title
// bar with minimize/maximize/close, so any future popup this build adds
// (not just the difficulty/settings popup below) gets the same consistent
// behavior for free. State (normal/minimized/maximized/closed) lives as
// CSS classes + a data-popup-state attribute directly ON the popup
// element itself, not in a private JS variable no external caller (or
// test) could otherwise read back -- same "current state legible on the
// control itself" discipline camera_controller.js's aria-pressed preset
// buttons already use (Rule 129).
//
// Expects the popup element to contain, somewhere inside it:
//   .popup-titlebar > .popup-min-btn / .popup-max-btn / .popup-close-btn
// (see web/index.html's #settings-popup for the exact markup shape this
// was built against.)

export function attachPopupChrome(popupEl, opts = {}) {
  const minBtn = popupEl.querySelector('.popup-min-btn');
  const maxBtn = popupEl.querySelector('.popup-max-btn');
  const closeBtn = popupEl.querySelector('.popup-close-btn');

  function setState(next) {
    popupEl.classList.remove('minimized', 'maximized');
    if (next === 'minimized') popupEl.classList.add('minimized');
    if (next === 'maximized') popupEl.classList.add('maximized');
    popupEl.dataset.popupState = next;
    if (minBtn) minBtn.setAttribute('aria-pressed', String(next === 'minimized'));
    if (maxBtn) maxBtn.setAttribute('aria-pressed', String(next === 'maximized'));
    if (opts.onStateChange) opts.onStateChange(next);
  }

  if (minBtn) {
    minBtn.addEventListener('click', () => {
      setState(popupEl.dataset.popupState === 'minimized' ? 'normal' : 'minimized');
    });
  }
  if (maxBtn) {
    maxBtn.addEventListener('click', () => {
      setState(popupEl.dataset.popupState === 'maximized' ? 'normal' : 'maximized');
    });
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      popupEl.classList.add('hidden');
      popupEl.dataset.popupState = 'closed';
      if (opts.onClose) opts.onClose();
    });
  }

  // Starts closed (index.html ships #settings-popup with class="hidden") --
  // a fresh popup shouldn't claim 'normal' state on a page nobody has
  // opened it on yet. The gear button in main.js's UI is what actually
  // opens it, via open() below.
  popupEl.dataset.popupState = popupEl.classList.contains('hidden') ? 'closed' : 'normal';

  return {
    open() {
      popupEl.classList.remove('hidden');
      if (popupEl.dataset.popupState === 'closed') setState('normal');
    },
    close() {
      if (closeBtn) closeBtn.click();
    },
    getState() {
      return popupEl.dataset.popupState;
    },
  };
}
