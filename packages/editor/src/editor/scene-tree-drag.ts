import { useState, type DragEvent } from 'react'
import type { DropTarget } from '../scene/ops'
import { isStringArray } from '../json-object'

/**
 * Drag-and-drop reordering inside the Explorer's scene tree: what is being
 * dragged, the drop slot under the pointer, and the reorder a drop asks for.
 */

/** What's being dragged inside the scene tree (dataTransfer is unreadable during dragover). */
export type TreeDrag =
  | { kind: 'entity'; name: string }
  | { kind: 'entities'; names: string[] }
  | { kind: 'folder'; name: string }

/** Drop slot under the pointer: row key ('e:Name' | 'f:Name' | 'end') + edge. */
export interface DropHint {
  key: string
  pos: 'before' | 'after' | 'into'
}

/** The reorders a drop can ask for. */
export interface ReorderHandlers {
  onReorderEntity: (name: string, target: DropTarget) => void
  onReorderEntities: (names: string[], target: DropTarget) => void
  onReorderFolder: (name: string, target: Exclude<DropTarget, { into: string }>) => void
  /** Opens a folder the user just put something into, so it doesn't vanish. */
  openFolder: (name: string) => void
}

/** The entity names a multi-entity drag carries, or null for a torn payload. */
function readDraggedNames(payload: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(payload)
    return isStringArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Where a drop slot puts the dragged rows. */
function dropTargetOf(slot: DropHint): DropTarget {
  if (slot.key === 'end') return 'end'
  const name = slot.key.slice(2)
  if (slot.key.startsWith('e:')) return slot.pos === 'before' ? { beforeEntity: name } : { afterEntity: name }
  if (slot.pos === 'into') return { into: name }
  return slot.pos === 'before' ? { beforeFolder: name } : { afterFolder: name }
}

/** Reorders what the drop's payload carries: a group of entities, one entity or a folder. */
function applyDrop(data: DataTransfer, target: DropTarget, handlers: ReorderHandlers): void {
  const groupJson = data.getData('waica/scene-entities')
  const entityName = data.getData('waica/scene-entity')
  const folderName = data.getData('waica/scene-folder')
  // Dropping into a shut folder would otherwise look like a delete.
  if (typeof target === 'object' && 'into' in target) handlers.openFolder(target.into)
  if (groupJson) {
    // A torn payload from another tab or app: nothing sane to do.
    const names = readDraggedNames(groupJson)
    if (names) handlers.onReorderEntities(names, target)
  } else if (entityName) handlers.onReorderEntity(entityName, target)
  else if (folderName && !(typeof target === 'object' && 'into' in target)) {
    handlers.onReorderFolder(folderName, target)
  }
}

/** Which half of the row under the pointer: the slot before it or after it. */
export function edgeOf(e: DragEvent): 'before' | 'after' {
  const r = e.currentTarget.getBoundingClientRect()
  return e.clientY < r.top + r.height / 2 ? 'before' : 'after'
}

/** The scene tree's drag state, the slot it would drop into, and the drop itself. */
export function useSceneTreeDrag(handlers: ReorderHandlers) {
  const [drag, setDrag] = useState<TreeDrag | null>(null)
  const [hint, setHint] = useState<DropHint | null>(null)

  const endDrag = (): void => {
    setDrag(null)
    setHint(null)
  }
  return {
    drag,
    setDrag,
    setHint,
    endDrag,
    /** The row's drop-slot class while the pointer is over it. */
    hintCls: (key: string): string => (hint?.key === key ? ` is-drop-${hint.pos}` : ''),
    /** Shared dragover logic: claim the drop and record the slot. */
    overSlot: (e: DragEvent, key: string, pos: DropHint['pos']): void => {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      if (hint?.key !== key || hint.pos !== pos) setHint({ key, pos })
    },
    /** Executes the drop recorded by the last dragover. */
    dropAt: (e: DragEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      const slot = hint
      endDrag()
      if (slot) applyDrop(e.dataTransfer, dropTargetOf(slot), handlers)
    },
  }
}

export type SceneTreeDrag = ReturnType<typeof useSceneTreeDrag>
