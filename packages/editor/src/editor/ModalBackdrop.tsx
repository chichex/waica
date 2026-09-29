import type { ReactNode } from 'react'

/**
 * The dimmed layer behind an editor modal. A press on the layer itself (not
 * on the modal) dismisses it — a pointer shortcut only: every modal also has
 * its own Cancel or close button, so the layer is presentational.
 */
export function ModalBackdrop({ onDismiss, children }: { onDismiss: () => void; children: ReactNode }) {
  return (
    <div
      className="ed-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onDismiss()
      }}
    >
      {children}
    </div>
  )
}
