import { state } from '../state.js';
import { clampCellSize } from '../utils.js';

export function resolveResolutionValue(rawValue) {
  const fallback = Number.isFinite(state.pixelRatio) && state.pixelRatio > 0
    ? state.pixelRatio
    : state.defaultCellSize || 10;

  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (trimmed.length) {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed) && parsed > 0) {
        return clampCellSize(parsed);
      }
    }
  } else if (Number.isFinite(rawValue) && rawValue > 0) {
    return clampCellSize(rawValue);
  }

  return clampCellSize(fallback);
}

export function handleResolutionInputChange(event) {
  const input = event?.target ?? event;
  if (!input) return state.pixelRatio;

  const normalized = resolveResolutionValue(input.value);
  input.value = String(normalized);
  state.pixelRatio = normalized;

  return normalized;
}
