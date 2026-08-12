const RIGHT_TOOLBAR_SELECTOR = '.toolbar-right';

export function computeRightToolbarAnchor(width, margin = 24) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;
  const toolbar = document.querySelector(RIGHT_TOOLBAR_SELECTOR);
  if (!toolbar) return null;
  const rect = toolbar.getBoundingClientRect();
  const toolbarLeft = rect.left;
  const windowWidth = Math.max(0, Number(width) || 0);
  let candidate = toolbarLeft - windowWidth - margin;
  if (!Number.isFinite(candidate)) return null;
  const minLeft = margin;
  const maxLeft = Math.max(minLeft, window.innerWidth - windowWidth - margin);
  return Math.min(Math.max(candidate, minLeft), maxLeft);
}
