import { useEffect, useState } from 'react'
import { MemFS, RealFS, SCENE_PATH, type ProjectFS } from '../fs/project-fs'
import {
  ensurePermission,
  listRecents,
  removeRecent,
  saveRecent,
  type RecentProject,
} from '../fs/recents'
import { projectFiles } from '../project/template'
import { ACTIVE_ARCHETYPE } from '../project/archetype'
import { ArchetypePicker } from './ArchetypePicker'

async function isEmptyDir(handle: FileSystemDirectoryHandle): Promise<boolean> {
  for await (const _ of handle.entries()) return false
  return true
}

/** Cancelling the picker throws AbortError: that one stays silent. */
function reportPickerError(err: unknown): void {
  if ((err as DOMException | null)?.name === 'AbortError') return
  console.error(err)
  const message = err instanceof Error ? err.message : String(err)
  alert(
    `Could not open the folder picker: ${message}\n\n` +
      'If the editor is running inside an embedded preview (IDE browser, iframe), ' +
      'open it in a regular Chrome/Edge tab instead.',
  )
}

export function Home({ onOpen }: { onOpen(fs: ProjectFS): void }) {
  const canFS = typeof window.showDirectoryPicker === 'function'
  const [recents, setRecents] = useState<RecentProject[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)

  useEffect(() => {
    void listRecents().then(setRecents)
  }, [])

  const create = async (name: string): Promise<void> => {
    if (!window.showDirectoryPicker) return
    try {
      const parent = await window.showDirectoryPicker({ mode: 'readwrite', id: 'waica-new' })
      for await (const [entryName, entry] of parent.entries()) {
        if (entryName !== name) continue
        // Same as create-waica: reusing an empty folder is fine; overwriting something is not.
        if (entry.kind !== 'directory' || !(await isEmptyDir(entry))) {
          alert(`"${parent.name}" already has "${name}" — pick another name or another folder.`)
          return
        }
      }
      setBusy('creating project…')
      const dir = await parent.getDirectoryHandle(name, { create: true })
      const fs = new RealFS(name, dir)
      for (const [path, content] of Object.entries(projectFiles(name))) {
        await fs.writeText(path, content)
      }
      await saveRecent(name, dir)
      onOpen(fs)
    } catch (err) {
      reportPickerError(err)
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
          `"${handle.name}" has no ${SCENE_PATH}. Create the default scene (${ACTIVE_ARCHETYPE.label} archetype) there?`,
        )
        if (!make) return
        await fs.writeText(SCENE_PATH, JSON.stringify(ACTIVE_ARCHETYPE.scene, null, 2) + '\n')
      }
      await saveRecent(handle.name, handle)
      onOpen(fs)
    } catch (err) {
      reportPickerError(err)
    }
  }

  const openRecent = async (recent: RecentProject): Promise<void> => {
    if (await ensurePermission(recent.handle)) {
      onOpen(new RealFS(recent.name, recent.handle))
    }
  }

  const forgetRecent = async (name: string): Promise<void> => {
    await removeRecent(name)
    setRecents(await listRecents())
  }

  const demo = (): void => {
    onOpen(new MemFS('waica-demo', projectFiles('waica-demo')))
  }

  return (
    <div className="home">
      <div className="home-hero">
        <h1>🐕 Waica Editor</h1>
        <p>Pick the game you want to make, drag pieces in, hit Play. Your files, your folder.</p>
      </div>

      <div className="home-cards">
        <button className="home-card" onClick={() => setPicking(true)} disabled={!canFS || !!busy}>
          <span className="home-card-icon">✨</span>
          <strong>Create project</strong>
          <span>Pick an archetype, a name and where to save it — Waica scaffolds a playable game inside.</span>
        </button>
        <button className="home-card" onClick={() => void open()} disabled={!canFS || !!busy}>
          <span className="home-card-icon">📂</span>
          <strong>Open project</strong>
          <span>A folder with a waica project (created here or with npm create waica).</span>
        </button>
        <button className="home-card" onClick={demo} disabled={!!busy}>
          <span className="home-card-icon">🎮</span>
          <strong>Try the demo</strong>
          <span>The full editor with an in-memory project — without touching your disk.</span>
        </button>
      </div>

      {busy && <p className="home-busy">{busy}</p>}
      {!canFS && (
        <p className="home-warn">
          Creating and opening real folders requires Chrome or Edge (File System Access API). The
          demo works in any browser.
        </p>
      )}

      {recents.length > 0 && (
        <div className="home-recents">
          <h2>Recent</h2>
          {recents.map((recent) => (
            <div key={recent.name} className="home-recent">
              <button className="home-recent-open" onClick={() => void openRecent(recent)}>
                📁 {recent.name}
              </button>
              <button
                className="home-recent-remove"
                title="Remove from recents (doesn't delete the folder)"
                onClick={() => void forgetRecent(recent.name)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {picking && (
        <ArchetypePicker
          onPick={(_id, name) => {
            setPicking(false)
            void create(name)
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}
