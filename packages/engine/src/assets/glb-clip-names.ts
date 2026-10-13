// The clip names a glb carries, read from its JSON chunk alone (issue #173
// CA-3): what the editor offers in its clip dropdowns and the MCP validates
// clip references against, without loading the file. Pure: no Node or DOM API
// beyond TextDecoder, so it runs in the browser, in Node and in a worker.

/** The 12-byte glb header (magic, version, total length), then the 8-byte header of the first chunk, which must be JSON. */
const HEADER_BYTES = 12
const CHUNK_HEADER_BYTES = 8
/** 'glTF' and 'JSON', read as little-endian uint32. */
const GLB_MAGIC = 0x46546c67
const JSON_CHUNK = 0x4e4f534a

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The glb's JSON document, or null when the bytes are not a glb or its JSON chunk is cut short or does not parse to an object. */
function glbDocument(bytes: Uint8Array): Record<string, unknown> | null {
  const start = HEADER_BYTES + CHUNK_HEADER_BYTES
  if (bytes.byteLength < start) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(HEADER_BYTES + 4, true) !== JSON_CHUNK) return null
  const length = view.getUint32(HEADER_BYTES, true)
  if (start + length > bytes.byteLength) return null
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes.subarray(start, start + length)))
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * The names of a glb's animation clips, in file order, as three's loader
 * names them: an unnamed clip is `animation_<index>`. Only the header and the
 * JSON chunk are read, so bytes cut off after the JSON chunk still answer.
 * `[]` for a glb with no animations; null for bytes that are not a glb or a
 * JSON chunk that does not parse.
 */
export function glbClipNames(bytes: Uint8Array): string[] | null {
  const document = glbDocument(bytes)
  if (!document) return null
  const animations: unknown[] = Array.isArray(document.animations) ? document.animations : []
  return animations.map((animation, index) => {
    const name = isRecord(animation) ? animation.name : undefined
    return typeof name === 'string' && name ? name : `animation_${index}`
  })
}
