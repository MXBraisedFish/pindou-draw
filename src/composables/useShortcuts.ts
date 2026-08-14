import { computed, ref } from 'vue'

export type ShortcutAction =
  | 'toolMove'
  | 'toolPencil'
  | 'toolEraser'
  | 'toolBucket'
  | 'toolPicker'
  | 'toolSelect'
  | 'toolGeometry'
  | 'export'
  | 'undo'
  | 'redo'
  | 'newProject'

export interface ShortcutDefinition {
  action: ShortcutAction
  label: string
  defaultKey: string
}

export const SHORTCUT_STORAGE_KEY = 'pindou-shortcuts'

export const shortcutDefinitions: ShortcutDefinition[] = [
  { action: 'toolMove', label: '移动工具', defaultKey: '1' },
  { action: 'toolPencil', label: '铅笔工具', defaultKey: '2' },
  { action: 'toolEraser', label: '橡皮工具', defaultKey: '3' },
  { action: 'toolBucket', label: '填充工具', defaultKey: '4' },
  { action: 'toolPicker', label: '取色工具', defaultKey: '5' },
  { action: 'toolSelect', label: '选框工具', defaultKey: '6' },
  { action: 'toolGeometry', label: '几何工具', defaultKey: '7' },
  { action: 'export', label: '打开导出', defaultKey: 'S' },
  { action: 'undo', label: '撤销', defaultKey: 'Z' },
  { action: 'redo', label: '回退 / 重做', defaultKey: 'X' },
  { action: 'newProject', label: '新建', defaultKey: 'N' },
]

export type ShortcutMap = Record<ShortcutAction, string>

function createDefaults(): ShortcutMap {
  return Object.fromEntries(
    shortcutDefinitions.map(({ action, defaultKey }) => [action, defaultKey]),
  ) as ShortcutMap
}

export function normalizeShortcutKey(key: string): string | null {
  if (key === ' ') return 'Space'
  if (key.length === 1) return key.toUpperCase()
  const supported = new Set([
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Enter',
    'Escape',
    'Backspace',
    'Delete',
    'Tab',
  ])
  return supported.has(key) ? key : null
}

function readStoredShortcuts(): ShortcutMap {
  const defaults = createDefaults()
  try {
    const raw = localStorage.getItem(SHORTCUT_STORAGE_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<Record<ShortcutAction, unknown>>
    for (const definition of shortcutDefinitions) {
      const value = parsed[definition.action]
      if (typeof value === 'string' && normalizeShortcutKey(value)) {
        defaults[definition.action] = normalizeShortcutKey(value)!
      }
    }
  } catch {
    // Invalid local settings fall back to the defaults.
  }
  return defaults
}

const shortcuts = ref<ShortcutMap>(readStoredShortcuts())

function persist() {
  localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(shortcuts.value))
}

export function useShortcuts() {
  const shortcutRows = computed(() =>
    shortcutDefinitions.map((definition) => ({
      ...definition,
      key: shortcuts.value[definition.action],
    })),
  )

  function setShortcut(action: ShortcutAction, key: string): ShortcutAction | null {
    const normalized = normalizeShortcutKey(key)
    if (!normalized) return null
    const conflict = shortcutDefinitions.find(
      (definition) =>
        definition.action !== action && shortcuts.value[definition.action] === normalized,
    )
    if (conflict) return conflict.action
    shortcuts.value = { ...shortcuts.value, [action]: normalized }
    persist()
    return null
  }

  function resetShortcuts() {
    shortcuts.value = createDefaults()
    persist()
  }

  function actionForKey(key: string): ShortcutAction | null {
    const normalized = normalizeShortcutKey(key)
    if (!normalized) return null
    return (
      shortcutDefinitions.find((definition) => shortcuts.value[definition.action] === normalized)
        ?.action ?? null
    )
  }

  return { shortcuts, shortcutRows, setShortcut, resetShortcuts, actionForKey }
}
