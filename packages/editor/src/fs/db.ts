/**
 * Shared IndexedDB handle for the editor's small persistent records:
 * the recents list and the last-opened session. Directory handles are
 * structured-cloneable, so they round-trip through here across reloads.
 */
export const RECENTS_STORE = 'recents'
export const SESSION_STORE = 'session'

const DB = 'waica-editor'
const VERSION = 2

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(RECENTS_STORE)) {
        db.createObjectStore(RECENTS_STORE, { keyPath: 'name' })
      }
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error as Error)
    // A tab still holding an older version would park this request forever.
    req.onblocked = () => reject(new Error('waica-editor database is open in another tab'))
  })
}
