import { createWriteStream } from 'node:fs'
import { lstat, readdir, readlink } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { ZipFile } from 'yazl'

async function addTree(zip: ZipFile, dir: string, prefix: string): Promise<void> {
  const entries = (await readdir(dir)).sort()
  for (const entry of entries) {
    const file = path.join(dir, entry)
    const name = `${prefix}/${entry}`
    const info = await lstat(file)
    const options = { mode: info.mode, mtime: info.mtime }
    if (info.isSymbolicLink()) {
      // A symlink stays a symlink entry (its target as the content): a macOS .app's frameworks need them.
      zip.addBuffer(Buffer.from(await readlink(file)), name, { ...options, compress: false })
    } else if (info.isDirectory()) {
      zip.addEmptyDirectory(name, options)
      await addTree(zip, file, name)
    } else {
      zip.addFile(file, name, options)
    }
  }
}

/** Zips `folder` into `zipPath`, the folder itself as the archive's single top-level entry, keeping file modes and symlinks. */
export async function zipDirectory(folder: string, zipPath: string): Promise<void> {
  const zip = new ZipFile()
  // yazl reports a file it cannot read on the ZipFile, not its output stream: fail the output with it.
  zip.on('error', (error: Error) => zip.outputStream.emit('error', error))
  // Settled as a value at once, so a failure while entries are still being added is never an unhandled rejection.
  const outcome = pipeline(zip.outputStream, createWriteStream(zipPath)).then(
    () => null,
    (error: unknown) => error,
  )
  const root = path.basename(folder)
  zip.addEmptyDirectory(root, { mode: (await lstat(folder)).mode })
  await addTree(zip, folder, root)
  zip.end()
  const error = await outcome
  if (error !== null) throw error instanceof Error ? error : new Error(`cannot write ${zipPath}`, { cause: error })
}
