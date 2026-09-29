import { useArchetype } from '../project/archetype'
import { behaviourTypes } from '../project/chassis'
import type { MenuEntry } from './ContextMenu'
import type { ExplorerProps, ExplorerView, OpenMenu } from './explorer-props'

/** The Explorer props the UI pieces panel reads and calls. */
export type UiPiecesPanelProps = Pick<
  ExplorerProps,
  'uiLib' | 'scene' | 'view' | 'onOpenUi' | 'onCreateUi' | 'onToggleUiInScene' | 'onDuplicateUi' | 'onDeleteUi'
> & { openMenu: OpenMenu }

/** Menu of one UI piece: open, add to / remove from the open scene, duplicate, new, delete. */
function uiPieceMenu(name: string, inScene: boolean, panel: UiPiecesPanelProps): MenuEntry[] {
  return [
    { label: 'Open', icon: '🧩', onClick: () => panel.onOpenUi(name) },
    {
      label: inScene ? 'Remove from scene' : 'Add to scene',
      icon: inScene ? '−' : '＋',
      disabled: !panel.scene,
      onClick: () => panel.onToggleUiInScene(name),
    },
    { label: 'Duplicate', icon: '⧉', onClick: () => panel.onDuplicateUi(name) },
    'sep',
    { label: 'New UI piece', icon: '＋', onClick: panel.onCreateUi },
    'sep',
    { label: 'Delete', icon: '🗑', danger: true, onClick: () => panel.onDeleteUi(name) },
  ]
}

/** The UI panel: every UI piece, flagged when the open scene starts with it visible. */
export function UiPiecesPanel(panel: UiPiecesPanelProps) {
  return (
    <section
      className="ed-panel"
      onContextMenu={(e) => panel.openMenu(e, [{ label: 'New UI piece', icon: '＋', onClick: panel.onCreateUi }])}
    >
      <header className="ed-panel-head">
        <span>UI</span>
        <button className="ed-mini" title="New UI piece" onClick={panel.onCreateUi}>
          ＋
        </button>
      </header>
      <div className="ed-x-list">
        {Object.keys(panel.uiLib)
          .sort()
          .map((name) => {
            const inScene = panel.scene?.ui?.includes(name) ?? false
            return (
              <button
                key={name}
                className={`ed-x-item ${panel.view?.kind === 'ui' && panel.view.name === name ? 'is-selected' : ''}`}
                title={inScene ? 'starts visible in the open scene' : undefined}
                onClick={() => panel.onOpenUi(name)}
                onContextMenu={(e) => panel.openMenu(e, uiPieceMenu(name, inScene, panel))}
              >
                <span className="ed-x-ico">🧩</span>
                {name}
                {inScene && <span className="ed-x-flag">●</span>}
              </button>
            )
          })}
      </div>
    </section>
  )
}

/** The Explorer props the Components panel reads and calls. */
export type ComponentsPanelProps = Pick<
  ExplorerProps,
  | 'view'
  | 'customComponents'
  | 'stateFiles'
  | 'roleFiles'
  | 'onCreateComponent'
  | 'onOpenScript'
  | 'onOpenStateFile'
  | 'onOpenComponentFile'
> & { openMenu: OpenMenu }

/** The Components panel: built-in behaviours, state logic and role files, and the project's own components. */
export function ComponentsPanel(panel: ComponentsPanelProps) {
  const { view } = panel
  return (
    <section
      className="ed-panel"
      onContextMenu={(e) =>
        panel.openMenu(e, [{ label: 'New component', icon: '＋', onClick: panel.onCreateComponent }])
      }
    >
      <header className="ed-panel-head">
        <span>Components</span>
        <button className="ed-mini" title="New component" onClick={panel.onCreateComponent}>
          ＋
        </button>
      </header>
      <BuiltinComponents panel={panel} />
      <ProjectCodeFiles
        heading="State logic"
        dir="src/states"
        files={panel.stateFiles}
        view={view}
        icon="📜"
        title="Runs on every Play and in your game — Play reloads it fresh"
        empty={`No state code yet — press "Create code file" on a character's state`}
        onOpen={panel.onOpenStateFile}
      />
      <ProjectCodeFiles
        heading="Roles"
        dir="src/roles"
        files={panel.roleFiles}
        view={view}
        icon="🎭"
        title="Registers on every Play and in your game — Play reloads it fresh"
        empty="No custom roles yet — create one from a character's Role dropdown"
        onOpen={panel.onOpenStateFile}
      />
      <CustomComponents panel={panel} />
    </section>
  )
}

/** The archetype's behaviour components a project component doesn't shadow, each with viewable code. */
function BuiltinComponents({ panel }: { panel: ComponentsPanelProps }) {
  const archetype = useArchetype()
  const customNames = new Set(panel.customComponents.map(({ name }) => name))
  const builtin = behaviourTypes(Object.keys(archetype.registry.components)).filter(
    (name) => !customNames.has(name),
  )
  return (
    <>
      <div className="ed-x-group-head">Built-in</div>
      <div className="ed-x-list">
        {builtin.map((name) => (
          <button
            key={name}
            className={`ed-x-item ${panel.view?.kind === 'script' && panel.view.name === name ? 'is-selected' : ''}`}
            onClick={() => panel.onOpenScript(name)}
            onContextMenu={(e) =>
              panel.openMenu(e, [{ label: 'View code', icon: '📜', onClick: () => panel.onOpenScript(name) }])
            }
          >
            <span className="ed-x-ico">📜</span>
            {name}
          </button>
        ))}
      </div>
    </>
  )
}

interface ProjectCodeFilesProps {
  heading: string
  /** The src/ folder the basenames live in. */
  dir: string
  files: string[]
  view: ExplorerView | null
  icon: string
  title: string
  /** Shown instead of the list when there are no files. */
  empty: string
  onOpen: (path: string) => void
}

/** A list of the project's code files in one src/ folder (state logic or roles), opened as state files. */
function ProjectCodeFiles({ heading, dir, files, view, icon, title, empty, onOpen }: ProjectCodeFilesProps) {
  return (
    <>
      <div className="ed-x-group-head">{heading}</div>
      <div className="ed-x-list">
        {files.length === 0 ? (
          <div className="ed-x-empty">{empty}</div>
        ) : (
          files.map((name) => {
            const path = `${dir}/${name}`
            return (
              <button
                key={name}
                className={`ed-x-item ${view?.kind === 'stateFile' && view.path === path ? 'is-selected' : ''}`}
                title={title}
                onClick={() => onOpen(path)}
              >
                <span className="ed-x-ico">{icon}</span>
                {name}
              </button>
            )
          })
        )}
      </div>
    </>
  )
}

/** The project's own exported components, each opening the file that defines it. */
function CustomComponents({ panel }: { panel: ComponentsPanelProps }) {
  const { view } = panel
  return (
    <>
      <div className="ed-x-group-head">Custom</div>
      <div className="ed-x-list">
        {panel.customComponents.length === 0 ? (
          <div className="ed-x-empty">No custom components yet</div>
        ) : (
          panel.customComponents.map(({ name, path }) => (
            <button
              key={`${name}:${path}`}
              className={`ed-x-item ${view?.kind === 'componentFile' && view.path === path ? 'is-selected' : ''}`}
              title={path}
              onClick={() => panel.onOpenComponentFile(path)}
            >
              <span className="ed-x-ico">📜</span>
              {name}
            </button>
          ))
        )}
      </div>
    </>
  )
}

/** The Project panel: the project-wide settings files. */
export function ProjectFilesPanel({
  view,
  onOpenControls,
  onOpenStats,
  onOpenGame,
}: Pick<ExplorerProps, 'view' | 'onOpenControls' | 'onOpenStats' | 'onOpenGame'>) {
  const item = (kind: 'controls' | 'stats' | 'game', icon: string, onOpen: () => void) => (
    <button className={`ed-x-item ${view?.kind === kind ? 'is-selected' : ''}`} onClick={onOpen}>
      <span className="ed-x-ico">{icon}</span>
      {kind}
    </button>
  )
  return (
    <section className="ed-panel">
      <header className="ed-panel-head">
        <span>Project</span>
      </header>
      <div className="ed-x-list">
        {item('controls', '🎮', onOpenControls)}
        {item('stats', '📊', onOpenStats)}
        {item('game', '🕹️', onOpenGame)}
      </div>
    </section>
  )
}
