import { useEffect, useMemo, useRef, useState } from 'react'
import type { SceneJson } from '@waica/engine'
import { PLATFORMER_PALETTE } from '@waica/archetype-platformer'
import { SCENE_PATH, type ProjectFS } from '../fs/project-fs'
import * as ops from '../scene/ops'
import { Viewport, type ViewportHandle } from './Viewport'
import { Hierarchy } from './Hierarchy'
import { Palette } from './Palette'
import { Inspector } from './Inspector'
import { FileTree } from './FileTree'
import { CodePane } from './CodePane'

type SaveState = 'saved' | 'saving' | 'error'

export function Editor({ fs, onClose }: { fs: ProjectFS; onClose(): void }) {
  const [scene, setScene] = useState<SceneJson | null>(null)
  const [missing, setMissing] = useState(false)
  const [epoch, setEpoch] = useState(0)
  const [mode, setMode] = useState<'edit' | 'play'>('edit')
  const [selected, setSelected] = useState<string | null>(null)
  const [openFile, setOpenFile] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [coins, setCoins] = useState(0)
  const [treeKey, setTreeKey] = useState(0)
  const viewport = useRef<ViewportHandle>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    void fs.readText(SCENE_PATH).then((text) => {
      if (text == null) {
        setMissing(true)
        return
      }
      try {
        setScene(JSON.parse(text) as SceneJson)
      } catch {
        setMissing(true)
      }
    })
  }, [fs])

  const scheduleSave = (next: SceneJson): void => {
    setSaveState('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      fs.writeText(SCENE_PATH, JSON.stringify(next, null, 2) + '\n')
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'))
    }, 600)
  }

  const commit = (next: SceneJson, structural = false): void => {
    setScene(next)
    if (structural) setEpoch((e) => e + 1)
    scheduleSave(next)
  }

  const templates = useMemo(() => new Map(PLATFORMER_PALETTE.map((t) => [t.label, t])), [])

  if (missing) {
    return (
      <div className="ed-empty">
        <p>Esta carpeta no tiene una escena de Waica ({SCENE_PATH}).</p>
        <button onClick={onClose}>← Volver</button>
      </div>
    )
  }
  if (!scene) return <div className="ed-empty">cargando…</div>

  const play = (): void => {
    setCoins(0)
    setSelected(null)
    setMode('play')
  }
  const stop = (): void => setMode('edit')

  return (
    <div className="ed-root">
      <header className="ed-toolbar">
        <span className="ed-brand">🐕 waica</span>
        <span className="ed-project">
          {fs.name}
          {fs.kind === 'memory' && <em className="ed-demo-chip">demo en memoria</em>}
        </span>
        <span className="ed-spacer" />
        {mode === 'play' && <span className="ed-coins">🪙 {coins}</span>}
        <button className={`ed-play ${mode === 'play' ? 'is-on' : ''}`} onClick={mode === 'edit' ? play : stop}>
          {mode === 'edit' ? '▶ Play' : '⏹ Stop'}
        </button>
        <span className={`ed-save is-${saveState}`}>
          {saveState === 'saved' ? 'guardado ✓' : saveState === 'saving' ? 'guardando…' : 'error ✗'}
        </span>
        <button className="ed-mini" onClick={onClose}>
          ← proyectos
        </button>
      </header>

      <div className="ed-body">
        <aside className="ed-left">
          <Hierarchy
            scene={scene}
            selected={selected}
            onSelect={(name) => {
              setSelected(name)
              setOpenFile(null)
            }}
            onAdd={() => {
              const name = ops.uniqueName(scene, 'Entity')
              commit(
                ops.addEntity(scene, {
                  name,
                  position: [0, 0],
                  components: [
                    { type: 'Sprite', props: { width: 1, height: 1, color: 0x8ecae6 } },
                  ],
                }),
                true,
              )
              setSelected(name)
            }}
          />
          <Palette />
          <FileTree fs={fs} refreshKey={treeKey} open={openFile} onOpen={setOpenFile} />
        </aside>

        <main className="ed-center">
          {openFile ? (
            <CodePane
              fs={fs}
              path={openFile}
              onBack={() => {
                setOpenFile(null)
                setTreeKey((k) => k + 1)
              }}
              onSceneSaved={(next) => {
                setScene(next)
                setEpoch((e) => e + 1)
              }}
            />
          ) : (
            <Viewport
              ref={viewport}
              scene={scene}
              epoch={epoch}
              mode={mode}
              selected={selected}
              onSelect={setSelected}
              onMoved={(name, position) => commit(ops.moveEntity(scene, name, position))}
              onDropTemplate={(label, world) => {
                const template = templates.get(label)
                if (!template) return
                const json = template.make()
                const name = ops.uniqueName(scene, json.name)
                commit(
                  ops.addEntity(scene, {
                    ...json,
                    name,
                    position: [Math.round(world[0] * 2) / 2, Math.round(world[1] * 2) / 2],
                  }),
                  true,
                )
                setSelected(name)
              }}
              onCollect={() => setCoins((c) => c + 1)}
            />
          )}
        </main>

        <aside className="ed-right">
          <Inspector
            scene={scene}
            selected={selected}
            onRename={(from, to) => {
              const name = ops.uniqueName(scene, to)
              commit(ops.renameEntity(scene, from, name), true)
              setSelected(name)
            }}
            onMove={(name, position) => {
              viewport.current?.applyMove(name, position[0], position[1])
              commit(ops.moveEntity(scene, name, position))
            }}
            onProp={(entity, componentType, key, value) => {
              viewport.current?.applyProp(entity, componentType, key, value)
              commit(ops.setComponentProp(scene, entity, componentType, key, value))
            }}
            onAddComponent={(entity, type) => commit(ops.addComponent(scene, entity, type), true)}
            onRemoveComponent={(entity, type) =>
              commit(ops.removeComponent(scene, entity, type), true)
            }
            onDelete={(name) => {
              commit(ops.removeEntity(scene, name), true)
              setSelected(null)
            }}
          />
        </aside>
      </div>
    </div>
  )
}
