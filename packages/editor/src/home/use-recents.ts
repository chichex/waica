import { useEffect, useState } from 'react'
import { deleteProjectFolder } from '../fs/delete-project'
import { RealFS } from '../fs/project-fs'
import {
  ensurePermission,
  listRecents,
  removeRecent,
  saveRecent,
  type RecentProject,
} from '../fs/recents'
import type { ProjectSink } from './home-projects'

/** The recent projects list, and what can be done with each one. */
export interface Recents {
  recents: RecentProject[]
  open: (recent: RecentProject) => Promise<void>
  /** Drops it from the list; the folder stays on disk. */
  forget: (name: string) => Promise<void>
  /** Deletes the folder itself. Permanent — no Trash, no undo. */
  remove: (recent: RecentProject) => Promise<void>
}

export function useRecents(sink: ProjectSink & { onDeleted?: (name: string) => void }): Recents {
  const [recents, setRecents] = useState<RecentProject[]>([])

  useEffect(() => {
    // A read that lands after this effect was cleaned up is stale.
    let current = true
    listRecents().then(
      (list) => {
        if (current) setRecents(list)
      },
      (error: unknown) => {
        if (current) console.error(error)
      },
    )
    return () => {
      current = false
    }
  }, [])

  const forget = async (name: string): Promise<void> => {
    await removeRecent(name)
    setRecents(await listRecents())
  }

  return {
    recents,
    open: async (recent) => {
      if (await ensurePermission(recent.handle)) {
        await saveRecent(recent.name, recent.handle)
        sink.onOpen(new RealFS(recent.name, recent.handle))
      }
    },
    forget,
    remove: (recent) => deleteRecentFolder(recent, { ...sink, forget }),
  }
}

async function deleteRecentFolder(
  recent: RecentProject,
  sink: ProjectSink & { forget: (name: string) => Promise<void>; onDeleted?: (name: string) => void },
): Promise<void> {
  const confirmed = confirm(
    `Delete “${recent.name}” and everything inside it?\n\n` +
      'The folder is erased from your disk. It does not go to the Trash and this cannot be undone.',
  )
  if (!confirmed) return
  if (!(await ensurePermission(recent.handle))) {
    alert(`“${recent.name}” was not deleted: the browser needs permission on that folder.`)
    return
  }
  sink.setBusy(`deleting ${recent.name}…`)
  try {
    const outcome = await deleteProjectFolder(recent.handle)
    if (outcome === 'emptied') {
      alert(
        `Everything inside “${recent.name}” is gone, but this browser cannot remove the ` +
          'folder itself — delete the empty folder from your file manager.',
      )
    }
    await sink.forget(recent.name)
    sink.onDeleted?.(recent.name)
  } catch (err) {
    console.error(err)
    alert(`Could not delete “${recent.name}”: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    sink.setBusy(null)
  }
}
