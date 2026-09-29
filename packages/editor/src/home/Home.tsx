import { useState } from 'react'
import type { ProjectFS } from '../fs/project-fs'
import type { StoredSession } from '../fs/session'
import { reportRejection } from '../report-rejection'
import { ArchetypePicker } from './ArchetypePicker'
import { createProject, openDemo, openProjectFolder } from './home-projects'
import { RecentProjects } from './RecentProjects'
import { useRecents } from './use-recents'

export function Home({
  onOpen,
  resume,
  onResume,
  onDeleted,
}: {
  onOpen(fs: ProjectFS): void
  /** Last session needing a click to re-grant folder access (App.tsx). */
  resume?: StoredSession | null
  onResume?(): void
  /** A project folder was deleted from disk: App.tsx drops any session on it. */
  onDeleted?(name: string): void
}) {
  const canFS = typeof window.showDirectoryPicker === 'function'
  const [busy, setBusy] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const recents = useRecents({ onOpen, setBusy, onDeleted })

  return (
    <div className="home">
      <div className="home-hero">
        <h1>🐕 Waica Editor</h1>
        <p>Pick the game you want to make, drag pieces in, hit Play. Your files, your folder.</p>
      </div>

      {resume && <ResumeCard name={resume.name} onResume={onResume} />}

      <HomeCards
        canFS={canFS}
        busy={!!busy}
        onCreate={() => setPicking(true)}
        onOpenFolder={() => reportRejection(openProjectFolder(onOpen), 'open project folder')}
        onDemo={() => reportRejection(openDemo(onOpen), 'open demo project')}
      />

      {busy && <p className="home-busy">{busy}</p>}
      {!canFS && (
        <p className="home-warn">
          Creating and opening real folders requires Chrome or Edge (File System Access API). The
          demo works in any browser.
        </p>
      )}

      <RecentProjects recents={recents} busy={!!busy} />

      {picking && (
        <ArchetypePicker
          onPick={(archetypeId, name, start) => {
            setPicking(false)
            reportRejection(createProject({ name, start, archetypeId }, { onOpen, setBusy }), 'create project')
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}

function ResumeCard({ name, onResume }: { name: string; onResume?: () => void }) {
  return (
    <button className="home-resume" onClick={onResume}>
      <span className="home-card-icon">⏵</span>
      <span className="home-resume-text">
        <strong>Continue “{name}”</strong>
        <span>Pick up where you left off — the browser asks to re-allow the folder.</span>
      </span>
    </button>
  )
}

/** The three ways in: a new project, an existing folder, or the in-memory demo. */
function HomeCards({
  canFS,
  busy,
  onCreate,
  onOpenFolder,
  onDemo,
}: {
  canFS: boolean
  busy: boolean
  onCreate: () => void
  onOpenFolder: () => void
  onDemo: () => void
}) {
  return (
    <div className="home-cards">
      <button className="home-card" onClick={onCreate} disabled={!canFS || busy}>
        <span className="home-card-icon">✨</span>
        <strong>Create project</strong>
        <span>Pick an archetype, a name and where to save it — Waica scaffolds a playable game inside.</span>
      </button>
      <button className="home-card" onClick={onOpenFolder} disabled={!canFS || busy}>
        <span className="home-card-icon">📂</span>
        <strong>Open project</strong>
        <span>A folder with a waica project (created here or with npm create waica).</span>
      </button>
      <button className="home-card" onClick={onDemo} disabled={busy}>
        <span className="home-card-icon">🎮</span>
        <strong>Try the demo</strong>
        <span>The full editor with an in-memory project — without touching your disk.</span>
      </button>
    </div>
  )
}
