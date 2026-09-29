import { useEffect, useEffectEvent } from 'react'

export type EditorShortcut = 'duplicate' | 'group' | 'undo' | 'redo'

/**
 * The editor's global Cmd/Ctrl shortcuts: undo, redo, duplicate and group.
 * Focus in a text field or Monaco keeps the native text undo.
 */
export function useEditorShortcuts(run: (shortcut: EditorShortcut) => void): void {
  // Non-reactive: the mount-once key listener runs the latest handlers.
  const runShortcut = useEffectEvent((shortcut: EditorShortcut): void => run(shortcut))

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const shortcut = shortcutOf(e)
      if (!shortcut || keepsNativeUndo(e.target)) return
      e.preventDefault()
      runShortcut(shortcut)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function shortcutOf(e: KeyboardEvent): EditorShortcut | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return null
  const key = e.key.toLowerCase()
  if (key === 'z' || key === 'y') return historyShortcutOf(e, key)
  // defaultPrevented: the Explorer tree handles its own Cmd/Ctrl+D.
  if (e.shiftKey || e.defaultPrevented) return null
  if (key === 'd') return 'duplicate'
  return key === 'g' ? 'group' : null
}

/** Cmd/Ctrl+Z undoes; Cmd/Ctrl+Shift+Z and Ctrl+Y redo. */
function historyShortcutOf(e: KeyboardEvent, key: 'z' | 'y'): EditorShortcut | null {
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo'
  return !e.metaKey && !e.shiftKey ? 'redo' : null
}

/**
 * Focus in a text field or Monaco keeps the native text undo. Non-text
 * controls (checkboxes, sliders…) have none, so the global undo applies.
 */
function keepsNativeUndo(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : null
  if (!el) return false
  if (el.closest('textarea, [contenteditable], .monaco-editor')) return true
  const input = el.closest('input')
  return Boolean(input && !['checkbox', 'radio', 'range', 'color'].includes(input.type))
}
