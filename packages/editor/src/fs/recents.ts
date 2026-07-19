export interface RecentProject {
  name: string
  handle: FileSystemDirectoryHandle
  openedAt: number
}

const DB = 'waica-editor'
const STORE = 'recents'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'name' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error as Error)
  })
}

export async function saveRecent(name: string, handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put({ name, handle, openedAt: Date.now() })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error as Error)
  })
}

export async function listRecents(): Promise<RecentProject[]> {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).getAll()
      req.onsuccess = () =>
        resolve((req.result as RecentProject[]).sort((a, b) => b.openedAt - a.openedAt))
      req.onerror = () => reject(req.error as Error)
    })
  } catch {
    return []
  }
}

/** Re-pide permiso de lectura/escritura sobre un handle guardado. */
export async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const desc = { mode: 'readwrite' as const }
  if ((await handle.queryPermission?.(desc)) === 'granted') return true
  return (await handle.requestPermission?.(desc)) === 'granted'
}
