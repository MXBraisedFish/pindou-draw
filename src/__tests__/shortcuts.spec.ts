import { beforeEach, describe, expect, it } from 'vitest'
import {
  SHORTCUT_STORAGE_KEY,
  normalizeShortcutKey,
  useShortcuts,
} from '@/composables/useShortcuts'

describe('keyboard shortcuts', () => {
  beforeEach(() => {
    localStorage.removeItem(SHORTCUT_STORAGE_KEY)
    useShortcuts().resetShortcuts()
  })

  it('maps the default common shortcuts', () => {
    const { actionForKey } = useShortcuts()

    expect(actionForKey('1')).toBe('toolMove')
    expect(actionForKey('7')).toBe('toolGeometry')
    expect(actionForKey('s')).toBe('export')
    expect(actionForKey('z')).toBe('undo')
    expect(actionForKey('x')).toBe('redo')
    expect(actionForKey('n')).toBe('newProject')
  })

  it('stores a custom single key and rejects conflicts', () => {
    const { setShortcut, shortcuts } = useShortcuts()

    expect(setShortcut('export', 'e')).toBeNull()
    expect(shortcuts.value.export).toBe('E')
    expect(JSON.parse(localStorage.getItem(SHORTCUT_STORAGE_KEY) ?? '{}').export).toBe('E')
    expect(setShortcut('undo', 'E')).toBe('export')
    expect(shortcuts.value.undo).toBe('Z')
  })

  it('only accepts one supported key', () => {
    expect(normalizeShortcutKey('ab')).toBeNull()
    expect(normalizeShortcutKey('Control')).toBeNull()
    expect(normalizeShortcutKey(' ')).toBe('Space')
  })
})
