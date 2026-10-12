import { readFile } from 'node:fs/promises'
import { objectRecord } from './component-metadata.js'

/** The 12-byte glb header: magic, version, total length; then the first chunk, which must be the JSON one. */
const HEADER_BYTES = 12
const CHUNK_HEADER_BYTES = 8
const GLB_MAGIC = 0x46546c67
const JSON_CHUNK = 0x4e4f534a

/**
 * The JSON document of a glb (the header and its first chunk, nothing else:
 * the binary chunk is never read), or null for bytes that are not one. Enough
 * to list a file's clips and skins without a loader (issue #166 CA-9).
 */
export function parseGlbDocument(bytes: Uint8Array): Record<string, unknown> | null {
  if (bytes.byteLength < HEADER_BYTES + CHUNK_HEADER_BYTES) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, true) !== GLB_MAGIC) return null
  const chunkLength = view.getUint32(HEADER_BYTES, true)
  if (view.getUint32(HEADER_BYTES + 4, true) !== JSON_CHUNK) return null
  const start = HEADER_BYTES + CHUNK_HEADER_BYTES
  if (start + chunkLength > bytes.byteLength) return null
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes.subarray(start, start + chunkLength)))
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** A `.glb`'s JSON chunk or a `.gltf` parsed as JSON; null when the file is absent or unreadable. */
export async function readModelDocument(file: string): Promise<Record<string, unknown> | null> {
  let bytes: Buffer
  try {
    bytes = await readFile(file)
  } catch {
    return null
  }
  if (/\.glb$/i.test(file)) return parseGlbDocument(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength))
  try {
    const parsed: unknown = JSON.parse(bytes.toString('utf8'))
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
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
