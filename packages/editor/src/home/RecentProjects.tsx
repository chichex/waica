import { reportRejection } from '../report-rejection'
import type { Recents } from './use-recents'

/** The recent projects: reopen one, delete its folder, or drop it from the list. */
export function RecentProjects({ recents, busy }: { recents: Recents; busy: boolean }) {
  if (recents.recents.length === 0) return null
  return (
    <div className="home-recents">
      <h2>Recent</h2>
      {recents.recents.map((recent) => (
        <div key={recent.name} className="home-recent">
          <button
            className="home-recent-open"
            disabled={busy}
            onClick={() => reportRejection(recents.open(recent), 'open recent')}
          >
            📁 {recent.name}
          </button>
          <button
            className="home-recent-delete"
            title="Delete the project folder from your disk — permanent, no Trash"
            aria-label={`Delete ${recent.name} from disk`}
            disabled={busy}
            onClick={() => reportRejection(recents.remove(recent), 'delete recent')}
          >
            🗑️
          </button>
          <button
            className="home-recent-remove"
            title="Remove from recents (doesn't delete the folder)"
            aria-label={`Remove ${recent.name} from recents`}
            disabled={busy}
            onClick={() => reportRejection(recents.forget(recent.name), 'forget recent')}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
