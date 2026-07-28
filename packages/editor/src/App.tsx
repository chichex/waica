import { useEffect, useState } from 'react'
import { RealFS, SCENE_PATH, type ProjectFS } from './fs/project-fs'
import { ensurePermission, saveRecent } from './fs/recents'
import { clearSession, loadSession, saveSession, type StoredSession } from './fs/session'
import { Home } from './home/Home'
import { Editor } from './editor/Editor'

export function App() {
  const [project, setProject] = useState<ProjectFS | null>(null)
  /** Last session that still needs a click to re-grant folder access. */
  const [resume, setResume] = useState<StoredSession | null>(null)
  /** Home would flash before an auto-reopen: blank until the session check lands. */
  const [checked, setChecked] = useState(false)

  // Reopens the last project — straight away when the browser kept the folder
  // permission, via the Home "continue" card when it needs a user gesture.
  useEffect(() => {
    let stale = false
    void (async () => {
      const session = await loadSession()
      if (stale) return
      if (session) {
        const desc = { mode: 'readwrite' as const }
        if ((await session.handle.queryPermission?.(desc)) === 'granted') {
          const fs = new RealFS(session.name, session.handle)
          if ((await fs.readText(SCENE_PATH)) != null) {
            if (!stale) {
              setProject(fs)
              void saveRecent(session.name, session.handle)
            }
          } else {
            // The folder moved or lost its scene: forget it instead of opening broken.
            void clearSession()
          }
        } else if (!stale) {
          setResume(session)
        }
      }
      if (!stale) setChecked(true)
    })()
    return () => {
      stale = true
    }
  }, [])

  const open = (fs: ProjectFS): void => {
    setResume(null)
    setProject(fs)
    // Demo projects are in-memory: there is nothing to come back to.
    if (fs instanceof RealFS) void saveSession(fs.name, fs.handle)
  }

  const close = (): void => {
    setProject(null)
    // Leaving on purpose: the next visit starts at Home too.
    void clearSession()
  }

  const resumeLast = async (): Promise<void> => {
    if (!resume) return
    if (!(await ensurePermission(resume.handle))) return
    const fs = new RealFS(resume.name, resume.handle)
    if ((await fs.readText(SCENE_PATH)) == null) {
      alert(`Could not find ${SCENE_PATH} in "${resume.name}" — the folder moved or changed.`)
      setResume(null)
      void clearSession()
      return
    }
    void saveRecent(resume.name, resume.handle)
    open(fs)
  }

  if (!checked && !project) return null
  return project ? (
    <Editor fs={project} onClose={close} />
  ) : (
    <Home onOpen={open} resume={resume} onResume={() => void resumeLast()} />
  )
}
