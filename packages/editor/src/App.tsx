import { useEffect, useState } from 'react'
import { RealFS, SCENE_PATH, type ProjectFS } from './fs/project-fs'
import { ensurePermission, saveRecent } from './fs/recents'
import { clearSession, loadSession, saveSession, type StoredSession } from './fs/session'
import { Home } from './home/Home'
import { Editor } from './editor/Editor'
import { reportRejection } from './report-rejection'

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
    const reopen = async (): Promise<void> => {
      const session = await loadSession()
      if (stale) return
      if (session) {
        const desc = { mode: 'readwrite' as const }
        if ((await session.handle.queryPermission?.(desc)) === 'granted') {
          const fs = new RealFS(session.name, session.handle)
          if ((await fs.readText(SCENE_PATH)) != null) {
            if (!stale) {
              setProject(fs)
              reportRejection(saveRecent(session.name, session.handle), 'save recent project')
            }
          } else {
            // The folder moved or lost its scene: forget it instead of opening broken.
            reportRejection(clearSession(), 'clear session')
          }
        } else if (!stale) {
          setResume(session)
        }
      }
      if (!stale) setChecked(true)
    }
    reportRejection(reopen(), 'reopen last project')
    return () => {
      stale = true
    }
  }, [])

  const open = (fs: ProjectFS): void => {
    setResume(null)
    setProject(fs)
    // Demo projects are in-memory: there is nothing to come back to.
    if (fs instanceof RealFS) reportRejection(saveSession(fs.name, fs.handle), 'save session')
  }

  const close = (): void => {
    setProject(null)
    // Leaving on purpose: the next visit starts at Home too.
    reportRejection(clearSession(), 'clear session')
  }

  // The folder is gone from disk: a session pointing at it would only offer a
  // "Continue" button that fails on the next click.
  const forgetDeleted = (name: string): void => {
    if (resume?.name !== name) return
    setResume(null)
    reportRejection(clearSession(), 'clear session')
  }

  const resumeLast = async (): Promise<void> => {
    if (!resume) return
    if (!(await ensurePermission(resume.handle))) return
    const fs = new RealFS(resume.name, resume.handle)
    if ((await fs.readText(SCENE_PATH)) == null) {
      alert(`Could not find ${SCENE_PATH} in "${resume.name}" — the folder moved or changed.`)
      setResume(null)
      reportRejection(clearSession(), 'clear session')
      return
    }
    reportRejection(saveRecent(resume.name, resume.handle), 'save recent project')
    open(fs)
  }

  if (!checked && !project) return null
  return project ? (
    <Editor fs={project} onClose={close} />
  ) : (
    <Home
      onOpen={open}
      resume={resume}
      onResume={() => reportRejection(resumeLast(), 'resume last project')}
      onDeleted={forgetDeleted}
    />
  )
}
