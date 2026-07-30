import { useEffect, useState } from 'react'
import { MemFS, RealFS, SCENE_PATH, type ProjectFS } from '../fs/project-fs'
import {
  ensurePermission,
  listRecents,
  removeRecent,
  saveRecent,
  type RecentProject,
} from '../fs/recents'
import type { StoredSession } from '../fs/session'
import { projectArtFiles, projectFiles, type ProjectStart } from '../project/template'
import { resolveArchetype } from '../project/archetype'
import { GAME_PATH, parseGameSettings } from '../project/game'
import { ArchetypePicker } from './ArchetypePicker'

async function isEmptyDir(handle: FileSystemDirectoryHandle): Promise<boolean> {
  for await (const _ of handle.entries()) return false
  return true
}

/** Downloads the archetype's bundled art into the project (demo start only). */
async function writeArtFiles(
  fs: ProjectFS,
  start: ProjectStart,
  archetypeId: string,
): Promise<void> {
  for (const [path, url] of Object.entries(projectArtFiles(start, archetypeId))) {
    const bytes = await (await fetch(url)).arrayBuffer()
    await fs.writeFile(path, new Uint8Array(bytes))
  }
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

export function Home({
  onOpen,
  resume,
  onResume,
}: {
  onOpen(fs: ProjectFS): void
  /** Last session needing a click to re-grant folder access (App.tsx). */
  resume?: StoredSession | null
  onResume?(): void
}) {
  const canFS = typeof window.showDirectoryPicker === 'function'
  const [recents, setRecents] = useState<RecentProject[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)

  useEffect(() => {
    void listRecents().then(setRecents)
  }, [])

  const create = async (name: string, start: ProjectStart, archetypeId: string): Promise<void> => {
    if (!window.showDirectoryPicker) return
    try {
      const parent = await window.showDirectoryPicker({ mode: 'readwrite', id: 'waica-new' })
      for await (const [entryName, entry] of parent.entries()) {
        if (entryName !== name) continue
        // Reusing an empty folder is fine; overwriting something is not.
        if (entry.kind !== 'directory' || !(await isEmptyDir(entry))) {
          alert(`"${parent.name}" already has "${name}" — pick another name or another folder.`)
          return
        }
      }
      setBusy('creating project…')
      const dir = await parent.getDirectoryHandle(name, { create: true })
      const fs = new RealFS(name, dir)
      for (const [path, content] of Object.entries(projectFiles(name, start, archetypeId))) {
        await fs.writeText(path, content)
      }
      await writeArtFiles(fs, start, archetypeId)
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
        const settings = parseGameSettings(await fs.readText(GAME_PATH))
        const archetype = resolveArchetype(settings.archetype)
        const make = confirm(
          `"${handle.name}" has no ${SCENE_PATH}. Create an empty scene (${archetype.label} archetype) there?`,
        )
        if (!make) return
        // Empty, not the demo level: that scene instances prefabs, and this
        // folder has no prefab files to instance. "Create project" → Demo
        // level is the playable start — it writes the prefabs and the art
        // alongside the scene.
        await fs.writeText(SCENE_PATH, JSON.stringify(archetype.blankScene, null, 2) + '\n')
      }
      await saveRecent(handle.name, handle)
      onOpen(fs)
    } catch (err) {
      reportPickerError(err)
    }
  }

  const openRecent = async (recent: RecentProject): Promise<void> => {
    if (await ensurePermission(recent.handle)) {
      await saveRecent(recent.name, recent.handle)
      onOpen(new RealFS(recent.name, recent.handle))
    }
  }

  const forgetRecent = async (name: string): Promise<void> => {
    await removeRecent(name)
    setRecents(await listRecents())
  }

  const demo = async (): Promise<void> => {
    const fs = new MemFS('waica-demo', projectFiles('waica-demo', 'demo', 'platformer'))
    await writeArtFiles(fs, 'demo', 'platformer')
    onOpen(fs)
  }

  return (
    <div className="home">
      <div className="home-hero">
        <h1>🐕 Waica Editor</h1>
        <p>Pick the game you want to make, drag pieces in, hit Play. Your files, your folder.</p>
      </div>

      {resume && (
        <button className="home-resume" onClick={onResume}>
          <span className="home-card-icon">⏵</span>
          <span className="home-resume-text">
            <strong>Continue “{resume.name}”</strong>
            <span>Pick up where you left off — the browser asks to re-allow the folder.</span>
          </span>
        </button>
      )}

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
        <button className="home-card" onClick={() => void demo()} disabled={!!busy}>
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
          onPick={(id, name, start) => {
            setPicking(false)
            void create(name, start, id)
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}
