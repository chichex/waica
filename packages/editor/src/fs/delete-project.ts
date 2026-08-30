/**
 * Deleting a project folder from disk. The File System Access API removes for
 * real — nothing lands in the Trash and there is no undo — so every caller
 * confirms with the user first.
 */

export type DeleteOutcome =
  /** The folder itself is gone. */
  | 'deleted'
  /** Contents are gone; the (now empty) folder stayed — no remove() support. */
  | 'emptied'
  /** Nothing to delete: the folder had already moved or been deleted outside. */
  | 'missing'

function isMissing(err: unknown): boolean {
  return (err as DOMException | null)?.name === 'NotFoundError'
}

/** Removes every entry of a directory, leaving the directory itself in place. */
async function emptyDir(handle: FileSystemDirectoryHandle): Promise<void> {
  // Collected up front: removing entries while iterating the same directory
  // is not something the API promises to survive.
  const names: string[] = []
  for await (const [name] of handle.entries()) names.push(name)
  for (const name of names) {
    try {
      await handle.removeEntry(name, { recursive: true })
    } catch (err) {
      if (!isMissing(err)) throw err
    }
  }
}

/**
 * Deletes the project folder the handle points at, recursively.
 *
 * Browsers without `FileSystemHandle.remove()` (Chromium < 110) can only empty
 * the folder from the inside: that is reported as `'emptied'` so the UI can say
 * the folder is still there. Permission failures are thrown, not swallowed —
 * "deleted" must never be reported for a folder that survived.
 */
export async function deleteProjectFolder(
  handle: FileSystemDirectoryHandle,
): Promise<DeleteOutcome> {
  try {
    if (typeof handle.remove === 'function') {
      await handle.remove({ recursive: true })
      return 'deleted'
    }
    await emptyDir(handle)
    return 'emptied'
  } catch (err) {
    if (isMissing(err)) return 'missing'
    throw err
  }
}
