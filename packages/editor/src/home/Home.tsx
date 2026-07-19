import { useEffect, useState } from 'react'
import { MemFS, RealFS, SCENE_PATH, type ProjectFS } from '../fs/project-fs'
import { ensurePermission, listRecents, saveRecent, type RecentProject } from '../fs/recents'
import { projectFiles } from '../project/template'
import { PLATFORMER_SCENE } from '@waica/archetype-platformer'

async function isEmptyDir(handle: FileSystemDirectoryHandle): Promise<boolean> {
  for await (const _ of handle.entries()) return false
  return true
}

export function Home({ onOpen }: { onOpen(fs: ProjectFS): void }) {
  const canFS = typeof window.showDirectoryPicker === 'function'
  const [recents, setRecents] = useState<RecentProject[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    void listRecents().then(setRecents)
  }, [])

  const create = async (): Promise<void> => {
    if (!window.showDirectoryPicker) return
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'waica-new' })
      if (!(await isEmptyDir(handle))) {
        alert(`"${handle.name}" no está vacía — elegí o creá una carpeta vacía para el proyecto.`)
        return
      }
      setBusy('creando proyecto…')
      const fs = new RealFS(handle.name, handle)
      for (const [path, content] of Object.entries(projectFiles(handle.name))) {
        await fs.writeText(path, content)
      }
      await saveRecent(handle.name, handle)
      onOpen(fs)
    } catch {
      // picker cancelado
    } finally {
      setBusy(null)
    }
  }

  const open = async (): Promise<void> => {
    if (!window.showDirectoryPicker) return
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'waica-open' })
      const fs = new RealFS(handle.name, handle)
      const scene = await fs.readText(SCENE_PATH)
      if (scene == null) {
        const make = confirm(
          `"${handle.name}" no tiene ${SCENE_PATH}. ¿Crear la escena default del plataformero ahí?`,
        )
        if (!make) return
        await fs.writeText(SCENE_PATH, JSON.stringify(PLATFORMER_SCENE, null, 2) + '\n')
      }
      await saveRecent(handle.name, handle)
      onOpen(fs)
    } catch {
      // picker cancelado
    }
  }

  const openRecent = async (recent: RecentProject): Promise<void> => {
    if (await ensurePermission(recent.handle)) {
      onOpen(new RealFS(recent.name, recent.handle))
    }
  }

  const demo = (): void => {
    onOpen(new MemFS('waica-demo', projectFiles('waica-demo')))
  }

  return (
    <div className="home">
      <div className="home-hero">
        <h1>🐕 Waica Editor</h1>
        <p>Elegí qué juego querés hacer, arrastrá piezas, tocá Play. Tus archivos, tu carpeta.</p>
      </div>

      <div className="home-cards">
        <button className="home-card" onClick={() => void create()} disabled={!canFS || !!busy}>
          <span className="home-card-icon">✨</span>
          <strong>Crear proyecto</strong>
          <span>Elegí una carpeta vacía y Waica arma un plataformero jugable adentro.</span>
        </button>
        <button className="home-card" onClick={() => void open()} disabled={!canFS || !!busy}>
          <span className="home-card-icon">📂</span>
          <strong>Abrir proyecto</strong>
          <span>Una carpeta con un proyecto waica (creado acá o con npm create waica).</span>
        </button>
        <button className="home-card" onClick={demo} disabled={!!busy}>
          <span className="home-card-icon">🎮</span>
          <strong>Probar la demo</strong>
          <span>El editor completo con un proyecto en memoria — sin tocar tu disco.</span>
        </button>
      </div>

      {busy && <p className="home-busy">{busy}</p>}
      {!canFS && (
        <p className="home-warn">
          Para crear y abrir carpetas reales hace falta Chrome o Edge (File System Access API). La
          demo funciona en cualquier navegador.
        </p>
      )}

      {recents.length > 0 && (
        <div className="home-recents">
          <h2>Recientes</h2>
          {recents.map((recent) => (
            <button key={recent.name} className="home-recent" onClick={() => void openRecent(recent)}>
              📁 {recent.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
