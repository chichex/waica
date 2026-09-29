import { useEffect } from 'react'

/**
 * Calls `onEscape` whenever Escape is pressed anywhere in the window, for as
 * long as the calling component is mounted — how editor modals close from
 * the keyboard.
 */
export function useEscapeKey(onEscape: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onEscape()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onEscape])
}
