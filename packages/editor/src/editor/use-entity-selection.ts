import { useState, type Dispatch, type SetStateAction } from 'react'
import type { SceneJson } from '@waica/engine'
import * as ops from '../scene/ops'

/**
 * What is picked in the open scene: one entity (or the camera node), and a
 * multi-selection that is [] or 2+ entity names, never one.
 */
export interface EntitySelection {
  selected: string | null
  setSelected: Dispatch<SetStateAction<string | null>>
  multi: string[]
  setMulti: Dispatch<SetStateAction<string[]>>
  selectEntity: (name: string | null) => void
  /** Cmd/Ctrl-click: grows/shrinks the multi-selection, seeded from the single selection. */
  toggleEntity: (name: string) => void
  /** Shift-click range / select-all: the run replaces the selection wholesale. */
  rangeEntities: (names: string[]) => void
  clearSelection: () => void
  /** Drops the single and the multi-selection at once. */
  clear: () => void
}

export function useEntitySelection(scene: SceneJson | null): EntitySelection {
  const [selected, setSelected] = useState<string | null>(null)
  const [multi, setMulti] = useState<string[]>([])

  const selectEntity = (name: string | null): void => {
    setSelected(name)
    setMulti([])
  }

  const toggleEntity = (name: string): void => {
    if (!scene) return
    const next = toggled(scene, { selected, multi }, name)
    setMulti(next.multi)
    if (next.selected !== undefined) setSelected(next.selected)
  }

  const rangeEntities = (names: string[]): void => {
    const [first, ...others] = names
    if (first === undefined) return
    if (others.length === 0) {
      selectEntity(first)
      return
    }
    setMulti(names)
    if (!selected || !names.includes(selected)) setSelected(first)
  }

  return {
    selected,
    setSelected,
    multi,
    setMulti,
    selectEntity,
    toggleEntity,
    rangeEntities,
    clearSelection: () => {
      if (multi.length > 0) setMulti([])
      else setSelected(null)
    },
    clear: () => selectEntity(null),
  }
}

/**
 * Cmd/Ctrl-click on `name`: the selection it leaves. `selected` is undefined
 * when the single selection stays as it is.
 */
function toggled(
  scene: SceneJson,
  current: { selected: string | null; multi: string[] },
  name: string,
): { selected?: string | null; multi: string[] } {
  const { selected, multi } = current
  const single = selected && ops.findEntity(scene, selected) ? [selected] : []
  const base = multi.length > 0 ? multi : single
  const next = base.includes(name) ? base.filter((n) => n !== name) : [...base, name]
  // Below two names there is no multi-selection, only the single one (or none).
  const [first = null, ...others] = next
  if (others.length === 0) return { selected: first, multi: [] }
  return { selected: !selected || !next.includes(selected) ? first : undefined, multi: next }
}
