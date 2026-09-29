import { useEffect, useState } from 'react'
import { RealFS, SCENE_PATH, type ProjectFS } from './fs/project-fs'
import { ensurePermission, saveRecent } from './fs/recents'
import { clearSession, loadSession, saveSession, type StoredSession } from './fs/session'
import { reportRejection } from './report-rejection'

/** Which project is open, and the stored session that can bring the last one back. */
export interface ProjectSession {
  project: ProjectFS | null
  /** Last session that still needs a click to re-grant folder access. */
  resume: StoredSession | null
  /** Home would flash before an auto-reopen: false until the session check lands. */
  checked: boolean
  open: (fs: ProjectFS) => void
  close: () => void
  /** A project folder was deleted from disk: a session pointing at it goes. */
  forgetDeleted: (name: string) => void
  resumeLast: () => Promise<void>
}

export function useProjectSession(): ProjectSession {
  const [project, setProject] = useState<ProjectFS | null>(null)
  const [resume, setResume] = useState<StoredSession | null>(null)
  const [checked, setChecked] = useState(false)

  // Reopens the last project — straight away when the browser kept the folder
  // permission, via the Home "continue" card when it needs a user gesture.
  useEffect(() => {
    let stale = false
    const reopen = async (): Promise<void> => {
      await reopenLastSession(() => stale, { reopen: setProject, offer: setResume })
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

  const dropResume = (): void => {
    setResume(null)
    reportRejection(clearSession(), 'clear session')
  }

  return {
    project,
    resume,
    checked,
    open,
    close: () => {
      setProject(null)
      // Leaving on purpose: the next visit starts at Home too.
      reportRejection(clearSession(), 'clear session')
    },
    // The folder is gone from disk: a session pointing at it would only offer a
    // "Continue" button that fails on the next click.
    forgetDeleted: (name) => {
      if (resume?.name === name) dropResume()
    },
    resumeLast: () => resumeSession(resume, { open, dropResume }),
  }
}

/** Reopens the stored session when its folder is still allowed; offers it otherwise. */
async function reopenLastSession(
  isStale: () => boolean,
  apply: { reopen: (fs: ProjectFS) => void; offer: (session: StoredSession) => void },
): Promise<void> {
  const session = await loadSession()
  if (isStale() || !session) return
  const desc = { mode: 'readwrite' as const }
  if ((await session.handle.queryPermission?.(desc)) !== 'granted') {
    if (!isStale()) apply.offer(session)
    return
  }
  const fs = new RealFS(session.name, session.handle)
  if ((await fs.readText(SCENE_PATH)) == null) {
    // The folder moved or lost its scene: forget it instead of opening broken.
    reportRejection(clearSession(), 'clear session')
    return
  }
  if (isStale()) return
  apply.reopen(fs)
  reportRejection(saveRecent(session.name, session.handle), 'save recent project')
}

/** The "continue" card: re-grants the folder and opens it, or forgets a folder that moved. */
async function resumeSession(
  resume: StoredSession | null,
  flow: { open: (fs: ProjectFS) => void; dropResume: () => void },
): Promise<void> {
  if (!resume) return
  if (!(await ensurePermission(resume.handle))) return
  const fs = new RealFS(resume.name, resume.handle)
  if ((await fs.readText(SCENE_PATH)) == null) {
    alert(`Could not find ${SCENE_PATH} in "${resume.name}" — the folder moved or changed.`)
    flow.dropResume()
    return
  }
  reportRejection(saveRecent(resume.name, resume.handle), 'save recent project')
  flow.open(fs)
}
