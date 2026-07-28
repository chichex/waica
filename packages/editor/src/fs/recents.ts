import { openDb, RECENTS_STORE } from './db'

export interface RecentProject {
  name: string
  handle: FileSystemDirectoryHandle
  openedAt: number
}

export async function saveRecent(name: string, handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(RECENTS_STORE, 'readwrite')
      tx.objectStore(RECENTS_STORE).put({ name, handle, openedAt: Date.now() })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error as Error)
    })
  } catch {
    // Best-effort: the project still opens, it just won't appear in Recent.
  }
}

/** Removes a project from the recents list (doesn't touch the disk folder). */
export async function removeRecent(name: string): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(RECENTS_STORE, 'readwrite')
      tx.objectStore(RECENTS_STORE).delete(name)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error as Error)
    })
  } catch {
    // Best-effort only.
  }
}

export async function listRecents(): Promise<RecentProject[]> {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const req = db.transaction(RECENTS_STORE).objectStore(RECENTS_STORE).getAll()
      req.onsuccess = () =>
        resolve((req.result as RecentProject[]).sort((a, b) => b.openedAt - a.openedAt))
      req.onerror = () => reject(req.error as Error)
    })
  } catch {
    return []
  }
}

/** Re-requests read/write permission on a stored handle. */
export async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const desc = { mode: 'readwrite' as const }
  if ((await handle.queryPermission?.(desc)) === 'granted') return true
  return (await handle.requestPermission?.(desc)) === 'granted'
}
