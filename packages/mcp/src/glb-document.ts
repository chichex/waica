import { open, readFile, type FileHandle } from 'node:fs/promises'
import { objectRecord } from './component-metadata.js'

/** glTF in its two forms (matches MODEL_RE in the editor's use-project-art.ts). */
export const MODEL_FILE_RE = /\.(glb|gltf)$/i

/** The 12-byte glb header: magic, version, total length; then the first chunk, which must be the JSON one. */
const HEADER_BYTES = 12
const CHUNK_HEADER_BYTES = 8
const GLB_MAGIC = 0x46546c67
const JSON_CHUNK = 0x4e4f534a

/** The parsed text when it is a JSON object; null for anything else. */
function jsonObjectOf(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** The JSON chunk's offset and length behind a glb header and chunk header, or null when the bytes are not that. */
function jsonChunkOf(head: Uint8Array): { start: number; length: number } | null {
  if (head.byteLength < HEADER_BYTES + CHUNK_HEADER_BYTES) return null
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength)
  if (view.getUint32(0, true) !== GLB_MAGIC) return null
  if (view.getUint32(HEADER_BYTES + 4, true) !== JSON_CHUNK) return null
  return { start: HEADER_BYTES + CHUNK_HEADER_BYTES, length: view.getUint32(HEADER_BYTES, true) }
}

/**
 * The JSON document of a glb (the header and its first chunk, nothing else:
 * the binary chunk is never read), or null for bytes that are not one. Enough
 * to list a file's clips and skins without a loader (issue #166 CA-9).
 */
export function parseGlbDocument(bytes: Uint8Array): Record<string, unknown> | null {
  const chunk = jsonChunkOf(bytes)
  if (!chunk || chunk.start + chunk.length > bytes.byteLength) return null
  return jsonObjectOf(new TextDecoder().decode(bytes.subarray(chunk.start, chunk.start + chunk.length)))
}

/**
 * A `.glb`'s JSON chunk read in place — the 20 bytes of headers, then only
 * the chunk the headers announce, never the binary chunk that makes up most
 * of a file (review of PR #168) — or a `.gltf` parsed as JSON; null when the
 * file is absent, unreadable or not what its extension says.
 */
export async function readModelDocument(file: string): Promise<Record<string, unknown> | null> {
  if (/\.glb$/i.test(file)) return readGlbDocument(file)
  try {
    return jsonObjectOf(await readFile(file, 'utf8'))
  } catch {
    return null
  }
}

async function readGlbDocument(file: string): Promise<Record<string, unknown> | null> {
  let handle: FileHandle
  try {
    handle = await open(file, 'r')
  } catch {
    return null
  }
  try {
    const head = new Uint8Array(HEADER_BYTES + CHUNK_HEADER_BYTES)
    const chunk = (await handle.read(head, 0, head.byteLength, 0)).bytesRead === head.byteLength ? jsonChunkOf(head) : null
    // The announced length is bounded by the file before anything is allocated for it.
    if (!chunk || chunk.start + chunk.length > (await handle.stat()).size) return null
    const text = new Uint8Array(chunk.length)
    if ((await handle.read(text, 0, chunk.length, chunk.start)).bytesRead !== chunk.length) return null
    return jsonObjectOf(new TextDecoder().decode(text))
  } finally {
    await handle.close()
  }
}

/** The clip names a loader gives the document's animations: their `name`, or `animation_<index>` like three does. */
export function clipNamesOf(document: Record<string, unknown>): string[] {
  const animations = Array.isArray(document.animations) ? (document.animations as unknown[]) : []
  return animations.map((animation, index) => {
    const name = objectRecord(animation).name
    return typeof name === 'string' && name ? name : `animation_${index}`
  })
}

/** The document's skins as their joint counts. */
export function skinsOf(document: Record<string, unknown>): Array<{ joints: number }> {
  const skins = Array.isArray(document.skins) ? (document.skins as unknown[]) : []
  return skins.map((skin) => {
    const joints = objectRecord(skin).joints
    return { joints: Array.isArray(joints) ? joints.length : 0 }
  })
}
