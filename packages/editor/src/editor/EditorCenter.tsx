import { useMemo, type RefObject } from 'react'
import type { SceneJson } from '@waica/engine'
import { CONTROLS_PATH } from '../project/controls'
import { GAME_PATH } from '../project/game'
import { STATS_PATH, type ProjectStats } from '../project/stats'
import { refreshComponentCode } from './code-file-commands'
import { CodePane } from './CodePane'
import type { EditorCore } from './editor-commits'
import { PrefabViewport, SceneViewport, type StageProps } from './EditorViewports'
import { refBase, type ExplorerView } from './Explorer'
import { ControlsEditor, GameSettingsEditor, ProjectPane, StatsEditor } from './ProjectPane'
import { scriptSource } from './script-sources'
import { UiPane } from './UiPane'
import type { ViewportHandle } from './Viewport'

const EMPTY_SCENE: SceneJson = { waicaScene: 3, entities: [] }
/** Stable fallback: a fresh {} per render would loop the UiPane preview effect. */
export const EMPTY_STATS: ProjectStats = {}

type SettingsView = Extract<ExplorerView, { kind: 'controls' | 'stats' | 'game' }>
type CodeView = Extract<ExplorerView, { kind: 'script' | 'stateFile' | 'componentFile' }>

/** The center pane: whatever the Explorer opened, from the scene stage to a settings form. */
export function EditorCenter({
  core,
  viewportRef,
}: {
  core: EditorCore
  viewportRef: RefObject<ViewportHandle | null>
}) {
  const { view } = core.view
  const stage = useStageProps(core)
  const prefabScene = useMemo<SceneJson | null>(() => {
    if (view?.kind !== 'prefab') return null
    return { waicaScene: 2, entities: [{ name: refBase(view.ref), prefab: view.ref, position: [0, 0] }] }
  }, [view])

  if (!view) return <Hint>select something on the left to open it</Hint>
  if (view.kind === 'scene') return <SceneCenter core={core} stage={stage} viewportRef={viewportRef} />
  if (view.kind === 'prefab') {
    const [prefabLib] = core.library.prefabLib
    if (prefabLib[view.ref] == null) return <Hint>this prefab no longer exists</Hint>
    return (
      <PrefabViewport
        core={core}
        prefabRef={view.ref}
        scene={prefabScene ?? EMPTY_SCENE}
        stage={stage}
        viewportRef={viewportRef}
      />
    )
  }
  if (view.kind === 'ui') return <UiCenter core={core} name={view.name} />
  if (view.kind === 'art') return <ArtStage core={core} label={view.label} url={view.url} />
  if (isSettingsView(view)) return <SettingsCenter core={core} view={view} />
  return <CodeCenter core={core} view={view} />
}

/** The registry both stages load from, and the epoch that rebuilds them. */
function useStageProps(core: EditorCore): StageProps {
  const [prefabLib] = core.library.prefabLib
  const [uiLib] = core.library.uiLib
  const [epoch] = core.stage.epoch
  const { registry: projectRegistry } = core.code.editorArchetype
  const { urlFor, loads } = core.art
  const registry = useMemo(
    // urlFor resolves project-art paths (src/art/*.png) on top of waica:* assets.
    () => ({ ...projectRegistry, prefabs: prefabLib, ui: uiLib, resolveAsset: urlFor }),
    [projectRegistry, prefabLib, uiLib, urlFor],
  )
  // The stage rebuilds on every structural edit (epoch) and, so textures
  // rebind to freshly scanned art, on every art scan. Both only grow, so the
  // sum changes exactly when either one does.
  return { registry, epoch: epoch + loads }
}

function isSettingsView(view: ExplorerView): view is SettingsView {
  return view.kind === 'controls' || view.kind === 'stats' || view.kind === 'game'
}

function Hint({ children }: { children: string }) {
  return <div className="ed-vp-hint">{children}</div>
}

function SceneCenter({
  core,
  stage,
  viewportRef,
}: {
  core: EditorCore
  stage: StageProps
  viewportRef: RefObject<ViewportHandle | null>
}) {
  const { openScene, sceneFailed } = core.scenes
  // A failed read wins over the scene still on screen: the previous one
  // is deliberately kept mounted across a switch, and showing it under
  // another file's name would be a lie.
  if (sceneFailed) return <Hint>could not read this scene file</Hint>
  if (!openScene) return <Hint>loading…</Hint>
  return <SceneViewport core={core} scene={openScene} stage={stage} viewportRef={viewportRef} />
}

function UiCenter({ core, name }: { core: EditorCore; name: string }) {
  const [uiLib] = core.library.uiLib
  const html = uiLib[name]
  if (html == null) return <Hint>this UI piece no longer exists</Hint>
  return (
    <UiPane
      key={`ui:${name}`}
      name={name}
      html={html}
      stats={core.settings.stats ?? EMPTY_STATS}
      onChange={(next) => core.commitUi(name, next)}
    />
  )
}

function CodeCenter({ core, view }: { core: EditorCore; view: CodeView }) {
  if (view.kind === 'script') {
    const src = scriptSource(view.name)
    return <CodePane key={src.file} path={`scripts/${src.file}`} source={src.source} readOnly />
  }
  if (view.kind === 'stateFile') {
    // Project state/role code: a real file, edited for real (⌘S saves).
    return <CodePane key={view.path} fs={core.fs} path={view.path} />
  }
  return (
    <CodePane key={view.path} fs={core.fs} path={view.path} onSaved={() => refreshComponentCode(core)} />
  )
}

function SettingsCenter({ core, view }: { core: EditorCore; view: SettingsView }) {
  const { controls, controlLabels, stats, gameSettings } = core.settings
  if (view.kind === 'controls') {
    if (!controls) return <Hint>loading…</Hint>
    return (
      <ProjectPane savePath={CONTROLS_PATH}>
        <ControlsEditor
          controls={{ bindings: controls, labels: controlLabels }}
          onChange={core.settings.commitControls}
        />
      </ProjectPane>
    )
  }
  if (view.kind === 'stats') {
    if (!stats) return <Hint>loading…</Hint>
    return (
      <ProjectPane savePath={STATS_PATH}>
        <StatsEditor stats={stats} onChange={core.settings.commitStats} />
      </ProjectPane>
    )
  }
  if (!gameSettings) return <Hint>loading…</Hint>
  return (
    <ProjectPane savePath={GAME_PATH}>
      <GameSettingsEditor settings={gameSettings} onChange={core.settings.commitGameSettings} />
    </ProjectPane>
  )
}

function ArtStage({ core, label, url }: { core: EditorCore; label: string; url: string }) {
  const { artDims: dims, setArtDims } = core.view
  return (
    <div className="ed-art-stage">
      <div className="ed-checker">
        <img
          src={url}
          alt={label}
          style={{ width: dims ? Math.min(dims[0] * 3, 480) : undefined }}
          onLoad={(e) => setArtDims([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])}
        />
      </div>
      <div className="ed-art-caption">
        {label}
        {dims && ` · ${dims[0]}×${dims[1]}`}
      </div>
    </div>
  )
}
