import { useRef, useState } from 'react'
import type { PrefabJson, SceneEntityJson, SceneJson } from '@waica/engine'
import { ACTIVE_ARCHETYPE } from '../project/archetype'
import type { ProjectFS } from '../fs/project-fs'
import { behaviourTypes } from '../project/chassis'
import { CAMERA_NODE, sceneTree, type DropTarget } from '../scene/ops'
import { ContextMenu, type MenuEntry, type MenuState } from './ContextMenu'
import { entityIcon, prefabIcon, sceneLabel } from './icons'
import type { ArtItem } from './use-project-art'

/** What the center pane (and the inspector) is looking at. */
export type ExplorerView =
  | { kind: 'scene'; path: string }
  | { kind: 'prefab'; ref: string }
  | { kind: 'ui'; name: string }
  | { kind: 'script'; name: string }
  | { kind: 'art'; label: string; url: string }
  | { kind: 'controls' }
  | { kind: 'stats' }
  | { kind: 'game' }

const PREFAB_GROUPS: Array<{ title: string; type: PrefabJson['type']; createLabel: string }> = [
  { title: 'Characters', type: 'character', createLabel: 'New character' },
  { title: 'Objects', type: 'object', createLabel: 'New object' },
  { title: 'Tiles', type: 'tile', createLabel: 'New tile' },
]

/** Core chassis components (Sprite, Solid…) are not scripts: only behaviours list here. */
const BUILTIN_COMPONENTS = behaviourTypes(Object.keys(ACTIVE_ARCHETYPE.registry.components))

/** No project-authored components yet: this stays empty until that feature ships. */
const CUSTOM_COMPONENTS: string[] = []

export function refBase(ref: string): string {
  return ref.slice(ref.indexOf('/') + 1)
}

/** Inline rename field shown in place of a row's label. */
function RenameInput({
  value,
  onCommit,
  onCancel,
}: {
  value: string
  onCommit(next: string): void
  onCancel(): void
}) {
  const [text, setText] = useState(value)
  return (
    <input
      className="ed-x-edit"
      value={text}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setText(e.currentTarget.value)}
      onBlur={() => onCommit(text)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') onCommit(text)
        if (e.key === 'Escape') onCancel()
      }}
    />
  )
}

export function Explorer({
  fs,
  scenePaths,
  openScenePath,
  scene,
  view,
  selected,
  multi,
  prefabLib,
  uiLib,
  art,
  onImportArt,
  onRefreshArt,
  onOpenScene,
  onSelectEntity,
  onToggleEntity,
  onRangeEntities,
  onClearSelection,
  onSelectCamera,
  onAddEntity,
  onCreateScene,
  onCreateFolder,
  onRenameFolder,
  onDissolveFolder,
  onDeleteFolder,
  onReorderEntity,
  onReorderFolder,
  onOpenPrefab,
  onOpenScript,
  onOpenArt,
  onOpenControls,
  onOpenStats,
  onOpenGame,
  onDuplicateScene,
  onDeleteScene,
  onDuplicateEntity,
  onDeleteEntity,
  onRenameEntity,
  onDeleteEntities,
  onDuplicateEntities,
  onReorderEntities,
  onCreatePrefab,
  onDuplicatePrefab,
  onDeletePrefab,
  onAddPrefabToScene,
  onOpenUi,
  onCreateUi,
  onDuplicateUi,
  onDeleteUi,
  onToggleUiInScene,
  onArtDeleted,
}: {
  fs: ProjectFS
  scenePaths: string[]
  openScenePath: string | null
  /** The open scene's contents (for the expanded entity subtree). */
  scene: SceneJson | null
  view: ExplorerView | null
  selected: string | null
  /** Multi-selection (shift/cmd click): [] or 2+ names — never a single one. */
  multi: string[]
  prefabLib: Record<string, PrefabJson>
  uiLib: Record<string, string>
  art: ArtItem[]
  onImportArt(files: File[]): Promise<void>
  onRefreshArt(): void
  onOpenScene(path: string): void
  onSelectEntity(name: string): void
  /** Cmd/Ctrl-click: toggles the entity in the multi-selection. */
  onToggleEntity(name: string): void
  /** Shift-click / select-all: replaces the selection with this run. */
  onRangeEntities(names: string[]): void
  /** Escape: drops the multi-selection first, then the single selection. */
  onClearSelection(): void
  /** Selects the open scene's built-in camera. */
  onSelectCamera(): void
  onAddEntity(): void
  onCreateScene(): void
  onCreateFolder(): void
  onRenameFolder(from: string, to: string): void
  /** Removes the folder, moving its entities back to root level. */
  onDissolveFolder(name: string): void
  /** Removes the folder AND its entities. */
  onDeleteFolder(name: string): void
  onReorderEntity(name: string, target: DropTarget): void
  onReorderFolder(name: string, target: Exclude<DropTarget, { into: string }>): void
  onOpenPrefab(ref: string): void
  onOpenScript(name: string): void
  onOpenArt(item: ArtItem): void
  onOpenControls(): void
  onOpenStats(): void
  onOpenGame(): void
  onDuplicateScene(path: string): void
  onDeleteScene(path: string): void
  onDuplicateEntity(name: string): void
  onDeleteEntity(name: string): void
  onRenameEntity(from: string, to: string): void
  onDeleteEntities(names: string[]): void
  onDuplicateEntities(names: string[]): void
  onReorderEntities(names: string[], target: DropTarget): void
  onCreatePrefab(type: PrefabJson['type']): void
  onDuplicatePrefab(ref: string): void
  onDeletePrefab(ref: string): void
  onAddPrefabToScene(ref: string): void
  onOpenUi(name: string): void
  onCreateUi(): void
  onDuplicateUi(name: string): void
  onDeleteUi(name: string): void
  /** Adds/removes the piece from the open scene's "ui" start list. */
  onToggleUiInScene(name: string): void
  onArtDeleted(label: string): void
}) {
  const [dropping, setDropping] = useState(false)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  /** Row being renamed inline (double-click, F2 or the context menu). */
  const [editing, setEditing] = useState<{ kind: 'entity' | 'folder'; name: string } | null>(null)
  /** What's being dragged inside the scene tree (dataTransfer is unreadable during dragover). */
  const [drag, setDrag] = useState<
    | { kind: 'entity'; name: string }
    | { kind: 'entities'; names: string[] }
    | { kind: 'folder'; name: string }
    | null
  >(null)
  /** Drop slot under the pointer: row key ('e:Name' | 'f:Name' | 'end') + edge. */
  const [hint, setHint] = useState<{ key: string; pos: 'before' | 'after' | 'into' } | null>(null)
  const filePicker = useRef<HTMLInputElement>(null)

  const openMenu = (e: React.MouseEvent, entries: MenuEntry[]): void => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, entries })
  }

  const rows = scene ? sceneTree(scene) : []
  const folders = rows.filter((r) => r.kind === 'folder').map((r) => r.name)

  /** Entity names as displayed, skipping collapsed folders — the space shift-ranges live in. */
  const visibleEntities = rows.flatMap((r) =>
    r.kind === 'entity'
      ? [r.entity.name]
      : collapsed.has(r.name)
        ? []
        : r.entities.map((e) => e.name),
  )

  /** Shift-click range: from the anchor (the selected entity) to the clicked row. */
  const rangeTo = (name: string): string[] => {
    const a = selected ? visibleEntities.indexOf(selected) : -1
    const b = visibleEntities.indexOf(name)
    if (a < 0 || b < 0) return [name]
    return visibleEntities.slice(Math.min(a, b), Math.max(a, b) + 1)
  }

  /** The names a bulk action applies to: the multi-selection, or the selected entity. */
  const selectionGroup = (): string[] => {
    if (multi.length > 1) return multi
    if (selected && scene?.entities.some((e) => e.name === selected)) return [selected]
    return []
  }

  const treeKeys = (e: React.KeyboardEvent): void => {
    if (editing) return
    const group = selectionGroup()
    const mod = e.metaKey || e.ctrlKey
    if ((e.key === 'Delete' || e.key === 'Backspace') && group.length > 0) {
      e.preventDefault()
      onDeleteEntities(group)
    } else if (e.key === 'F2' && group.length === 1) {
      e.preventDefault()
      setEditing({ kind: 'entity', name: group[0]! })
    } else if (mod && e.key.toLowerCase() === 'd' && group.length > 0) {
      e.preventDefault()
      onDuplicateEntities(group)
    } else if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      if (visibleEntities.length > 0) onRangeEntities(visibleEntities)
    } else if (e.key === 'Escape') {
      onClearSelection()
    }
  }

  const toggleFolder = (name: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (!next.delete(name)) next.add(name)
      return next
    })
  }

  const hintCls = (key: string): string => (hint?.key === key ? ` is-drop-${hint.pos}` : '')

  const endDrag = (): void => {
    setDrag(null)
    setHint(null)
  }

  /** Shared dragover logic: claim the drop and record the slot. */
  const overSlot = (e: React.DragEvent, key: string, pos: 'before' | 'after' | 'into'): void => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    if (hint?.key !== key || hint.pos !== pos) setHint({ key, pos })
  }

  const edgeOf = (e: React.DragEvent): 'before' | 'after' => {
    const r = e.currentTarget.getBoundingClientRect()
    return e.clientY < r.top + r.height / 2 ? 'before' : 'after'
  }

  /** Executes the drop recorded by the last dragover. */
  const dropAt = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    const slot = hint
    endDrag()
    if (!slot) return
    const target: DropTarget =
      slot.key === 'end'
        ? 'end'
        : slot.key.startsWith('e:')
          ? slot.pos === 'before'
            ? { beforeEntity: slot.key.slice(2) }
            : { afterEntity: slot.key.slice(2) }
          : slot.pos === 'into'
            ? { into: slot.key.slice(2) }
            : slot.pos === 'before'
              ? { beforeFolder: slot.key.slice(2) }
              : { afterFolder: slot.key.slice(2) }
    const groupJson = e.dataTransfer.getData('waica/scene-entities')
    const entityName = e.dataTransfer.getData('waica/scene-entity')
    const folderName = e.dataTransfer.getData('waica/scene-folder')
    if (groupJson) {
      try {
        onReorderEntities(JSON.parse(groupJson) as string[], target)
      } catch {
        // torn payload from another tab/app: nothing sane to do
      }
    } else if (entityName) onReorderEntity(entityName, target)
    else if (folderName && !(typeof target === 'object' && 'into' in target)) {
      onReorderFolder(folderName, target)
    }
  }

  const pickImages = (): void => filePicker.current?.click()

  const deleteArt = async (item: ArtItem): Promise<void> => {
    if (!item.path) return
    if (!window.confirm(`Delete ${item.label}? This cannot be undone.`)) return
    await fs.deleteFile(item.path)
    onArtDeleted(item.label)
    onRefreshArt()
  }

  const renderEntity = (entity: SceneEntityJson, inFolder: boolean): React.ReactNode => {
    if (editing?.kind === 'entity' && editing.name === entity.name) {
      return (
        <div key={entity.name} className={`ed-x-item is-editing ${inFolder ? 'is-in-folder' : ''}`}>
          <span className="ed-x-ico">{entityIcon(entity, prefabLib)}</span>
          <RenameInput
            value={entity.name}
            onCommit={(next) => {
              setEditing(null)
              onRenameEntity(entity.name, next)
            }}
            onCancel={() => setEditing(null)}
          />
        </div>
      )
    }
    const inMulti = multi.includes(entity.name)
    return (
      <button
        key={entity.name}
        className={`ed-x-item ${inFolder ? 'is-in-folder' : ''} ${
          view?.kind === 'scene' && (selected === entity.name || inMulti) ? 'is-selected' : ''
        }${hintCls(`e:${entity.name}`)}`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          if (inMulti) {
            e.dataTransfer.setData('waica/scene-entities', JSON.stringify(multi))
            setDrag({ kind: 'entities', names: multi })
          } else {
            e.dataTransfer.setData('waica/scene-entity', entity.name)
            setDrag({ kind: 'entity', name: entity.name })
          }
        }}
        onDragEnd={endDrag}
        onDragOver={(e) => {
          if (!drag) return
          if (drag.kind === 'entity' && drag.name === entity.name) return
          if (drag.kind === 'entities' && drag.names.includes(entity.name)) return
          // Folders don't nest: a folder can't land between a folder's members.
          if (drag.kind === 'folder' && inFolder) return
          overSlot(e, `e:${entity.name}`, edgeOf(e))
        }}
        onDrop={dropAt}
        onClick={(e) => {
          if (e.shiftKey) onRangeEntities(rangeTo(entity.name))
          else if (e.metaKey || e.ctrlKey) onToggleEntity(entity.name)
          else onSelectEntity(entity.name)
        }}
        onDoubleClick={() => setEditing({ kind: 'entity', name: entity.name })}
        onContextMenu={(e) => {
          if (inMulti) {
            // A right-click inside the multi-selection acts on the whole group.
            const n = multi.length
            const moveTo: MenuEntry[] = folders.map((f) => ({
              label: `Move to ${f}`,
              icon: '📁',
              onClick: () => onReorderEntities(multi, { into: f }),
            }))
            moveTo.push({
              label: 'Move to root',
              icon: '⤴',
              onClick: () => onReorderEntities(multi, 'end'),
            })
            openMenu(e, [
              { label: `Duplicate ${n} entities`, icon: '⧉', onClick: () => onDuplicateEntities(multi) },
              'sep',
              ...moveTo,
              'sep',
              {
                label: `Delete ${n} entities`,
                icon: '🗑',
                danger: true,
                onClick: () => onDeleteEntities(multi),
              },
            ])
            return
          }
          onSelectEntity(entity.name)
          const moveTo: MenuEntry[] = folders
            .filter((f) => f !== entity.folder)
            .map((f) => ({
              label: `Move to ${f}`,
              icon: '📁',
              onClick: () => onReorderEntity(entity.name, { into: f }),
            }))
          if (entity.folder) {
            moveTo.push({
              label: 'Move to root',
              icon: '⤴',
              onClick: () => onReorderEntity(entity.name, 'end'),
            })
          }
          openMenu(e, [
            {
              label: 'Rename',
              icon: '✏️',
              onClick: () => setEditing({ kind: 'entity', name: entity.name }),
            },
            { label: 'Duplicate', icon: '⧉', onClick: () => onDuplicateEntity(entity.name) },
            ...(moveTo.length > 0 ? (['sep', ...moveTo] satisfies MenuEntry[]) : []),
            'sep',
            { label: 'Delete', icon: '🗑', danger: true, onClick: () => onDeleteEntity(entity.name) },
          ])
        }}
      >
        <span className="ed-x-ico">{entityIcon(entity, prefabLib)}</span>
        {entity.name}
      </button>
    )
  }

  return (
    <>
      <section
        className="ed-panel"
        onContextMenu={(e) =>
          openMenu(e, [
            { label: 'New scene', icon: '＋', onClick: onCreateScene },
            { label: 'New entity', icon: '＋', disabled: !scene, onClick: onAddEntity },
            { label: 'New folder', icon: '📁', disabled: !scene, onClick: onCreateFolder },
          ])
        }
      >
        <header className="ed-panel-head">
          <span>Scenes</span>
          <button className="ed-mini" title="New scene" onClick={onCreateScene}>
            ＋
          </button>
        </header>
        <div className="ed-x-list">
          {scenePaths.map((path) => {
            const open = path === openScenePath
            return (
              <div key={path}>
                <div className="ed-x-row">
                  <button
                    className="ed-x-item"
                    onClick={() => onOpenScene(path)}
                    onContextMenu={(e) =>
                      openMenu(e, [
                        { label: 'Open', icon: '🎬', onClick: () => onOpenScene(path) },
                        { label: 'Duplicate', icon: '⧉', onClick: () => onDuplicateScene(path) },
                        ...(open
                          ? ([
                              { label: 'New folder', icon: '📁', onClick: onCreateFolder },
                            ] satisfies MenuEntry[])
                          : []),
                        'sep',
                        {
                          label: 'Delete',
                          icon: '🗑',
                          danger: true,
                          disabled: scenePaths.length <= 1,
                          onClick: () => onDeleteScene(path),
                        },
                      ])
                    }
                  >
                    <span className="ed-x-caret">{open ? '▾' : '▸'}</span>
                    <span className="ed-x-ico">🎬</span>
                    {sceneLabel(path)}
                  </button>
                  {open && (
                    <button className="ed-mini" title="New entity" onClick={onAddEntity}>
                      ＋
                    </button>
                  )}
                </div>
                {open && scene && (
                  // Dimmed while the center pane shows something else: the
                  // subtree stays reachable but reads as "not what you're editing".
                  <div
                    className={`ed-x-subtree ${view && view.kind !== 'scene' ? 'is-inactive' : ''}`}
                    onKeyDown={treeKeys}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHint(null)
                    }}
                  >
                    <button
                      className={`ed-x-item ${
                        view?.kind === 'scene' && selected === CAMERA_NODE ? 'is-selected' : ''
                      }`}
                      onClick={onSelectCamera}
                      onContextMenu={(e) => {
                        onSelectCamera()
                        openMenu(e, [
                          {
                            label: 'Delete',
                            icon: '🗑',
                            danger: true,
                            disabled: true,
                            title: 'The camera is built-in — every scene has exactly one',
                            onClick: () => {},
                          },
                        ])
                      }}
                    >
                      <span className="ed-x-ico">🎥</span>
                      Camera
                    </button>
                    {(scene.ui ?? []).map((name) => (
                      <button
                        key={`ui:${name}`}
                        className={`ed-x-item ${
                          view?.kind === 'ui' && view.name === name ? 'is-selected' : ''
                        }`}
                        title="UI piece — starts visible in this scene"
                        onClick={() => onOpenUi(name)}
                        onContextMenu={(e) =>
                          openMenu(e, [
                            { label: 'Open', icon: '🧩', onClick: () => onOpenUi(name) },
                            'sep',
                            {
                              label: 'Remove from scene',
                              icon: '−',
                              onClick: () => onToggleUiInScene(name),
                            },
                          ])
                        }
                      >
                        <span className="ed-x-ico">🧩</span>
                        {name}
                      </button>
                    ))}
                    {rows.map((row) =>
                      row.kind === 'entity' ? (
                        renderEntity(row.entity, false)
                      ) : editing?.kind === 'folder' && editing.name === row.name ? (
                        <div key={`folder:${row.name}`}>
                          <div className="ed-x-item ed-x-folder is-editing">
                            <span className="ed-x-caret">
                              {collapsed.has(row.name) ? '▸' : '▾'}
                            </span>
                            <span className="ed-x-ico">
                              {collapsed.has(row.name) ? '📁' : '📂'}
                            </span>
                            <RenameInput
                              value={row.name}
                              onCommit={(next) => {
                                setEditing(null)
                                onRenameFolder(row.name, next)
                              }}
                              onCancel={() => setEditing(null)}
                            />
                          </div>
                          {!collapsed.has(row.name) &&
                            row.entities.map((entity) => renderEntity(entity, true))}
                        </div>
                      ) : (
                        <div key={`folder:${row.name}`}>
                          <button
                            className={`ed-x-item ed-x-folder${hintCls(`f:${row.name}`)}`}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('waica/scene-folder', row.name)
                              e.dataTransfer.effectAllowed = 'move'
                              setDrag({ kind: 'folder', name: row.name })
                            }}
                            onDragEnd={endDrag}
                            onDragOver={(e) => {
                              if (!drag) return
                              if (drag.kind === 'folder') {
                                if (drag.name === row.name) return
                                overSlot(e, `f:${row.name}`, edgeOf(e))
                                return
                              }
                              overSlot(e, `f:${row.name}`, 'into')
                            }}
                            onDrop={dropAt}
                            onClick={(e) => {
                              // Alt-click syncs every folder to this one's next state.
                              if (e.altKey) {
                                const opening = !collapsed.has(row.name)
                                setCollapsed(opening ? new Set(folders) : new Set())
                                return
                              }
                              toggleFolder(row.name)
                            }}
                            onDoubleClick={() => setEditing({ kind: 'folder', name: row.name })}
                            onContextMenu={(e) =>
                              openMenu(e, [
                                {
                                  label: 'Rename',
                                  icon: '✏️',
                                  onClick: () => setEditing({ kind: 'folder', name: row.name }),
                                },
                                {
                                  label: 'Dissolve (keep entities)',
                                  icon: '📂',
                                  onClick: () => onDissolveFolder(row.name),
                                },
                                'sep',
                                {
                                  label: 'Delete with entities',
                                  icon: '🗑',
                                  danger: true,
                                  onClick: () => onDeleteFolder(row.name),
                                },
                              ])
                            }
                          >
                            <span className="ed-x-caret">
                              {collapsed.has(row.name) ? '▸' : '▾'}
                            </span>
                            <span className="ed-x-ico">
                              {collapsed.has(row.name) ? '📁' : '📂'}
                            </span>
                            {row.name}
                            <span className="ed-x-count">{row.entities.length}</span>
                          </button>
                          {!collapsed.has(row.name) &&
                            row.entities.map((entity) => renderEntity(entity, true))}
                        </div>
                      ),
                    )}
                    {drag && (
                      <div
                        className={`ed-x-dropend${hintCls('end')}`}
                        title="Drop here for root level, last"
                        onDragOver={(e) => overSlot(e, 'end', 'before')}
                        onDrop={dropAt}
                      />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {PREFAB_GROUPS.map(({ title, type, createLabel }) => (
        <section
          className="ed-panel"
          key={type}
          onContextMenu={(e) =>
            openMenu(e, [{ label: createLabel, icon: '＋', onClick: () => onCreatePrefab(type) }])
          }
        >
          <header className="ed-panel-head">
            <span>{title}</span>
            <button className="ed-mini" title={createLabel} onClick={() => onCreatePrefab(type)}>
              ＋
            </button>
          </header>
          <div className="ed-x-list">
            {Object.entries(prefabLib)
              .filter(([, prefab]) => prefab.type === type)
              .map(([ref]) => {
                const base = refBase(ref)
                return (
                  <button
                    key={ref}
                    className={`ed-x-item ${
                      view?.kind === 'prefab' && view.ref === ref ? 'is-selected' : ''
                    }`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('waica/prefab', ref)
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    onClick={() => onOpenPrefab(ref)}
                    onContextMenu={(e) => {
                      const builtin = ref in ACTIVE_ARCHETYPE.prefabs
                      openMenu(e, [
                        { label: 'Open', icon: '▣', onClick: () => onOpenPrefab(ref) },
                        {
                          label: 'Add to scene',
                          icon: '＋',
                          disabled: !scene,
                          onClick: () => onAddPrefabToScene(ref),
                        },
                        { label: 'Duplicate', icon: '⧉', onClick: () => onDuplicatePrefab(ref) },
                        'sep',
                        { label: createLabel, icon: '＋', onClick: () => onCreatePrefab(type) },
                        'sep',
                        {
                          label: 'Delete',
                          icon: '🗑',
                          danger: true,
                          disabled: builtin,
                          title: builtin ? 'Built-in prefabs cannot be deleted' : undefined,
                          onClick: () => onDeletePrefab(ref),
                        },
                      ])
                    }}
                  >
                    <span className="ed-x-ico">{prefabIcon(base)}</span>
                    {base}
                  </button>
                )
              })}
          </div>
        </section>
      ))}

      <section
        className="ed-panel"
        onContextMenu={(e) =>
          openMenu(e, [{ label: 'New UI piece', icon: '＋', onClick: onCreateUi }])
        }
      >
        <header className="ed-panel-head">
          <span>UI</span>
          <button className="ed-mini" title="New UI piece" onClick={onCreateUi}>
            ＋
          </button>
        </header>
        <div className="ed-x-list">
          {Object.keys(uiLib)
            .sort()
            .map((name) => {
              const inScene = scene?.ui?.includes(name) ?? false
              const builtin = name in (ACTIVE_ARCHETYPE.registry.ui ?? {})
              return (
                <button
                  key={name}
                  className={`ed-x-item ${view?.kind === 'ui' && view.name === name ? 'is-selected' : ''}`}
                  title={inScene ? 'starts visible in the open scene' : undefined}
                  onClick={() => onOpenUi(name)}
                  onContextMenu={(e) =>
                    openMenu(e, [
                      { label: 'Open', icon: '🧩', onClick: () => onOpenUi(name) },
                      {
                        label: inScene ? 'Remove from scene' : 'Add to scene',
                        icon: inScene ? '−' : '＋',
                        disabled: !scene,
                        onClick: () => onToggleUiInScene(name),
                      },
                      { label: 'Duplicate', icon: '⧉', onClick: () => onDuplicateUi(name) },
                      'sep',
                      { label: 'New UI piece', icon: '＋', onClick: onCreateUi },
                      'sep',
                      {
                        label: 'Delete',
                        icon: '🗑',
                        danger: true,
                        disabled: builtin,
                        title: builtin ? 'Built-in UI pieces cannot be deleted' : undefined,
                        onClick: () => onDeleteUi(name),
                      },
                    ])
                  }
                >
                  <span className="ed-x-ico">🧩</span>
                  {name}
                  {inScene && <span className="ed-x-flag">●</span>}
                </button>
              )
            })}
        </div>
      </section>

      <section
        className="ed-panel"
        onContextMenu={(e) =>
          openMenu(e, [
            { label: 'New component (coming soon)', icon: '＋', disabled: true, onClick: () => {} },
          ])
        }
      >
        <header className="ed-panel-head">
          <span>Components</span>
          <button className="ed-mini" title="Custom components are coming soon" disabled>
            ＋
          </button>
        </header>
        <div className="ed-x-group-head">Built-in</div>
        <div className="ed-x-list">
          {BUILTIN_COMPONENTS.map((name) => (
            <button
              key={name}
              className={`ed-x-item ${
                view?.kind === 'script' && view.name === name ? 'is-selected' : ''
              }`}
              onClick={() => onOpenScript(name)}
              onContextMenu={(e) =>
                openMenu(e, [{ label: 'View code', icon: '📜', onClick: () => onOpenScript(name) }])
              }
            >
              <span className="ed-x-ico">📜</span>
              {name}
            </button>
          ))}
        </div>
        <div className="ed-x-group-head">Custom</div>
        <div className="ed-x-list">
          {CUSTOM_COMPONENTS.length === 0 ? (
            <div className="ed-x-empty">No custom components yet</div>
          ) : (
            CUSTOM_COMPONENTS.map((name) => (
              <button
                key={name}
                className={`ed-x-item ${
                  view?.kind === 'script' && view.name === name ? 'is-selected' : ''
                }`}
                onClick={() => onOpenScript(name)}
              >
                <span className="ed-x-ico">📜</span>
                {name}
              </button>
            ))
          )}
        </div>
      </section>

      <section
        className={`ed-panel ${dropping ? 'is-dropping' : ''}`}
        onContextMenu={(e) =>
          openMenu(e, [{ label: 'Import images…', icon: '🖼️', onClick: pickImages }])
        }
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          setDropping(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false)
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return
          e.preventDefault()
          setDropping(false)
          void onImportArt([...e.dataTransfer.files])
        }}
      >
        <header className="ed-panel-head">
          <span>Art</span>
          <button className="ed-mini" title="Import images" onClick={pickImages}>
            ＋
          </button>
        </header>
        <input
          ref={filePicker}
          type="file"
          accept=".png,.jpg,.jpeg"
          multiple
          hidden
          onChange={(e) => {
            void onImportArt([...(e.currentTarget.files ?? [])])
            e.currentTarget.value = ''
          }}
        />
        <div className="ed-x-list">
          {art.map((item) => (
            <button
              key={item.label}
              className={`ed-x-item ${
                view?.kind === 'art' && view.label === item.label ? 'is-selected' : ''
              }`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('waica/art', item.uri)
                e.dataTransfer.effectAllowed = 'copy'
              }}
              onClick={() => onOpenArt(item)}
              onContextMenu={(e) =>
                openMenu(e, [
                  { label: 'Open', icon: '🖼️', onClick: () => onOpenArt(item) },
                  { label: 'Import images…', icon: '＋', onClick: pickImages },
                  'sep',
                  {
                    label: 'Delete',
                    icon: '🗑',
                    danger: true,
                    disabled: !item.path,
                    title: item.path ? undefined : 'Built-in art cannot be deleted',
                    onClick: () => void deleteArt(item),
                  },
                ])
              }
            >
              <span className="ed-x-ico">🖼️</span>
              {item.label}
            </button>
          ))}
          <div className="ed-x-empty">Drop images here or press ＋</div>
        </div>
      </section>

      <section className="ed-panel">
        <header className="ed-panel-head">
          <span>Project</span>
        </header>
        <div className="ed-x-list">
          <button
            className={`ed-x-item ${view?.kind === 'controls' ? 'is-selected' : ''}`}
            onClick={onOpenControls}
          >
            <span className="ed-x-ico">🎮</span>
            controls
          </button>
          <button
            className={`ed-x-item ${view?.kind === 'stats' ? 'is-selected' : ''}`}
            onClick={onOpenStats}
          >
            <span className="ed-x-ico">📊</span>
            stats
          </button>
          <button
            className={`ed-x-item ${view?.kind === 'game' ? 'is-selected' : ''}`}
            onClick={onOpenGame}
          >
            <span className="ed-x-ico">🕹️</span>
            game
          </button>
        </div>
      </section>

      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </>
  )
}
