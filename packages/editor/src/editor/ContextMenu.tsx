import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface MenuItem {
  label: string
  icon?: string
  danger?: boolean
  disabled?: boolean
  /** Tooltip; use it to explain WHY an item is disabled. */
  title?: string
  onClick(): void
}

/** 'sep' draws a divider between item groups. */
export type MenuEntry = MenuItem | 'sep'

export interface MenuState {
  x: number
  y: number
  entries: MenuEntry[]
}

export function ContextMenu({ menu, onClose }: { menu: MenuState; onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: menu.x, y: menu.y })

  // Keep the menu inside the viewport (open near an edge flips it inward).
  useLayoutEffect(() => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    setPos({
      x: Math.max(4, Math.min(menu.x, window.innerWidth - rect.width - 4)),
      y: Math.max(4, Math.min(menu.y, window.innerHeight - rect.height - 4)),
    })
  }, [menu])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  return (
    <div
      className="ed-ctx-backdrop"
      onMouseDown={onClose}
      onContextMenu={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <div
        ref={ref}
        className="ed-ctx"
        style={{ left: pos.x, top: pos.y }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {menu.entries.map((entry, i) =>
          entry === 'sep' ? (
            <div key={i} className="ed-ctx-sep" />
          ) : (
            <button
              key={i}
              className={`ed-ctx-item ${entry.danger ? 'is-danger' : ''}`}
              disabled={entry.disabled}
              title={entry.title}
              onClick={() => {
                onClose()
                entry.onClick()
              }}
            >
              <span className="ed-ctx-ico">{entry.icon ?? ''}</span>
              {entry.label}
            </button>
          ),
        )}
      </div>
    </div>
  )
}
