import type { KeyboardEvent } from 'react'
import type { SceneJson } from '@waica/engine'
import { useArchetype } from '../project/archetype'
import { CAMERA_NODE, sceneTree } from '../scene/ops'
import type { MenuEntry } from './ContextMenu'
import type { ExplorerProps, OpenMenu, Renaming } from './explorer-props'
import { sceneLabel } from './icons'
import { useSceneTreeDrag } from './scene-tree-drag'
import { EntityRow, FolderRow, type SceneTree, type SceneTreeProps } from './SceneTreeRows'

/** The Explorer props the Scenes panel reads and calls. */
export type ScenesPanelProps = SceneTreeProps &
  Pick<
    ExplorerProps,
    | 'scenePaths'
    | 'openScenePath'
    | 'scene'
    | 'onOpenScene'
    | 'onCreateScene'
    | 'onDuplicateScene'
    | 'onDeleteScene'
    | 'onAddEntity'
    | 'onCreateFolder'
    | 'onClearSelection'
    | 'onSelectCamera'
    | 'onReorderFolder'
    | 'onOpenUi'
    | 'onToggleUiInScene'
  > & { openMenu: OpenMenu; renaming: Renaming }

/** The Scenes panel: the project's scenes, the open one expanded into its tree. */
export function ScenesPanel(props: ScenesPanelProps) {
  const { scene, openMenu } = props
  return (
    <section
      className="ed-panel"
      onContextMenu={(e) =>
        openMenu(e, [
          { label: 'New scene', icon: '＋', onClick: props.onCreateScene },
          { label: 'New entity', icon: '＋', disabled: !scene, onClick: props.onAddEntity },
          { label: 'New folder', icon: '📁', disabled: !scene, onClick: props.onCreateFolder },
        ])
      }
    >
      <header className="ed-panel-head">
        <span>Scenes</span>
        <button className="ed-mini" title="New scene" onClick={props.onCreateScene}>
          ＋
        </button>
      </header>
      <div className="ed-x-list">
        {props.scenePaths.map((path) => (
          <SceneListItem key={path} path={path} panel={props} />
        ))}
      </div>
    </section>
  )
}

/** Menu of one scene: open, duplicate, a new folder in the open one, delete (never the last). */
function sceneMenu(path: string, open: boolean, panel: ScenesPanelProps): MenuEntry[] {
  return [
    { label: 'Open', icon: '🎬', onClick: () => panel.onOpenScene(path) },
    { label: 'Duplicate', icon: '⧉', onClick: () => panel.onDuplicateScene(path) },
    ...(open ? ([{ label: 'New folder', icon: '📁', onClick: panel.onCreateFolder }] satisfies MenuEntry[]) : []),
    'sep',
    {
      label: 'Delete',
      icon: '🗑',
      danger: true,
      disabled: panel.scenePaths.length <= 1,
      onClick: () => panel.onDeleteScene(path),
    },
  ]
}

/** One scene of the list; the open one adds an entity button and shows its tree. */
function SceneListItem({ path, panel }: { path: string; panel: ScenesPanelProps }) {
  const open = path === panel.openScenePath
  return (
    <div>
      <div className="ed-x-row">
        <button
          className="ed-x-item"
          onClick={() => panel.onOpenScene(path)}
          onContextMenu={(e) => panel.openMenu(e, sceneMenu(path, open, panel))}
        >
          <span className="ed-x-caret">{open ? '▾' : '▸'}</span>
          <span className="ed-x-ico">🎬</span>
          {sceneLabel(path)}
        </button>
        {open && (
          <button className="ed-mini" title="New entity" onClick={panel.onAddEntity}>
            ＋
          </button>
        )}
      </div>
      {open && panel.scene && <SceneSubtree scene={panel.scene} panel={panel} />}
    </div>
  )
}

/** Entity names as displayed, skipping collapsed folders — the space shift-ranges live in. */
function visibleEntityNames(rows: ReturnType<typeof sceneTree>, expanded: ReadonlySet<string>): string[] {
  return rows.flatMap((r) =>
    r.kind === 'entity' ? [r.entity.name] : expanded.has(r.name) ? r.entities.map((e) => e.name) : [],
  )
}

/** The rows of the open scene's tree and the context each row works in. */
function useSceneTree(scene: SceneJson, panel: ScenesPanelProps) {
  const archetype = useArchetype()
  const rows = sceneTree(scene)
  const visibleEntities = visibleEntityNames(rows, panel.sceneFolders.expanded)
  const dnd = useSceneTreeDrag({ ...panel, openFolder: (name) => panel.sceneFolders.open(name) })
  const tree: SceneTree = {
    props: panel,
    archetype,
    folders: rows.filter((r) => r.kind === 'folder').map((r) => r.name),
    rangeTo: (name) => {
      const a = panel.selected ? visibleEntities.indexOf(panel.selected) : -1
      const b = visibleEntities.indexOf(name)
      if (a < 0 || b < 0) return [name]
      return visibleEntities.slice(Math.min(a, b), Math.max(a, b) + 1)
    },
    dnd,
    renaming: panel.renaming,
    openMenu: panel.openMenu,
  }
  return { rows, visibleEntities, tree }
}

/** The open scene's tree: camera, its UI pieces, entities and folders, and the root drop slot. */
function SceneSubtree({ scene, panel }: { scene: SceneJson; panel: ScenesPanelProps }) {
  const { rows, visibleEntities, tree } = useSceneTree(scene, panel)
  const { dnd } = tree
  return (
    // Dimmed while the center pane shows something else: the
    // subtree stays reachable but reads as "not what you're editing".
    // Shortcuts (Delete, F2, Cmd+D…) bubble here from the focused row buttons.
    <div
      className={`ed-x-subtree ${panel.view && panel.view.kind !== 'scene' ? 'is-inactive' : ''}`}
      role="presentation"
      onKeyDown={(e) => treeShortcut(e, panel, visibleEntities)}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) dnd.setHint(null)
      }}
    >
      <CameraRow panel={panel} />
      {(scene.ui ?? []).map((name) => (
        <SceneUiRow key={`ui:${name}`} name={name} panel={panel} />
      ))}
      {rows.map((row) =>
        row.kind === 'entity' ? (
          <EntityRow key={row.entity.name} entity={row.entity} inFolder={false} tree={tree} />
        ) : (
          <FolderRow key={`folder:${row.name}`} name={row.name} entities={row.entities} tree={tree} />
        ),
      )}
      {dnd.drag && (
        <div
          className={`ed-x-dropend${dnd.hintCls('end')}`}
          title="Drop here for root level, last"
          onDragOver={(e) => dnd.overSlot(e, 'end', 'before')}
          onDrop={dnd.dropAt}
        />
      )}
    </div>
  )
}

/** The names a bulk action applies to: the multi-selection, or the selected entity. */
function selectionGroup({ multi, selected, scene }: ScenesPanelProps): string[] {
  if (multi.length > 1) return multi
  if (selected && scene?.entities.some((e) => e.name === selected)) return [selected]
  return []
}

interface TreeShortcut {
  matches: (e: KeyboardEvent, group: string[]) => boolean
  /** Whether the key stops doing what the browser would do with it. */
  claims: boolean
  run: (panel: ScenesPanelProps, group: string[], visibleEntities: string[]) => void
}

const withModifier = (e: KeyboardEvent): boolean => e.metaKey || e.ctrlKey

/**
 * The tree's keyboard shortcuts, first match wins, acting on the
 * multi-selection or the selected entity.
 */
const TREE_SHORTCUTS: TreeShortcut[] = [
  {
    matches: (e, group) => (e.key === 'Delete' || e.key === 'Backspace') && group.length > 0,
    claims: true,
    run: (panel, group) => panel.onDeleteEntities(group),
  },
  {
    matches: (e, group) => e.key === 'F2' && group.length === 1 && group[0] !== undefined,
    claims: true,
    run: (panel, [name]) => {
      if (name !== undefined) panel.renaming.setEditing({ kind: 'entity', name })
    },
  },
  {
    matches: (e, group) => withModifier(e) && e.key.toLowerCase() === 'd' && group.length > 0,
    claims: true,
    run: (panel, group) => panel.onDuplicateEntities(group),
  },
  {
    matches: (e) => withModifier(e) && e.key.toLowerCase() === 'a',
    claims: true,
    run: (panel, _group, visibleEntities) => {
      if (visibleEntities.length > 0) panel.onRangeEntities(visibleEntities)
    },
  },
  { matches: (e) => e.key === 'Escape', claims: false, run: (panel) => panel.onClearSelection() },
]

/** Runs the tree shortcut the key press matches — none while a row is being renamed. */
function treeShortcut(e: KeyboardEvent, panel: ScenesPanelProps, visibleEntities: string[]): void {
  if (panel.renaming.editing) return
  const group = selectionGroup(panel)
  const shortcut = TREE_SHORTCUTS.find((candidate) => candidate.matches(e, group))
  if (!shortcut) return
  if (shortcut.claims) e.preventDefault()
  shortcut.run(panel, group, visibleEntities)
}

/** The scene's built-in camera: selectable, never deletable. */
function CameraRow({ panel }: { panel: ScenesPanelProps }) {
  const selected = panel.view?.kind === 'scene' && panel.selected === CAMERA_NODE
  return (
    <button
      className={`ed-x-item ${selected ? 'is-selected' : ''}`}
      onClick={panel.onSelectCamera}
      onContextMenu={(e) => {
        panel.onSelectCamera()
        panel.openMenu(e, [
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
  )
}

/** A UI piece the scene starts with visible: open it, or remove it from the scene. */
function SceneUiRow({ name, panel }: { name: string; panel: ScenesPanelProps }) {
  return (
    <button
      className={`ed-x-item ${panel.view?.kind === 'ui' && panel.view.name === name ? 'is-selected' : ''}`}
      title="UI piece — starts visible in this scene"
      onClick={() => panel.onOpenUi(name)}
      onContextMenu={(e) =>
        panel.openMenu(e, [
          { label: 'Open', icon: '🧩', onClick: () => panel.onOpenUi(name) },
          'sep',
          { label: 'Remove from scene', icon: '−', onClick: () => panel.onToggleUiInScene(name) },
        ])
      }
    >
      <span className="ed-x-ico">🧩</span>
      {name}
    </button>
  )
}
