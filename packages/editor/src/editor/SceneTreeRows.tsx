import type { DragEvent } from 'react'
import type { SceneEntityJson } from '@waica/engine'
import type { ArchetypeManifest } from '../project/archetype'
import type { MenuEntry } from './ContextMenu'
import type { ExplorerProps, OpenMenu, Renaming } from './explorer-props'
import { entityIcon } from './icons'
import { RenameInput } from './RenameInput'
import { edgeOf, type SceneTreeDrag } from './scene-tree-drag'

/** The Explorer props the scene tree's rows read and call. */
export type SceneTreeProps = Pick<
  ExplorerProps,
  | 'view'
  | 'selected'
  | 'multi'
  | 'prefabLib'
  | 'sceneFolders'
  | 'onSelectEntity'
  | 'onToggleEntity'
  | 'onRangeEntities'
  | 'onRenameEntity'
  | 'onRenameFolder'
  | 'onDissolveFolder'
  | 'onDeleteFolder'
  | 'onReorderEntity'
  | 'onReorderEntities'
  | 'onDuplicateEntity'
  | 'onDeleteEntity'
  | 'onDuplicateEntities'
  | 'onDeleteEntities'
>

/** Everything a row of the open scene's tree needs: data, drag state, rename and menus. */
export interface SceneTree {
  props: SceneTreeProps
  archetype: ArchetypeManifest
  /** The scene's folder names, in tree order. */
  folders: string[]
  /** Shift-click range: from the anchor (the selected entity) to the clicked row. */
  rangeTo: (name: string) => string[]
  dnd: SceneTreeDrag
  renaming: Renaming
  openMenu: OpenMenu
}

/** Menu of a right-click inside the multi-selection: it acts on the whole group. */
function groupMenu({ props, folders }: SceneTree): MenuEntry[] {
  const { multi } = props
  const n = multi.length
  const moveTo: MenuEntry[] = folders.map((f) => ({
    label: `Move to ${f}`,
    icon: '📁',
    onClick: () => props.onReorderEntities(multi, { into: f }),
  }))
  moveTo.push({ label: 'Move to root', icon: '⤴', onClick: () => props.onReorderEntities(multi, 'end') })
  return [
    { label: `Duplicate ${n} entities`, icon: '⧉', onClick: () => props.onDuplicateEntities(multi) },
    'sep',
    ...moveTo,
    'sep',
    { label: `Delete ${n} entities`, icon: '🗑', danger: true, onClick: () => props.onDeleteEntities(multi) },
  ]
}

/** Menu of one entity: rename, duplicate, move to another folder or the root, delete. */
function entityMenu(entity: SceneEntityJson, { props, folders, renaming }: SceneTree): MenuEntry[] {
  const moveTo: MenuEntry[] = folders
    .filter((f) => f !== entity.folder)
    .map((f) => ({
      label: `Move to ${f}`,
      icon: '📁',
      onClick: () => props.onReorderEntity(entity.name, { into: f }),
    }))
  if (entity.folder) {
    moveTo.push({ label: 'Move to root', icon: '⤴', onClick: () => props.onReorderEntity(entity.name, 'end') })
  }
  return [
    { label: 'Rename', icon: '✏️', onClick: () => renaming.setEditing({ kind: 'entity', name: entity.name }) },
    { label: 'Duplicate', icon: '⧉', onClick: () => props.onDuplicateEntity(entity.name) },
    ...(moveTo.length > 0 ? (['sep', ...moveTo] satisfies MenuEntry[]) : []),
    'sep',
    { label: 'Delete', icon: '🗑', danger: true, onClick: () => props.onDeleteEntity(entity.name) },
  ]
}

/** Whether the row may take the current drag: never itself, and folders don't nest. */
function acceptsDrag(drag: SceneTreeDrag['drag'], entity: SceneEntityJson, inFolder: boolean): boolean {
  if (!drag) return false
  if (drag.kind === 'entity' && drag.name === entity.name) return false
  if (drag.kind === 'entities' && drag.names.includes(entity.name)) return false
  // Folders don't nest: a folder can't land between a folder's members.
  return !(drag.kind === 'folder' && inFolder)
}

/**
 * An entity row's drag-and-drop: it drags itself, or the whole
 * multi-selection it belongs to, and takes drops before or after itself.
 */
function entityDragHandlers(entity: SceneEntityJson, inFolder: boolean, { props, dnd }: SceneTree) {
  const inMulti = props.multi.includes(entity.name)
  return {
    draggable: true,
    onDragStart: (e: DragEvent): void => {
      e.dataTransfer.effectAllowed = 'move'
      if (inMulti) {
        e.dataTransfer.setData('waica/scene-entities', JSON.stringify(props.multi))
        dnd.setDrag({ kind: 'entities', names: props.multi })
      } else {
        e.dataTransfer.setData('waica/scene-entity', entity.name)
        dnd.setDrag({ kind: 'entity', name: entity.name })
      }
    },
    onDragEnd: dnd.endDrag,
    onDragOver: (e: DragEvent): void => {
      if (acceptsDrag(dnd.drag, entity, inFolder)) dnd.overSlot(e, `e:${entity.name}`, edgeOf(e))
    },
    onDrop: dnd.dropAt,
  }
}

/** One entity of the scene tree: select, range, toggle, rename, drag and its menu. */
export function EntityRow({
  entity,
  inFolder,
  tree,
}: {
  entity: SceneEntityJson
  inFolder: boolean
  tree: SceneTree
}) {
  const { props, dnd, renaming } = tree
  const icon = <span className="ed-x-ico">{entityIcon(entity, props.prefabLib, tree.archetype)}</span>
  if (renaming.editing?.kind === 'entity' && renaming.editing.name === entity.name) {
    return (
      <div className={`ed-x-item is-editing ${inFolder ? 'is-in-folder' : ''}`}>
        {icon}
        <RenameInput
          value={entity.name}
          onCommit={(next) => {
            renaming.setEditing(null)
            props.onRenameEntity(entity.name, next)
          }}
          onCancel={() => renaming.setEditing(null)}
        />
      </div>
    )
  }
  const inMulti = props.multi.includes(entity.name)
  const selected = props.view?.kind === 'scene' && (props.selected === entity.name || inMulti)
  return (
    <button
      className={`ed-x-item ${inFolder ? 'is-in-folder' : ''} ${selected ? 'is-selected' : ''}${dnd.hintCls(`e:${entity.name}`)}`}
      {...entityDragHandlers(entity, inFolder, tree)}
      onClick={(e) => {
        if (e.shiftKey) props.onRangeEntities(tree.rangeTo(entity.name))
        else if (e.metaKey || e.ctrlKey) props.onToggleEntity(entity.name)
        else props.onSelectEntity(entity.name)
      }}
      onDoubleClick={() => renaming.setEditing({ kind: 'entity', name: entity.name })}
      onContextMenu={(e) => {
        if (inMulti) return tree.openMenu(e, groupMenu(tree))
        props.onSelectEntity(entity.name)
        tree.openMenu(e, entityMenu(entity, tree))
      }}
    >
      {icon}
      {entity.name}
    </button>
  )
}

/** Menu of one folder: rename, dissolve (keeping its entities) or delete it with them. */
function folderMenu(name: string, { props, renaming }: SceneTree): MenuEntry[] {
  return [
    { label: 'Rename', icon: '✏️', onClick: () => renaming.setEditing({ kind: 'folder', name }) },
    { label: 'Dissolve (keep entities)', icon: '📂', onClick: () => props.onDissolveFolder(name) },
    'sep',
    { label: 'Delete with entities', icon: '🗑', danger: true, onClick: () => props.onDeleteFolder(name) },
  ]
}

/** One folder of the scene tree with, when expanded, its entities below it. */
export function FolderRow({ name, entities, tree }: { name: string; entities: SceneEntityJson[]; tree: SceneTree }) {
  const expanded = tree.props.sceneFolders.expanded.has(name)
  const editing = tree.renaming.editing?.kind === 'folder' && tree.renaming.editing.name === name
  return (
    <div>
      {editing ? (
        <div className="ed-x-item ed-x-folder is-editing">
          <FolderGlyphs expanded={expanded} />
          <RenameInput
            value={name}
            onCommit={(next) => {
              tree.renaming.setEditing(null)
              tree.props.onRenameFolder(name, next)
            }}
            onCancel={() => tree.renaming.setEditing(null)}
          />
        </div>
      ) : (
        <FolderButton name={name} count={entities.length} expanded={expanded} tree={tree} />
      )}
      {expanded && entities.map((entity) => <EntityRow key={entity.name} entity={entity} inFolder tree={tree} />)}
    </div>
  )
}

/** A folder's caret and icon, open or shut. */
function FolderGlyphs({ expanded }: { expanded: boolean }) {
  return (
    <>
      <span className="ed-x-caret">{expanded ? '▾' : '▸'}</span>
      <span className="ed-x-ico">{expanded ? '📂' : '📁'}</span>
    </>
  )
}

interface FolderButtonProps {
  name: string
  /** Entities in the folder. */
  count: number
  expanded: boolean
  tree: SceneTree
}

/** A folder's row: toggle (alt-click syncs every folder), rename, drag, drop into, and its menu. */
function FolderButton({ name, count, expanded, tree }: FolderButtonProps) {
  const { dnd, props } = tree
  return (
    <button
      className={`ed-x-item ed-x-folder${dnd.hintCls(`f:${name}`)}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('waica/scene-folder', name)
        e.dataTransfer.effectAllowed = 'move'
        dnd.setDrag({ kind: 'folder', name })
      }}
      onDragEnd={dnd.endDrag}
      onDragOver={(e) => {
        if (!dnd.drag) return
        if (dnd.drag.kind !== 'folder') dnd.overSlot(e, `f:${name}`, 'into')
        else if (dnd.drag.name !== name) dnd.overSlot(e, `f:${name}`, edgeOf(e))
      }}
      onDrop={dnd.dropAt}
      onClick={(e) => {
        // Alt-click syncs every folder to this one's next state.
        if (e.altKey) props.sceneFolders.setAll(expanded ? [] : tree.folders)
        else props.sceneFolders.toggle(name)
      }}
      onDoubleClick={() => tree.renaming.setEditing({ kind: 'folder', name })}
      onContextMenu={(e) => tree.openMenu(e, folderMenu(name, tree))}
    >
      <FolderGlyphs expanded={expanded} />
      {name}
      <span className="ed-x-count">{count}</span>
    </button>
  )
}
