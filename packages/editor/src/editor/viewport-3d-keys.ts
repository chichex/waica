// The keyboard of the 3D edit view (issue #173): arrows, Shift+arrows, + and -
// navigate while the viewport element has focus (CA-11); F frames the
// selection from anywhere but a field being typed in (CA-15, inference 9).
import { useEffect, useEffectEvent, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'
import type { EditView3d } from './viewport-3d-view'

/** One key's move: an orbit or pan step (yaw/right, pitch/up), or a zoom factor. */
type NavigationStep = { kind: 'orbit' | 'pan'; x: number; y: number } | { kind: 'zoom'; factor: number }

const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
}

function navigationStep(event: Pick<KeyboardEvent, 'key' | 'shiftKey'>): NavigationStep | null {
  const arrow = ARROWS[event.key]
  if (arrow) return { kind: event.shiftKey ? 'pan' : 'orbit', x: arrow[0], y: arrow[1] }
  if (event.key === '+' || event.key === '=') return { kind: 'zoom', factor: 1 / 1.1 }
  if (event.key === '-' || event.key === '_') return { kind: 'zoom', factor: 1.1 }
  return null
}

/** Moves the Editor Camera for a key pressed on the focused viewport element; false for any other key. */
export function navigate3d(view: EditView3d, event: ReactKeyboardEvent<HTMLElement>): boolean {
  if (!view.isActive() || event.ctrlKey || event.metaKey || event.altKey) return false
  const step = navigationStep(event)
  if (!step) return false
  event.preventDefault()
  if (step.kind === 'zoom') view.camera.zoom(step.factor)
  else if (step.kind === 'orbit') view.camera.orbit(step.x, step.y)
  else view.camera.pan(step.x, step.y)
  return true
}

/** Focus in a field being typed in, or in Monaco: the editor's single-letter shortcuts stay out of it. */
export function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('input, textarea, select, [contenteditable], .monaco-editor') !== null
}

/** The 3D edit view's single-letter shortcuts, on the window: F frames the selection. */
export function useViewport3dShortcuts(view3dRef: RefObject<EditView3d | null>): void {
  const onKey = useEffectEvent((event: KeyboardEvent): void => {
    const view = view3dRef.current
    if (!view || event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return
    if (event.key.toLowerCase() !== 'f') return
    event.preventDefault()
    view.frameSelection()
  })
  useEffect(() => {
    const listener = (event: KeyboardEvent): void => onKey(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])
}
