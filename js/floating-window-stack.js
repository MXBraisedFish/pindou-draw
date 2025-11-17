const WINDOW_BASE_Z = 70;
const WINDOW_MAX_Z = 78;
const registeredWindows = new Set();
let zCursor = WINDOW_BASE_Z;

function updateTopClass(target) {
  registeredWindows.forEach((win) => {
    win.classList.toggle('is-topmost', win === target);
  });
}

function normalizeZOrder() {
  const ordered = Array.from(registeredWindows)
    .filter(Boolean)
    .sort((a, b) => Number(a.style.zIndex || WINDOW_BASE_Z) - Number(b.style.zIndex || WINDOW_BASE_Z));
  zCursor = WINDOW_BASE_Z;
  ordered.forEach((win) => {
    zCursor += 1;
    win.style.zIndex = String(zCursor);
  });
}

function ensureZIndex(element) {
  const current = Number(element.style.zIndex);
  if (Number.isFinite(current) && current > 0) {
    zCursor = Math.max(zCursor, current);
    if (zCursor >= WINDOW_MAX_Z) {
      normalizeZOrder();
    }
    return;
  }
  zCursor += 1;
  element.style.zIndex = String(zCursor);
  if (zCursor >= WINDOW_MAX_Z) {
    normalizeZOrder();
  }
}

function bringToFrontInternal(element) {
  if (!element) return;
  zCursor += 1;
  element.style.zIndex = String(zCursor);
  if (zCursor >= WINDOW_MAX_Z) {
    normalizeZOrder();
  }
  updateTopClass(element);
}

export function registerFloatingWindow(element) {
  if (!element) return null;
  registeredWindows.add(element);
  ensureZIndex(element);

  const pointerHandler = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    bringToFrontInternal(element);
  };

  element.addEventListener('pointerdown', pointerHandler, { capture: true });

  return {
    bringToFront: () => bringToFrontInternal(element),
    destroy: () => {
      element.removeEventListener('pointerdown', pointerHandler, { capture: true });
      registeredWindows.delete(element);
    }
  };
}

export function bringFloatingWindowToFront(element) {
  bringToFrontInternal(element);
}
