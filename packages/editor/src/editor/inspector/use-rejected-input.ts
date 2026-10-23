import { useCallback, useLayoutEffect, useRef, useState } from 'react'

/** Recover only the rejected focused draft, never a later undo or selection change. */
export function useRejectedInput() {
  const root = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef(false)
  const [revision, setRevision] = useState(0)
  const resetInput = (): void => {
    pendingFocus.current = root.current?.contains(document.activeElement) ?? false
    setRevision((previous) => previous + 1)
  }
  useLayoutEffect(() => {
    if (!pendingFocus.current) return
    pendingFocus.current = false
    root.current?.querySelector<HTMLInputElement | HTMLSelectElement>('input[type="number"], select')?.focus()
  }, [revision])
  const attach = useCallback((element: HTMLDivElement | null) => { root.current = element }, [])
  return { attach, revision, resetInput }
}
