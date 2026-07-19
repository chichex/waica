import { useEffect, useMemo, useRef, useState } from 'react'
import type { PrefabJson, SceneJson } from '@waica/engine'
import { ACTIVE_ARCHETYPE } from '../project/archetype'
import type { ProjectFS } from '../fs/project-fs'
import { listScenes, loadPrefabLib, savePrefab } from '../fs/prefab-fs'
import * as ops from '../scene/ops'
import { Viewport, type ViewportHandle } from './Viewport'
import { Explorer, refBase, type ArtItem, type ExplorerView } from './Explorer'
import { Inspector, type InspectorSelection } from './Inspector'
import { CodePane } from './CodePane'
import { scriptSource } from './script-sources'

type SaveState = 'saved' | 'saving' | 'error'

const EMPTY_SCENE: SceneJson = { waicaScene: 2, entities: [] }

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
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [artDims, setArtDims] = useState<[number, number] | null>(null)
  const [prefabLib, setPrefabLib] = useState<Record<string, PrefabJson>>(ACTIVE_ARCHETYPE.prefabs)
  const viewport = useRef<ViewportHandle>(null)
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  // Committed scenes whose write hasn't landed yet: reopening one must show
  // this content, not the stale file on disk.
  const pendingScenes = useRef(new Map<string, SceneJson>())
  const prefabTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    void listScenes(fs).then(setScenePaths)
    void loadPrefabLib(fs).then((lib) => {
      setPrefabLib(lib)
      // The viewport may have loaded with the archetype defaults already.
      setEpoch((e) => e + 1)
    })
  }, [fs])

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
        setScene(JSON.parse(text) as SceneJson)
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

  const commit = (next: SceneJson, structural = false): void => {
    if (!openScenePath) return
    setScene(next)
    if (structural) setEpoch((e) => e + 1)
    scheduleSave(openScenePath, next)
  }

  const commitPrefab = (ref: string, next: PrefabJson, structural = false): void => {
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

  const registryWithPrefabs = useMemo(
    () => ({ ...ACTIVE_ARCHETYPE.registry, prefabs: prefabLib }),
    [prefabLib],
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
      setOpenScenePath(next.path)
    }
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
    setSelected(name)
  }

  const createScene = async (): Promise<void> => {
    const names = new Set(scenePaths.map((p) => p.slice(p.lastIndexOf('/') + 1)))
    let n = 1
    while (names.has(`scene-${n}.scene.json`)) n++
    const path = `src/scenes/scene-${n}.scene.json`
    await fs.writeText(path, JSON.stringify(EMPTY_SCENE, null, 2) + '\n')
    setScenePaths(await listScenes(fs))
    openView({ kind: 'scene', path })
  }

  const play = (): void => {
    setSelected(null)
    setMode('play')
  }
  const stop = (): void => setMode('edit')

  const selection: InspectorSelection = (() => {
    if (view?.kind === 'prefab') {
      const prefab = prefabLib[view.ref]
      return prefab ? { kind: 'prefab', ref: view.ref, prefab } : null
    }
    if (view?.kind === 'script') return { kind: 'script', name: view.name }
    if (view?.kind === 'art') return { kind: 'art', label: view.label, dims: artDims }
    if (view?.kind === 'scene' && scene && selected) {
      const entity = scene.entities.find((e) => e.name === selected)
      return entity ? { kind: 'entity', entity } : null
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
          selected={selected}
          onSelect={setSelected}
          onMoved={(name, position) => commit(ops.moveEntity(scene, name, position))}
          onDropPrefab={(data, world) => {
            // Legacy 'waica/template' payloads carry the base name, not the ref.
            const ref = prefabLib[data]
              ? data
              : Object.keys(prefabLib).find((r) => refBase(r) === data)
            if (!ref) return
            const base = refBase(ref)
            const name = ops.uniqueName(scene, base.charAt(0).toUpperCase() + base.slice(1))
            commit(
              ops.addEntity(scene, {
                name,
                prefab: ref,
                position: [Math.round(world[0] * 2) / 2, Math.round(world[1] * 2) / 2],
              }),
              true,
            )
            setSelected(name)
          }}
        />
      )
    }
    if (view.kind === 'prefab') {
      return (
        <>
          <Viewport
            key={`prefab:${view.ref}`}
            ref={viewport}
            scene={prefabScene ?? EMPTY_SCENE}
            registry={registryWithPrefabs}
            epoch={epoch}
            mode="edit"
            viewHeight={5}
            selected={refBase(view.ref)}
            onSelect={() => {}}
            onMoved={() => {}}
          />
          <div className="ed-stage-caption">{view.ref.replace('/', ' / ')}</div>
        </>
      )
    }
    if (view.kind === 'script') {
      const src = scriptSource(view.name)
      return <CodePane path={`scripts/${src.file}`} source={src.source} readOnly />
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

  return (
    <div className="ed-root">
      <header className="ed-toolbar">
        <span className="ed-brand">🐕 waica</span>
        <span className="ed-project">
          {fs.name}
          {fs.kind === 'memory' && <em className="ed-demo-chip">in-memory demo</em>}
        </span>
        <span className="ed-spacer" />
        <button
          className={`ed-play ${mode === 'play' ? 'is-on' : ''}`}
          disabled={view?.kind !== 'scene' || !scene}
          onClick={mode === 'edit' ? play : stop}
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
            prefabLib={prefabLib}
            onOpenScene={(path) => openView({ kind: 'scene', path })}
            onSelectEntity={(name) => {
              if (!openScenePath) return
              setView({ kind: 'scene', path: openScenePath })
              setSelected(name)
            }}
            onAddEntity={addEntity}
            onCreateScene={() => void createScene()}
            onOpenPrefab={(ref) => openView({ kind: 'prefab', ref })}
            onOpenScript={(name) => openView({ kind: 'script', name })}
            onOpenArt={(item: ArtItem) => openView({ kind: 'art', ...item })}
          />
        </aside>

        <main className={`ed-center ${view ? '' : 'is-empty'}`}>{center}</main>

        <aside className="ed-right">
          <Inspector
            selection={selection}
            prefabs={prefabLib}
            onRename={(from, to) => {
              if (!scene) return
              const name = ops.uniqueName(scene, to)
              commit(ops.renameEntity(scene, from, name), true)
              setSelected(name)
            }}
            onMove={(name, position) => {
              if (!scene) return
              viewport.current?.applyMove(name, position[0], position[1])
              commit(ops.moveEntity(scene, name, position))
            }}
            onProp={(entity, componentType, key, value) => {
              if (!scene) return
              viewport.current?.applyProp(entity, componentType, key, value)
              commit(ops.setComponentProp(scene, entity, componentType, key, value, prefabLib))
            }}
            onAddComponent={(entity, type) => {
              if (scene) commit(ops.addComponent(scene, entity, type), true)
            }}
            onRemoveComponent={(entity, type) => {
              if (scene) commit(ops.removeComponent(scene, entity, type, prefabLib), true)
            }}
            onDelete={(name) => {
              if (!scene) return
              commit(ops.removeEntity(scene, name), true)
              setSelected(null)
            }}
            onOpenPrefab={(ref) => openView({ kind: 'prefab', ref })}
            onPrefabProp={(ref, componentType, key, value) => {
              const prefab = prefabLib[ref]
              if (!prefab) return
              // The prefab stage names its single entity after the ref base.
              viewport.current?.applyProp(refBase(ref), componentType, key, value)
              commitPrefab(ref, setPrefabProp(prefab, componentType, key, value))
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
          />
        </aside>
      </div>
    </div>
  )
}
