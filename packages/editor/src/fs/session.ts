import { openDb, SESSION_STORE } from './db'

/**
 * The project to reopen on the next visit. Saved whenever a real project
 * opens, cleared by "← projects": leaving on purpose means the next visit
 * starts at Home. Everything here is best-effort — without it the editor
 * still works, it just forgets where you were.
 */
export interface StoredSession {
  name: string
  handle: FileSystemDirectoryHandle
  openedAt: number
}

const KEY = 'current'

export async function saveSession(name: string, handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SESSION_STORE, 'readwrite')
      tx.objectStore(SESSION_STORE).put({ name, handle, openedAt: Date.now() }, KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error as Error)
    })
  } catch {
    // Best-effort only.
  }
}

export async function clearSession(): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SESSION_STORE, 'readwrite')
      tx.objectStore(SESSION_STORE).delete(KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error as Error)
    })
  } catch {
    // Best-effort only.
  }
}

export async function loadSession(): Promise<StoredSession | null> {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const req = db.transaction(SESSION_STORE).objectStore(SESSION_STORE).get(KEY)
      req.onsuccess = () => {
        const value = req.result as StoredSession | undefined
        resolve(value && typeof value.name === 'string' && value.handle ? value : null)
      }
      req.onerror = () => reject(req.error as Error)
    })
  } catch {
    return null
  }
}
