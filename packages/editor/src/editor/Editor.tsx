import { useEffect, useMemo, useRef, useState } from 'react'
import type { InputBindings, PrefabJson, SceneJson, StateJson } from '@waica/engine'
import { ACTIVE_ARCHETYPE } from '../project/archetype'
import type { ProjectFS } from '../fs/project-fs'
import { listScenes, loadPrefabLib, savePrefab, prefabPath, PREFAB_DIRS } from '../fs/prefab-fs'
import { loadUiLib, saveUi, uiPath, NEW_UI_HTML } from '../fs/ui-fs'
import {
  newPrefabComponents,
  setAppearanceShape,
  setAppearanceTexture,
  setCollisionEnabled,
  toggleAnimated,
} from '../project/chassis'
import { CONTROLS_PATH, parseControls, serializeControls } from '../project/controls'
import {
  listStateFiles,
  machineProps,
  stateFilePath,
  stateFileTemplate,
  type MachineProps,
} from '../project/states'
import { DEFAULT_EDITOR_SETTINGS, EDITOR_SETTINGS_PATH, parseEditorSettings, serializeEditorSettings, type EditorSettings, type GridSettings } from '../project/editor-settings'
import { GAME_PATH, parseGameSettings, serializeGameSettings, type GameSettings } from '../project/game'
import { STATS_PATH, parseStats, serializeStats, type ProjectStats } from '../project/stats'
import * as ops from '../scene/ops'
import { EditorHistory, type AtomicEntry, type HistoryEntry } from '../history/history'
import { toAnimatedProps } from '../project/clips'
import { Viewport, type ViewportHandle } from './Viewport'
import { Explorer, refBase, type ExplorerView } from './Explorer'
import { entityIcon, prefabIcon, sceneLabel } from './icons'
import { Inspector, type AnimTarget, type InspectorSelection } from './Inspector'
import { AnimationEditor } from './AnimationEditor'
import { StateEditorModal, type StateTarget } from './StateMachinePanel'
import { CodePane } from './CodePane'
import { ControlsEditor, GameSettingsEditor, ProjectPane, StatsEditor } from './ProjectPane'
import { UiPane } from './UiPane'
import { scriptSource } from './script-sources'
import { useProjectArt, type ArtItem } from './use-project-art'

type SaveState = 'saved' | 'saving' | 'error'

const EMPTY_SCENE: SceneJson = { waicaScene: 3, entities: [] }
/** Stable fallback: a fresh {} per render would loop the UiPane preview effect. */
const EMPTY_STATS: ProjectStats = {}

function setPrefabProp(
  prefab: PrefabJson,
  componentType: string,
  key: string,
  value: unknown,
): PrefabJson {
  return {
    ...prefab,
    components: prefab.components.map((c) =>
      c.type === componentType ? { ...c, props: { ...c.props, [key]: value } } : c,
    ),
  }
}

function ArtStage({
  label,
  url,
  dims,
  onDims,
}: {
  label: string
  url: string
  dims: [number, number] | null
  onDims(width: number, height: number): void
}) {
  return (
    <div className="ed-art-stage">
      <div className="ed-checker">
        <img
          src={url}
          alt={label}
          style={{ width: dims ? Math.min(dims[0] * 3, 480) : undefined }}
          onLoad={(e) => onDims(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
        />
      </div>
      <div className="ed-art-caption">
        {label}
        {dims && ` · ${dims[0]}×${dims[1]}`}
      </div>
    </div>
  )
}

export function Editor({ fs, onClose }: { fs: ProjectFS; onClose(): void }) {
  const [scenePaths, setScenePaths] = useState<string[]>([])
  const [openScenePath, setOpenScenePath] = useState<string | null>(null)
  const [scene, setScene] = useState<SceneJson | null>(null)
  const [sceneFailed, setSceneFailed] = useState(false)
  const [view, setView] = useState<ExplorerView | null>(null)
  const [epoch, setEpoch] = useState(0)
  const [mode, setMode] = useState<'edit' | 'play'>('edit')
  const [selected, setSelected] = useState<string | null>(null)
  /** Multi-selection in the scene tree: [] or 2+ entity names, never one. */
  const [multi, setMulti] = useState<string[]>([])
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [artDims, setArtDims] = useState<[number, number] | null>(null)
  const [prefabLib, setPrefabLib] = useState<Record<string, PrefabJson>>(ACTIVE_ARCHETYPE.prefabs)
  const [uiLib, setUiLib] = useState<Record<string, string>>({
    ...ACTIVE_ARCHETYPE.registry.ui,
  })
  const [animTarget, setAnimTarget] = useState<AnimTarget | null>(null)
  const [stateTarget, setStateTarget] = useState<StateTarget | null>(null)
  /** Basenames in src/states/ — the project's state code files. */
  const [stateFiles, setStateFiles] = useState<string[]>([])
  /** null until src/controls.json is read (or defaulted). */
  const [controls, setControls] = useState<InputBindings | null>(null)
  /** null until src/stats.json is read (or defaulted). */
  const [stats, setStats] = useState<ProjectStats | null>(null)
  /** null until src/game.json is read (or defaulted). */
  const [gameSettings, setGameSettings] = useState<GameSettings | null>(null)
  /** null until src/editor.json is read (or defaulted). */
  const [editorSettings, setEditorSettings] = useState<EditorSettings | null>(null)
  const viewport = useRef<ViewportHandle>(null)
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const statsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gameTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  // Committed scenes whose write hasn't landed yet: reopening one must show
  // this content, not the stale file on disk.
  const pendingScenes = useRef(new Map<string, SceneJson>())
  const prefabTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const uiTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const projectArt = useProjectArt(fs)
  const history = useRef(new EditorHistory())
  /** Non-null while recordBatch collects commits into one undo step. */
  const batchEntries = useRef<AtomicEntry[] | null>(null)

  const record = (entry: AtomicEntry, coalesceKey?: string): void => {
    if (batchEntries.current) {
      batchEntries.current.push(entry)
      return
    }
    history.current.push(entry, Date.now(), coalesceKey)
  }

  /** Everything committed inside fn undoes and redoes as ONE step. */
  const recordBatch = (fn: () => void): void => {
    batchEntries.current = []
    try {
      fn()
    } finally {
      const entries = batchEntries.current
      batchEntries.current = null
      if (entries && entries.length === 1) history.current.push(entries[0]!, Date.now())
      else if (entries && entries.length > 1) {
        history.current.push({ kind: 'group', entries }, Date.now())
      }
    }
  }

  // Textures referencing freshly scanned art need the stage to rebind them.
  useEffect(() => {
    setEpoch((e) => e + 1)
  }, [projectArt.art])

  useEffect(() => {
    void listScenes(fs).then(setScenePaths)
    void loadPrefabLib(fs).then((lib) => {
      setPrefabLib(lib)
      // The viewport may have loaded with the archetype defaults already.
      setEpoch((e) => e + 1)
    })
    void loadUiLib(fs).then(setUiLib)
    void listStateFiles(fs).then(setStateFiles)
    void fs.readText(CONTROLS_PATH).then((text) => setControls(parseControls(text)))
    void fs.readText(STATS_PATH).then((text) => setStats(parseStats(text)))
    void fs.readText(GAME_PATH).then((text) => setGameSettings(parseGameSettings(text)))
    void fs.readText(EDITOR_SETTINGS_PATH).then((text) => setEditorSettings(parseEditorSettings(text)))
  }, [fs])

  const applyControls = (next: InputBindings): void => {
    setControls(next)
    setSaveState('saving')
    if (controlsTimer.current) clearTimeout(controlsTimer.current)
    controlsTimer.current = setTimeout(() => {
      controlsTimer.current = null
      fs.writeText(CONTROLS_PATH, serializeControls(next))
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'))
    }, 600)
  }

  const commitControls = (next: InputBindings): void => {
    if (controls) record({ kind: 'controls', before: controls, after: next })
    applyControls(next)
  }

  const applyStats = (next: ProjectStats): void => {
    setStats(next)
    setSaveState('saving')
    if (statsTimer.current) clearTimeout(statsTimer.current)
    statsTimer.current = setTimeout(() => {
      statsTimer.current = null
      fs.writeText(STATS_PATH, serializeStats(next))
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'))
    }, 600)
  }

  const commitStats = (next: ProjectStats): void => {
    if (stats) record({ kind: 'stats', before: stats, after: next }, 'stats')
    applyStats(next)
  }

  const commitGrid = (grid: GridSettings): void => {
    const next = { ...(editorSettings ?? DEFAULT_EDITOR_SETTINGS), grid }
    setEditorSettings(next)
    setSaveState('saving')
    if (editorTimer.current) clearTimeout(editorTimer.current)
    editorTimer.current = setTimeout(() => {
      editorTimer.current = null
      fs.writeText(EDITOR_SETTINGS_PATH, serializeEditorSettings(next))
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'))
    }, 600)
  }

  const applyGameSettings = (next: GameSettings): void => {
    setGameSettings(next)
    setSaveState('saving')
    if (gameTimer.current) clearTimeout(gameTimer.current)
    gameTimer.current = setTimeout(() => {
      gameTimer.current = null
      fs.writeText(GAME_PATH, serializeGameSettings(next))
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'))
    }, 600)
  }

  const commitGameSettings = (next: GameSettings): void => {
    if (gameSettings) record({ kind: 'game', before: gameSettings, after: next }, 'game')
    applyGameSettings(next)
  }

  useEffect(() => {
    if (!openScenePath) return
    const pending = pendingScenes.current.get(openScenePath)
    if (pending) {
      setScene(pending)
      setSceneFailed(false)
      return
    }
    let stale = false
    setScene(null)
    setSceneFailed(false)
    void fs.readText(openScenePath).then((text) => {
      if (stale) return
      try {
        if (text == null) throw new Error('missing')
        setScene(ops.migrateScene(JSON.parse(text) as SceneJson))
      } catch {
        setSceneFailed(true)
      }
    })
    return () => {
      stale = true
    }
  }, [fs, openScenePath])

  // Debounced per path: an edit in one scene must never cancel another's write.
  const scheduleSave = (path: string, next: SceneJson): void => {
    setSaveState('saving')
    pendingScenes.current.set(path, next)
    clearTimeout(saveTimers.current.get(path))
    saveTimers.current.set(
      path,
      setTimeout(() => {
        saveTimers.current.delete(path)
        fs.writeText(path, JSON.stringify(next, null, 2) + '\n')
          .then(() => {
            if (pendingScenes.current.get(path) === next) pendingScenes.current.delete(path)
            setSaveState('saved')
          })
          .catch(() => setSaveState('error'))
      }, 600),
    )
  }

  const commit = (next: SceneJson, structural = false, coalesce?: string): void => {
    if (!openScenePath || !scene) return
    record(
      { kind: 'scene', path: openScenePath, before: scene, after: next },
      coalesce ? `scene:${openScenePath}:${coalesce}` : undefined,
    )
    setScene(next)
    if (structural) setEpoch((e) => e + 1)
    scheduleSave(openScenePath, next)
  }

  const commitPrefab = (ref: string, next: PrefabJson, structural = false, coalesce?: string): void => {
    record(
      { kind: 'prefab', ref, before: prefabLib[ref] ?? null, after: next },
      coalesce ? `prefab:${ref}:${coalesce}` : undefined,
    )
    setPrefabLib((lib) => ({ ...lib, [ref]: next }))
    // Structural changes re-instantiate the stage; prop edits patch the live
    // instance instead (recreating the Game per input event is too costly).
    // Scene viewports remount on view switch, so they pick up the data too.
    if (structural) setEpoch((e) => e + 1)
    setSaveState('saving')
    clearTimeout(prefabTimers.current.get(ref))
    prefabTimers.current.set(
      ref,
      setTimeout(() => {
        prefabTimers.current.delete(ref)
        savePrefab(fs, ref, next)
          .then(() => setSaveState('saved'))
          .catch(() => setSaveState('error'))
      }, 600),
    )
  }

  const commitUi = (name: string, html: string): void => {
    // Keystroke-driven (Monaco): bursts on the same piece merge into one step.
    record({ kind: 'ui', name, before: uiLib[name] ?? null, after: html }, `ui:${name}`)
    setUiLib((lib) => ({ ...lib, [name]: html }))
    setSaveState('saving')
    clearTimeout(uiTimers.current.get(name))
    uiTimers.current.set(
      name,
      setTimeout(() => {
        uiTimers.current.delete(name)
        saveUi(fs, name, html)
          .then(() => setSaveState('saved'))
          .catch(() => setSaveState('error'))
      }, 600),
    )
  }

  const registryWithPrefabs = useMemo(
    // urlFor resolves project-art paths (src/art/*.png) on top of waica:* assets.
    () => ({
      ...ACTIVE_ARCHETYPE.registry,
      prefabs: prefabLib,
      ui: uiLib,
      resolveAsset: projectArt.urlFor,
    }),
    [prefabLib, uiLib, projectArt.urlFor],
  )

  const prefabScene = useMemo<SceneJson | null>(() => {
    if (view?.kind !== 'prefab') return null
    return {
      waicaScene: 2,
      entities: [{ name: refBase(view.ref), prefab: view.ref, position: [0, 0] }],
    }
  }, [view])

  const openView = (next: ExplorerView): void => {
    setMode('edit')
    setView(next)
    if (next.kind === 'art') setArtDims(null)
    if (next.kind === 'scene' && next.path !== openScenePath) {
      setSelected(null)
      setMulti([])
      setOpenScenePath(next.path)
    }
  }

  const selectEntity = (name: string | null): void => {
    setSelected(name)
    setMulti([])
  }

  /** Cmd/Ctrl-click: grows/shrinks the multi-selection, seeded from the single selection. */
  const toggleEntity = (name: string): void => {
    if (!scene) return
    const single = selected && ops.findEntity(scene, selected) ? [selected] : []
    const base = multi.length > 0 ? multi : single
    const next = base.includes(name) ? base.filter((n) => n !== name) : [...base, name]
    if (next.length <= 1) {
      setSelected(next[0] ?? null)
      setMulti([])
      return
    }
    setMulti(next)
    if (!selected || !next.includes(selected)) setSelected(next[0]!)
  }

  /** Shift-click range / select-all: the run replaces the selection wholesale. */
  const rangeEntities = (names: string[]): void => {
    if (names.length === 0) return
    if (names.length === 1) {
      selectEntity(names[0]!)
      return
    }
    setMulti(names)
    if (!selected || !names.includes(selected)) setSelected(names[0]!)
  }

  const clearSelection = (): void => {
    if (multi.length > 0) setMulti([])
    else setSelected(null)
  }

  const addEntity = (): void => {
    if (!scene || !openScenePath) return
    const name = ops.uniqueName(scene, 'Entity')
    commit(
      ops.addEntity(scene, {
        name,
        position: [0, 0],
        components: [{ type: 'Sprite', props: { width: 1, height: 1, color: 0x8ecae6 } }],
      }),
      true,
    )
    setView({ kind: 'scene', path: openScenePath })
    selectEntity(name)
  }

  const createScene = async (): Promise<void> => {
    const names = new Set(scenePaths.map((p) => p.slice(p.lastIndexOf('/') + 1)))
    let n = 1
    while (names.has(`scene-${n}.scene.json`)) n++
    const path = `src/scenes/scene-${n}.scene.json`
    const text = JSON.stringify(EMPTY_SCENE, null, 2) + '\n'
    await fs.writeText(path, text)
    record({ kind: 'sceneFile', path, before: null, after: text })
    setScenePaths(await listScenes(fs))
    openView({ kind: 'scene', path })
  }

  const duplicateScene = async (path: string): Promise<void> => {
    // A pending debounced save is newer than the file on disk.
    const pending = pendingScenes.current.get(path)
    const text = pending ? JSON.stringify(pending, null, 2) + '\n' : await fs.readText(path)
    if (text == null) return
    const names = new Set(scenePaths.map((p) => p.slice(p.lastIndexOf('/') + 1)))
    const base = path.slice(path.lastIndexOf('/') + 1).replace(/\.scene\.json$/, '')
    let copy = `${base}-copy`
    for (let n = 2; names.has(`${copy}.scene.json`); n++) copy = `${base}-copy-${n}`
    const newPath = `src/scenes/${copy}.scene.json`
    await fs.writeText(newPath, text)
    record({ kind: 'sceneFile', path: newPath, before: null, after: text })
    setScenePaths(await listScenes(fs))
    openView({ kind: 'scene', path: newPath })
  }

  const deleteScene = async (path: string): Promise<void> => {
    const label = path.slice(path.lastIndexOf('/') + 1)
    if (!window.confirm(`Delete ${label}?`)) return
    // A pending debounced save is newer than the file on disk.
    const pending = pendingScenes.current.get(path)
    const text = pending ? JSON.stringify(pending, null, 2) + '\n' : await fs.readText(path)
    clearTimeout(saveTimers.current.get(path))
    saveTimers.current.delete(path)
    pendingScenes.current.delete(path)
    await fs.deleteFile(path)
    if (text != null) record({ kind: 'sceneFile', path, before: text, after: null })
    setScenePaths(await listScenes(fs))
    if (openScenePath === path) {
      setOpenScenePath(null)
      setScene(null)
      setSelected(null)
      setMulti([])
    }
    if (view?.kind === 'scene' && view.path === path) setView(null)
  }

  const duplicateEntities = (names: string[]): void => {
    if (!scene || !openScenePath || names.length === 0) return
    let next = scene
    const copies: string[] = []
    for (const name of names) {
      const entity = ops.findEntity(next, name)
      if (!entity) continue
      const copy = structuredClone(entity)
      copy.name = ops.uniqueName(next, name)
      // Nudge the copy so it doesn't hide exactly behind the original.
      const [x, y] = entity.position ?? [0, 0]
      copy.position = [x + 0.5, y]
      next = ops.addEntity(next, copy)
      copies.push(copy.name)
    }
    if (copies.length === 0) return
    commit(next, true)
    setView({ kind: 'scene', path: openScenePath })
    // The copies become the selection, ready to drag somewhere as a group.
    setSelected(copies[0]!)
    setMulti(copies.length > 1 ? copies : [])
  }

  const duplicateEntity = (name: string): void => duplicateEntities([name])

  const deleteEntities = (names: string[]): void => {
    if (!scene || names.length === 0) return
    if (names.length > 1 && !window.confirm(`Delete ${names.length} entities?`)) return
    commit(ops.removeEntities(scene, names), true)
    setSelected((s) => (s && names.includes(s) ? null : s))
    setMulti([])
  }

  const deleteEntity = (name: string): void => deleteEntities([name])

  const renameEntity = (from: string, to: string): void => {
    if (!scene) return
    const trimmed = to.trim()
    if (!trimmed || trimmed === from) return
    const name = ops.uniqueName(scene, trimmed)
    commit(ops.renameEntity(scene, from, name), true)
    setSelected((s) => (s === from ? name : s))
    setMulti((m) => m.map((n) => (n === from ? name : n)))
  }

  const createFolder = (): void => {
    if (!scene) return
    commit(ops.addFolder(scene, ops.uniqueFolderName(scene, 'Folder')))
  }

  const renameFolder = (from: string, to: string): void => {
    if (!scene) return
    const trimmed = to.trim()
    if (!trimmed || trimmed === from) return
    commit(ops.renameFolder(scene, from, ops.uniqueFolderName(scene, trimmed)))
  }

  const dissolveFolder = (name: string): void => {
    if (scene) commit(ops.dissolveFolder(scene, name))
  }

  const deleteFolder = (name: string): void => {
    if (!scene) return
    const doomed = scene.entities.filter((e) => e.folder === name)
    const suffix = doomed.length === 0 ? '' : ` and its ${doomed.length} entit${doomed.length === 1 ? 'y' : 'ies'}`
    if (!window.confirm(`Delete ${name}${suffix}?`)) return
    commit(ops.deleteFolder(scene, name), true)
    setSelected((s) => (doomed.some((e) => e.name === s) ? null : s))
    setMulti((m) => {
      const left = m.filter((n) => !doomed.some((e) => e.name === n))
      return left.length > 1 ? left : []
    })
  }

  // Spawn order follows the entities array, so reordering is structural.
  const reorderEntity = (name: string, target: ops.DropTarget): void => {
    if (scene) commit(ops.reorderEntity(scene, name, target), true)
  }

  const reorderFolder = (name: string, target: Exclude<ops.DropTarget, { into: string }>): void => {
    if (scene) commit(ops.reorderFolder(scene, name, target), true)
  }

  const reorderEntities = (names: string[], target: ops.DropTarget): void => {
    if (scene) commit(ops.reorderEntities(scene, names, target), true)
  }

  const createPrefab = (type: PrefabJson['type']): void => {
    const dir = Object.entries(PREFAB_DIRS).find(([, cat]) => cat === type)?.[0]
    if (!dir) return
    let n = 1
    while (prefabLib[`${dir}/${type}-${n}`]) n++
    const ref = `${dir}/${type}-${n}`
    commitPrefab(ref, { waicaPrefab: 1, type, components: newPrefabComponents(type) }, true)
    openView({ kind: 'prefab', ref })
  }

  const duplicatePrefab = (ref: string): void => {
    const prefab = prefabLib[ref]
    if (!prefab) return
    const dir = ref.slice(0, ref.indexOf('/'))
    const base = refBase(ref)
    let copyRef = `${dir}/${base}-copy`
    for (let n = 2; prefabLib[copyRef]; n++) copyRef = `${dir}/${base}-copy-${n}`
    commitPrefab(copyRef, structuredClone(prefab), true)
    openView({ kind: 'prefab', ref: copyRef })
  }

  const deletePrefab = async (ref: string): Promise<void> => {
    const prefab = prefabLib[ref]
    if (!prefab) return
    if (!window.confirm(`Delete ${refBase(ref)}? Entities using it will lose its components.`)) {
      return
    }
    clearTimeout(prefabTimers.current.get(ref))
    prefabTimers.current.delete(ref)
    // The file may not exist yet (debounced save cancelled above): ignore.
    await fs.deleteFile(prefabPath(ref)).catch(() => {})
    record({ kind: 'prefab', ref, before: prefab, after: null })
    setPrefabLib((lib) => {
      const next = { ...lib }
      delete next[ref]
      return next
    })
    setEpoch((e) => e + 1)
    if (view?.kind === 'prefab' && view.ref === ref) setView(null)
  }

  const createUi = (): void => {
    let n = 1
    while (uiLib[`ui-${n}`]) n++
    const name = `ui-${n}`
    commitUi(name, NEW_UI_HTML)
    openView({ kind: 'ui', name })
  }

  const duplicateUi = (name: string): void => {
    const html = uiLib[name]
    if (html == null) return
    let copy = `${name}-copy`
    for (let n = 2; uiLib[copy]; n++) copy = `${name}-copy-${n}`
    commitUi(copy, html)
    openView({ kind: 'ui', name: copy })
  }

  const deleteUi = async (name: string): Promise<void> => {
    const html = uiLib[name]
    if (html == null) return
    if (!window.confirm(`Delete ${name}? Scenes listing it will skip it with a warning.`)) return
    clearTimeout(uiTimers.current.get(name))
    uiTimers.current.delete(name)
    // The file may not exist yet (debounced save cancelled above): ignore.
    await fs.deleteFile(uiPath(name)).catch(() => {})
    record({ kind: 'ui', name, before: html, after: null })
    setUiLib((lib) => {
      const next = { ...lib }
      delete next[name]
      return next
    })
    if (view?.kind === 'ui' && view.name === name) setView(null)
  }

  const toggleUiInScene = (name: string): void => {
    if (!scene || !openScenePath) return
    const current = scene.ui ?? []
    const ui = current.includes(name) ? current.filter((n) => n !== name) : [...current, name]
    const next = { ...scene }
    if (ui.length > 0) next.ui = ui
    else delete next.ui
    commit(next)
  }

  const addPrefabToScene = (ref: string): void => {
    if (!scene || !openScenePath) return
    const base = refBase(ref)
    const name = ops.uniqueName(scene, base.charAt(0).toUpperCase() + base.slice(1))
    commit(ops.addEntity(scene, { name, prefab: ref, position: [0, 0] }), true)
    setView({ kind: 'scene', path: openScenePath })
    selectEntity(name)
  }

  const play = (): void => {
    if (!openScenePath || !scene) return
    setSelected(null)
    setMulti([])
    // Play may be pressed from any view (prefab, ui…): the run happens in the
    // scene viewport, so bring the open scene to the center first.
    setView({ kind: 'scene', path: openScenePath })
    setMode('play')
  }
  const stop = (): void => setMode('edit')

  /** Puts a recorded scene value back (undo/redo), through the normal save path. */
  const applySceneState = (path: string, value: SceneJson): void => {
    scheduleSave(path, value)
    if (openScenePath === path) {
      setScene(value)
      // The viewport patches props imperatively on live entities, so a plain
      // setScene isn't enough: rebuild the stage from the restored JSON.
      setEpoch((e) => e + 1)
      // The restored scene may not contain the current selection.
      setSelected((s) => (s && s !== ops.CAMERA_NODE && !ops.findEntity(value, s) ? null : s))
      setMulti((m) => {
        const left = m.filter((n) => ops.findEntity(value, n))
        return left.length > 1 ? left : []
      })
    }
  }

  /** Creates or deletes a scene file back (undo/redo of create/duplicate/delete). */
  const applySceneFile = async (path: string, content: string | null): Promise<void> => {
    clearTimeout(saveTimers.current.get(path))
    saveTimers.current.delete(path)
    pendingScenes.current.delete(path)
    setSaveState('saving')
    try {
      if (content == null) {
        await fs.deleteFile(path).catch(() => {})
        if (openScenePath === path) {
          setOpenScenePath(null)
          setScene(null)
          setSelected(null)
          setMulti([])
        }
        if (view?.kind === 'scene' && view.path === path) setView(null)
      } else {
        await fs.writeText(path, content)
      }
      setScenePaths(await listScenes(fs))
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }

  const applyPrefabState = (ref: string, value: PrefabJson | null): void => {
    clearTimeout(prefabTimers.current.get(ref))
    prefabTimers.current.delete(ref)
    setSaveState('saving')
    if (value == null) {
      setPrefabLib((lib) => {
        const next = { ...lib }
        delete next[ref]
        return next
      })
      if (view?.kind === 'prefab' && view.ref === ref) setView(null)
      // The file may never have landed (undoing a debounced create): ignore.
      void fs
        .deleteFile(prefabPath(ref))
        .catch(() => {})
        .then(() => setSaveState('saved'))
    } else {
      setPrefabLib((lib) => ({ ...lib, [ref]: value }))
      savePrefab(fs, ref, value)
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'))
    }
    setEpoch((e) => e + 1)
  }

  const applyUiState = (name: string, value: string | null): void => {
    clearTimeout(uiTimers.current.get(name))
    uiTimers.current.delete(name)
    setSaveState('saving')
    if (value == null) {
      setUiLib((lib) => {
        const next = { ...lib }
        delete next[name]
        return next
      })
      if (view?.kind === 'ui' && view.name === name) setView(null)
      void fs
        .deleteFile(uiPath(name))
        .catch(() => {})
        .then(() => setSaveState('saved'))
    } else {
      setUiLib((lib) => ({ ...lib, [name]: value }))
      saveUi(fs, name, value)
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'))
    }
  }

  const applyEntry = async (entry: HistoryEntry, dir: 'undo' | 'redo'): Promise<void> => {
    switch (entry.kind) {
      case 'group': {
        // Undo unwinds a grouped action back-to-front.
        const entries = dir === 'undo' ? [...entry.entries].reverse() : entry.entries
        for (const atom of entries) await applyEntry(atom, dir)
        return
      }
      case 'scene':
        applySceneState(entry.path, dir === 'undo' ? entry.before : entry.after)
        return
      case 'sceneFile':
        await applySceneFile(entry.path, dir === 'undo' ? entry.before : entry.after)
        return
      case 'prefab':
        applyPrefabState(entry.ref, dir === 'undo' ? entry.before : entry.after)
        return
      case 'ui':
        applyUiState(entry.name, dir === 'undo' ? entry.before : entry.after)
        return
      case 'controls':
        applyControls(dir === 'undo' ? entry.before : entry.after)
        return
      case 'stats':
        applyStats(dir === 'undo' ? entry.before : entry.after)
        return
      case 'game':
        applyGameSettings(dir === 'undo' ? entry.before : entry.after)
        return
    }
  }

  /** Jumps to where the change happened so the revert is visible. */
  const revealEntry = (entry: HistoryEntry, dir: 'undo' | 'redo'): void => {
    // A grouped action reveals its last commit (e.g. prefab+scene → the scene).
    const target = entry.kind === 'group' ? entry.entries[entry.entries.length - 1] : entry
    if (!target) return
    const value = dir === 'undo' ? target.before : target.after
    switch (target.kind) {
      case 'scene':
        openView({ kind: 'scene', path: target.path })
        return
      case 'sceneFile':
        if (value != null) openView({ kind: 'scene', path: target.path })
        return
      case 'prefab':
        if (value != null) openView({ kind: 'prefab', ref: target.ref })
        return
      case 'ui':
        if (value != null) openView({ kind: 'ui', name: target.name })
        return
      case 'controls':
        openView({ kind: 'controls' })
        return
      case 'stats':
        openView({ kind: 'stats' })
        return
      case 'game':
        openView({ kind: 'game' })
        return
    }
  }

  const doStep = async (dir: 'undo' | 'redo'): Promise<void> => {
    // Play mode and the animation modal own the keyboard and the data.
    if (mode !== 'edit' || animTarget) return
    const entry = dir === 'undo' ? history.current.undo() : history.current.redo()
    if (!entry) return
    await applyEntry(entry, dir)
    revealEntry(entry, dir)
  }

  // Latest-closure ref so the mount-once key listener sees fresh state.
  const stepRef = useRef(doStep)
  stepRef.current = doStep

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const key = e.key.toLowerCase()
      const isRedo = (key === 'z' && e.shiftKey) || (key === 'y' && !e.metaKey && !e.shiftKey)
      const isUndo = key === 'z' && !e.shiftKey
      if (!isUndo && !isRedo) return
      // Focus in a text field or Monaco keeps the native text undo. Non-text
      // controls (checkboxes, sliders…) have none, so the global undo applies.
      const el = e.target instanceof Element ? e.target : null
      if (el) {
        if (el.closest('textarea, [contenteditable], .monaco-editor')) return
        const input = el.closest('input')
        if (input && !['checkbox', 'radio', 'range', 'color'].includes(input.type)) return
      }
      e.preventDefault()
      void stepRef.current(isUndo ? 'undo' : 'redo')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const sceneName = openScenePath ? sceneLabel(openScenePath) : null

  /** Scaffolds src/states/<state>.ts (never overwrites) and refreshes the list. */
  const createStateFile = async (logic: string, state: string): Promise<void> => {
    const path = stateFilePath(state)
    const existing = await fs.readText(path)
    if (existing == null) await fs.writeText(path, stateFileTemplate(logic, state))
    setStateFiles(await listStateFiles(fs))
  }

  const prefabMachinePatch = (ref: string, patch: Partial<MachineProps>): void => {
    const prefab = prefabLib[ref]
    if (!prefab) return
    let next = prefab
    for (const [key, value] of Object.entries(patch)) {
      next = setPrefabProp(next, 'StateMachine', key, value)
    }
    // Structural: the stage re-instantiates so machines pick up the new graph.
    commitPrefab(ref, next, true)
  }

  const entityMachinePatch = (name: string, patch: Partial<MachineProps>): void => {
    if (!scene) return
    let next = scene
    for (const [key, value] of Object.entries(patch)) {
      next = ops.setComponentProp(next, name, 'StateMachine', key, value, prefabLib)
    }
    commit(next, true)
  }

  const selection: InspectorSelection = (() => {
    if (view?.kind === 'prefab') {
      const prefab = prefabLib[view.ref]
      return prefab ? { kind: 'prefab', ref: view.ref, prefab } : null
    }
    if (view?.kind === 'ui') return { kind: 'ui', name: view.name }
    if (view?.kind === 'script') return { kind: 'script', name: view.name }
    if (view?.kind === 'art') return { kind: 'art', label: view.label, dims: artDims }
    if (view?.kind === 'controls') return { kind: 'controls' }
    if (view?.kind === 'stats') return { kind: 'stats' }
    if (view?.kind === 'game') return { kind: 'game' }
    if (view?.kind === 'scene' && scene && selected === ops.CAMERA_NODE) {
      return {
        kind: 'camera',
        camera: scene.camera,
        entityNames: scene.entities.map((e) => e.name),
      }
    }
    if (view?.kind === 'scene' && scene && multi.length > 1) {
      return {
        kind: 'multi',
        entities: scene.entities.filter((e) => multi.includes(e.name)),
        sceneName: sceneName ?? '',
      }
    }
    if (view?.kind === 'scene' && scene && selected) {
      const entity = scene.entities.find((e) => e.name === selected)
      return entity ? { kind: 'entity', entity, sceneName: sceneName ?? '' } : null
    }
    // Scene open, nothing picked: you're editing the scene itself.
    if (view?.kind === 'scene' && scene) {
      return { kind: 'scene', name: sceneName ?? 'scene', scene }
    }
    return null
  })()

  const center = (() => {
    if (!view) return <div className="ed-vp-hint">select something on the left to open it</div>
    if (view.kind === 'scene') {
      if (!scene) {
        return (
          <div className="ed-vp-hint">
            {sceneFailed ? 'could not read this scene file' : 'loading…'}
          </div>
        )
      }
      return (
        <Viewport
          key={`scene:${view.path}`}
          ref={viewport}
          scene={scene}
          registry={registryWithPrefabs}
          epoch={epoch}
          mode={mode}
          bindings={controls ?? undefined}
          stats={stats ?? undefined}
          resolution={
            gameSettings?.resolution.mode === 'fixed' ? gameSettings.resolution : undefined
          }
          showCamera
          grid={editorSettings?.grid}
          onGridChange={commitGrid}
          selected={selected}
          onSelect={selectEntity}
          onSelectCamera={() => {
            setView({ kind: 'scene', path: view.path })
            selectEntity(ops.CAMERA_NODE)
          }}
          onMoved={(name, position) => commit(ops.moveEntity(scene, name, position))}
          onCameraMoved={(position) => commit(ops.moveCamera(scene, position))}
          onBoxResized={(name, compType, [w, h]) => {
            // The viewport already holds the live values: non-structural commit.
            commit(
              ops.setComponentProp(
                ops.setComponentProp(scene, name, compType, 'width', w, prefabLib),
                name,
                compType,
                'height',
                h,
                prefabLib,
              ),
            )
          }}
          onDropPrefab={(data, world) => {
            // Legacy 'waica/template' payloads carry the base name, not the ref.
            const ref = prefabLib[data]
              ? data
              : Object.keys(prefabLib).find((r) => refBase(r) === data)
            if (!ref) return
            const base = refBase(ref)
            const name = ops.uniqueName(scene, base.charAt(0).toUpperCase() + base.slice(1))
            // The viewport already grid-snapped the drop point when snap is on.
            commit(
              ops.addEntity(scene, {
                name,
                prefab: ref,
                position: [Math.round(world[0] * 100) / 100, Math.round(world[1] * 100) / 100],
              }),
              true,
            )
            selectEntity(name)
          }}
        />
      )
    }
    if (view.kind === 'prefab') {
      return (
        <Viewport
          key={`prefab:${view.ref}`}
          ref={viewport}
          scene={prefabScene ?? EMPTY_SCENE}
          registry={registryWithPrefabs}
          epoch={epoch}
          mode="edit"
          viewHeight={5}
          background={0x211a33}
          grid={editorSettings?.grid}
          onGridChange={commitGrid}
          selected={refBase(view.ref)}
          onSelect={() => {}}
          onMoved={() => {}}
          onBoxResized={(_name, compType, [w, h]) => {
            const prefab = prefabLib[view.ref]
            if (!prefab) return
            commitPrefab(
              view.ref,
              setPrefabProp(setPrefabProp(prefab, compType, 'width', w), compType, 'height', h),
            )
          }}
        />
      )
    }
    if (view.kind === 'ui') {
      const html = uiLib[view.name]
      if (html == null) {
        return <div className="ed-vp-hint">this UI piece no longer exists</div>
      }
      return (
        <UiPane
          key={`ui:${view.name}`}
          name={view.name}
          html={html}
          stats={stats ?? EMPTY_STATS}
          onChange={(next) => commitUi(view.name, next)}
        />
      )
    }
    if (view.kind === 'script') {
      const src = scriptSource(view.name)
      return <CodePane path={`scripts/${src.file}`} source={src.source} readOnly />
    }
    if (view.kind === 'stateFile') {
      // Project state code: a real file, edited for real (⌘S saves).
      return <CodePane key={view.path} fs={fs} path={view.path} />
    }
    if (view.kind === 'controls') {
      if (!controls) return <div className="ed-vp-hint">loading…</div>
      return (
        <ProjectPane savePath={CONTROLS_PATH}>
          <ControlsEditor bindings={controls} onChange={commitControls} />
        </ProjectPane>
      )
    }
    if (view.kind === 'stats') {
      if (!stats) return <div className="ed-vp-hint">loading…</div>
      return (
        <ProjectPane savePath={STATS_PATH}>
          <StatsEditor stats={stats} onChange={commitStats} />
        </ProjectPane>
      )
    }
    if (view.kind === 'game') {
      if (!gameSettings) return <div className="ed-vp-hint">loading…</div>
      return (
        <ProjectPane savePath={GAME_PATH}>
          <GameSettingsEditor settings={gameSettings} onChange={commitGameSettings} />
        </ProjectPane>
      )
    }
    return (
      <ArtStage
        label={view.label}
        url={view.url}
        dims={artDims}
        onDims={(w, h) => setArtDims([w, h])}
      />
    )
  })()

  // Breadcrumb over the center pane: what you're editing, and the way back.
  const crumbTone =
    view?.kind === 'prefab' ? 'prefab' : view?.kind === 'ui' ? 'ui' : view?.kind === 'scene' ? 'scene' : 'neutral'

  const crumbCurrent = (() => {
    switch (view?.kind) {
      case 'prefab':
        return { icon: prefabIcon(refBase(view.ref)), label: view.ref.replace('/', ' / ') }
      case 'ui':
        return { icon: '🧩', label: view.name }
      case 'script':
        return { icon: '📜', label: view.name }
      case 'stateFile':
        return { icon: '📜', label: view.path.split('/').pop() ?? view.path }
      case 'art':
        return { icon: '🖼️', label: view.label }
      case 'controls':
        return { icon: '🎮', label: 'controls' }
      case 'stats':
        return { icon: '📊', label: 'stats' }
      case 'game':
        return { icon: '🕹️', label: 'game' }
      default:
        return null
    }
  })()

  const selectedEntity =
    view?.kind === 'scene' && scene && selected && selected !== ops.CAMERA_NODE
      ? scene.entities.find((e) => e.name === selected)
      : undefined

  const crumbs = view && (
    <div className={`ed-crumbs is-ctx-${crumbTone}`}>
      {view.kind === 'scene' ? (
        selected ? (
          <>
            <button className="ed-crumb" title="Back to the scene" onClick={() => setSelected(null)}>
              <span className="ed-x-ico">🎬</span>
              {sceneName}
            </button>
            <span className="ed-crumb-sep">▸</span>
            <span className="ed-crumb is-current">
              <span className="ed-x-ico">
                {multi.length > 1
                  ? '▣'
                  : selected === ops.CAMERA_NODE
                    ? '🎥'
                    : selectedEntity
                      ? entityIcon(selectedEntity, prefabLib)
                      : '▢'}
              </span>
              {multi.length > 1
                ? `${multi.length} entities`
                : selected === ops.CAMERA_NODE
                  ? 'Camera'
                  : selected}
            </span>
          </>
        ) : (
          <span className="ed-crumb is-current">
            <span className="ed-x-ico">🎬</span>
            {sceneName}
          </span>
        )
      ) : (
        crumbCurrent && (
          <>
            {openScenePath && (
              <button
                className="ed-crumb"
                title="Back to the scene"
                onClick={() => openView({ kind: 'scene', path: openScenePath })}
              >
                ← <span className="ed-x-ico">🎬</span>
                {sceneName}
              </button>
            )}
            {openScenePath && <span className="ed-crumb-sep">▸</span>}
            <span className="ed-crumb is-current">
              <span className="ed-x-ico">{crumbCurrent.icon}</span>
              {crumbCurrent.label}
            </span>
            {view.kind === 'prefab' && (
              <span className="ed-crumb-chip is-prefab">edits reach every instance</span>
            )}
          </>
        )
      )}
    </div>
  )

  return (
    <div className="ed-root">
      <header className="ed-toolbar">
        <span className="ed-brand">🐕 waica</span>
        <span className="ed-project">
          {fs.name}
          {fs.kind === 'memory' && <em className="ed-demo-chip">in-memory demo</em>}
        </span>
        <span className="ed-spacer" />
        <select
          className="ed-scene-select"
          title="Scene to play"
          value={openScenePath ?? ''}
          disabled={mode === 'play' || scenePaths.length === 0}
          onChange={(e) => openView({ kind: 'scene', path: e.target.value })}
        >
          {!openScenePath && (
            <option value="" disabled>
              scene…
            </option>
          )}
          {scenePaths.map((path) => (
            <option key={path} value={path}>
              {sceneLabel(path)}
            </option>
          ))}
        </select>
        <button
          className={`ed-play ${mode === 'play' ? 'is-on' : ''}`}
          disabled={!scene}
          onClick={(e) => {
            // Drop focus so Space (jump) doesn't re-trigger the button.
            e.currentTarget.blur()
            ;(mode === 'edit' ? play : stop)()
          }}
        >
          {mode === 'edit' ? '▶ Play' : '⏹ Stop'}
        </button>
        <span className={`ed-save is-${saveState}`}>
          {saveState === 'saved' ? 'saved ✓' : saveState === 'saving' ? 'saving…' : 'error ✗'}
        </span>
        <button className="ed-mini" onClick={onClose}>
          ← projects
        </button>
      </header>

      <div className="ed-body">
        <aside className="ed-left">
          <Explorer
            fs={fs}
            scenePaths={scenePaths}
            openScenePath={openScenePath}
            scene={scene}
            view={view}
            selected={selected}
            multi={multi}
            prefabLib={prefabLib}
            uiLib={uiLib}
            art={projectArt.art}
            onImportArt={projectArt.importArt}
            onRefreshArt={projectArt.refresh}
            onOpenScene={(path) => openView({ kind: 'scene', path })}
            onSelectEntity={(name) => {
              if (!openScenePath) return
              setView({ kind: 'scene', path: openScenePath })
              selectEntity(name)
            }}
            onToggleEntity={(name) => {
              if (!openScenePath) return
              setView({ kind: 'scene', path: openScenePath })
              toggleEntity(name)
            }}
            onRangeEntities={(names) => {
              if (!openScenePath) return
              setView({ kind: 'scene', path: openScenePath })
              rangeEntities(names)
            }}
            onClearSelection={clearSelection}
            onSelectCamera={() => {
              if (!openScenePath) return
              setView({ kind: 'scene', path: openScenePath })
              selectEntity(ops.CAMERA_NODE)
            }}
            onAddEntity={addEntity}
            onCreateScene={() => void createScene()}
            onCreateFolder={createFolder}
            onRenameFolder={renameFolder}
            onDissolveFolder={dissolveFolder}
            onDeleteFolder={deleteFolder}
            onReorderEntity={reorderEntity}
            onReorderFolder={reorderFolder}
            onOpenPrefab={(ref) => openView({ kind: 'prefab', ref })}
            onOpenScript={(name) => openView({ kind: 'script', name })}
            stateFiles={stateFiles}
            onOpenStateFile={(path) => openView({ kind: 'stateFile', path })}
            onOpenArt={(item: ArtItem) => openView({ kind: 'art', ...item })}
            onOpenControls={() => openView({ kind: 'controls' })}
            onOpenStats={() => openView({ kind: 'stats' })}
            onOpenGame={() => openView({ kind: 'game' })}
            onDuplicateScene={(path) => void duplicateScene(path)}
            onDeleteScene={(path) => void deleteScene(path)}
            onDuplicateEntity={duplicateEntity}
            onDeleteEntity={deleteEntity}
            onRenameEntity={renameEntity}
            onDeleteEntities={deleteEntities}
            onDuplicateEntities={duplicateEntities}
            onReorderEntities={reorderEntities}
            onCreatePrefab={createPrefab}
            onDuplicatePrefab={duplicatePrefab}
            onDeletePrefab={(ref) => void deletePrefab(ref)}
            onAddPrefabToScene={addPrefabToScene}
            onOpenUi={(name) => openView({ kind: 'ui', name })}
            onCreateUi={createUi}
            onDuplicateUi={duplicateUi}
            onDeleteUi={(name) => void deleteUi(name)}
            onToggleUiInScene={toggleUiInScene}
            onArtDeleted={(label) => {
              if (view?.kind === 'art' && view.label === label) setView(null)
            }}
          />
        </aside>

        <main className={`ed-center ${view ? '' : 'is-empty'}`}>
          {crumbs}
          <div className={`ed-stage ${view?.kind === 'prefab' ? 'is-prefab' : ''}`}>{center}</div>
        </main>

        <aside className="ed-right">
          <Inspector
            selection={selection}
            prefabs={prefabLib}
            art={projectArt.art}
            urlFor={projectArt.urlFor}
            onImportArt={projectArt.importArt}
            onRename={renameEntity}
            onMove={(name, position) => {
              if (!scene) return
              viewport.current?.applyMove(name, position[0], position[1])
              commit(ops.moveEntity(scene, name, position), false, `move:${name}`)
            }}
            onProp={(entity, componentType, key, value) => {
              if (!scene) return
              viewport.current?.applyProp(entity, componentType, key, value)
              commit(
                ops.setComponentProp(scene, entity, componentType, key, value, prefabLib),
                false,
                `prop:${entity}:${componentType}:${key}`,
              )
            }}
            onResetProp={(entity, componentType, key) => {
              if (!scene) return
              // Structural commit: the stage re-instantiates and re-resolves
              // the prop from the prefab (no single live value to patch back).
              commit(ops.clearComponentOverride(scene, entity, componentType, key), true)
            }}
            onApplyProp={(entity, componentType, key) => {
              if (!scene) return
              const target = ops.findEntity(scene, entity)
              const ref = target?.prefab
              const prefab = ref ? prefabLib[ref] : undefined
              const value = target?.overrides?.[componentType]?.[key]
              if (!ref || !prefab || value === undefined) return
              // The prefab takes the instance's value; the override becomes
              // redundant and goes away. Other instances' own overrides stay.
              recordBatch(() => {
                commitPrefab(ref, setPrefabProp(prefab, componentType, key, value))
                commit(ops.clearComponentOverride(scene, entity, componentType, key), true)
              })
            }}
            onResetAllProps={(entity) => {
              if (!scene) return
              const target = ops.findEntity(scene, entity)
              const count = target ? ops.countOverrides(target) : 0
              if (!count) return
              const s = count === 1 ? '' : 's'
              if (!window.confirm(`Reset ${count} override${s} back to the prefab's values?`)) return
              commit(ops.clearAllOverrides(scene, entity), true)
            }}
            onApplyAllProps={(entity) => {
              if (!scene) return
              const target = ops.findEntity(scene, entity)
              const ref = target?.prefab
              const prefab = ref ? prefabLib[ref] : undefined
              const count = target ? ops.countOverrides(target) : 0
              if (!ref || !prefab || !count) return
              const s = count === 1 ? '' : 's'
              if (
                !window.confirm(
                  `Apply ${count} override${s} to ${ref}? Every instance gets these values.`,
                )
              ) {
                return
              }
              let next = prefab
              for (const [type, props] of Object.entries(target?.overrides ?? {})) {
                for (const [key, value] of Object.entries(props)) {
                  next = setPrefabProp(next, type, key, value)
                }
              }
              recordBatch(() => {
                commitPrefab(ref, next)
                commit(ops.clearAllOverrides(scene, entity), true)
              })
            }}
            onAddComponent={(entity, type) => {
              if (scene) commit(ops.addComponent(scene, entity, type), true)
            }}
            onRemoveComponent={(entity, type) => {
              if (scene) commit(ops.removeComponent(scene, entity, type, prefabLib), true)
            }}
            onSetEntityCollision={(entity, type) => {
              if (!scene) return
              // Swap in one commit: chained handlers would each see a stale scene.
              let next = scene
              for (const t of ['Hitbox', 'Solid']) next = ops.removeComponent(next, entity, t, prefabLib)
              if (type) next = ops.addComponent(next, entity, type)
              commit(next, true)
            }}
            onSetTexture={(entity, componentType, uri) => {
              if (!scene) return
              // Structural: sprite meshes are built in onReady, so a texture
              // change only shows up after a stage rebuild.
              commit(ops.setComponentProp(scene, entity, componentType, 'texture', uri, prefabLib), true)
            }}
            onDelete={deleteEntity}
            onOpenPrefab={(ref) => openView({ kind: 'prefab', ref })}
            onPrefabProp={(ref, componentType, key, value) => {
              const prefab = prefabLib[ref]
              if (!prefab) return
              // The prefab stage names its single entity after the ref base.
              viewport.current?.applyProp(refBase(ref), componentType, key, value)
              commitPrefab(
                ref,
                setPrefabProp(prefab, componentType, key, value),
                false,
                `prop:${componentType}:${key}`,
              )
            }}
            onPrefabAddComponent={(ref, type) => {
              const prefab = prefabLib[ref]
              if (!prefab || prefab.components.some((c) => c.type === type)) return
              commitPrefab(
                ref,
                { ...prefab, components: [...prefab.components, { type, props: {} }] },
                true,
              )
            }}
            onPrefabRemoveComponent={(ref, type) => {
              const prefab = prefabLib[ref]
              if (!prefab) return
              commitPrefab(
                ref,
                { ...prefab, components: prefab.components.filter((c) => c.type !== type) },
                true,
              )
            }}
            onPrefabToggleAnimated={(ref) => {
              const prefab = prefabLib[ref]
              if (!prefab) return
              const anim = prefab.components.find((c) => c.type === 'AnimatedSprite')
              const clipCount = Object.keys((anim?.props?.clips as object | undefined) ?? {}).length
              if (
                anim &&
                clipCount > 0 &&
                !window.confirm(`Switching to static discards ${clipCount} animation clip(s).`)
              ) {
                return
              }
              const next = toggleAnimated(prefab)
              if (!next) return
              commitPrefab(ref, next, true)
              // Going animated drops you straight into the clip editor.
              if (next.components.some((c) => c.type === 'AnimatedSprite')) {
                setAnimTarget({ kind: 'prefab', ref })
              }
            }}
            onEditAnimation={setAnimTarget}
            onPrefabSetTexture={(ref, uri) => {
              const prefab = prefabLib[ref]
              if (prefab) commitPrefab(ref, setAppearanceTexture(prefab, uri), true)
            }}
            onPrefabSetShape={(ref) => {
              const prefab = prefabLib[ref]
              if (!prefab) return
              const anim = prefab.components.find((c) => c.type === 'AnimatedSprite')
              const clipCount = Object.keys((anim?.props?.clips as object | undefined) ?? {}).length
              if (
                clipCount > 0 &&
                !window.confirm(`Switching to a shape discards ${clipCount} animation clip(s).`)
              ) {
                return
              }
              commitPrefab(ref, setAppearanceShape(prefab), true)
            }}
            onPrefabSetCollision={(ref, enabled) => {
              const prefab = prefabLib[ref]
              if (prefab) commitPrefab(ref, setCollisionEnabled(prefab, enabled), true)
            }}
            onCameraProp={(key, value) => {
              if (scene) commit(ops.setCameraProp(scene, key, value), false, `camera:${key}`)
            }}
            stateFiles={stateFiles}
            onMachinePatch={entityMachinePatch}
            onPrefabMachinePatch={prefabMachinePatch}
            onEditState={setStateTarget}
          />
        </aside>
      </div>

      {animTarget &&
        (() => {
          const comp =
            animTarget.kind === 'prefab'
              ? prefabLib[animTarget.ref]?.components.find((c) => c.type === 'AnimatedSprite')
              : scene?.entities
                  .find((e) => e.name === animTarget.name)
                  ?.components?.find((c) => c.type === 'AnimatedSprite')
          if (!comp) return null
          // A character's clip checklist is its state graph: every state
          // plays the clip of its own name (or its `clip` override) on enter.
          const machine =
            animTarget.kind === 'prefab'
              ? prefabLib[animTarget.ref]?.components.find((c) => c.type === 'StateMachine')
              : undefined
          const states = (machine?.props?.states ?? {}) as Record<string, StateJson | undefined>
          const requiredClips = [
            ...new Set(
              Object.entries(states)
                .filter(([name]) => name !== '*')
                .map(([name, state]) => state?.clip ?? name),
            ),
          ]
          return (
            <AnimationEditor
              title={animTarget.kind === 'prefab' ? animTarget.ref : animTarget.name}
              initial={toAnimatedProps(comp.props)}
              contract={
                requiredClips.length ? { required: requiredClips, fallbacks: {} } : undefined
              }
              art={projectArt.art}
              urlFor={projectArt.urlFor}
              onImportArt={projectArt.importArt}
              onSave={(next) => {
                const props = next as unknown as Record<string, unknown>
                if (animTarget.kind === 'prefab') {
                  const prefab = prefabLib[animTarget.ref]
                  if (prefab) {
                    commitPrefab(
                      animTarget.ref,
                      {
                        ...prefab,
                        components: prefab.components.map((c) =>
                          c.type === 'AnimatedSprite' ? { ...c, props } : c,
                        ),
                      },
                      true,
                    )
                  }
                } else if (scene) {
                  commit(ops.setComponentProps(scene, animTarget.name, 'AnimatedSprite', props), true)
                }
                setAnimTarget(null)
              }}
              onCancel={() => setAnimTarget(null)}
            />
          )
        })()}

      {stateTarget &&
        (() => {
          const comps =
            stateTarget.kind === 'prefab'
              ? prefabLib[stateTarget.ref]?.components
              : scene?.entities.find((e) => e.name === stateTarget.name)?.components
          const comp = comps?.find((c) => c.type === 'StateMachine')
          if (!comp) return null
          const sprite = comps?.find((c) => c.type === 'AnimatedSprite')
          const machine = machineProps(comp)
          return (
            <StateEditorModal
              title={stateTarget.kind === 'prefab' ? stateTarget.ref : stateTarget.name}
              machine={machine}
              state={stateTarget.state}
              clips={Object.keys((sprite?.props?.clips as Record<string, unknown>) ?? {})}
              inputActions={Object.keys(controls ?? {})}
              stateFiles={stateFiles}
              onCreateFile={(state) => void createStateFile(machine.logic, state)}
              onSave={(patch) => {
                if (stateTarget.kind === 'prefab') prefabMachinePatch(stateTarget.ref, patch)
                else entityMachinePatch(stateTarget.name, patch)
                setStateTarget(null)
              }}
              onCancel={() => setStateTarget(null)}
            />
          )
        })()}
    </div>
  )
}
