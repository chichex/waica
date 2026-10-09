import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { objectRecord } from './component-metadata.js'
import { filesDirectlyIn } from './param-reference-resolution.js'
import { add, type ValidationContext } from './validation-context.js'

/** The uris of a glTF's `buffers[]` and `images[]` entries that are not inline `data:` uris. */
function externalUris(document: Record<string, unknown>): string[] {
  const found: string[] = []
  for (const list of [document.buffers, document.images]) {
    if (!Array.isArray(list)) continue
    for (const entry of list as unknown[]) {
      const uri = objectRecord(entry).uri
      if (typeof uri === 'string' && !uri.startsWith('data:')) found.push(uri)
    }
  }
  return found
}

/**
 * Warns for each `.gltf` directly under `src/art/` that points at files next
 * to it (an external `.bin` or textures): the editor serves the file from a
 * blob url and the built project hashes every art file's name, so those
 * relative uris resolve nowhere and the Model loads empty. A `.glb`, or a
 * `.gltf` whose buffers and images are `data:` uris, is self-contained.
 */
export async function validateGltfResources(projectPath: string, context: Pick<ValidationContext, 'findings'>): Promise<void> {
  for (const file of await filesDirectlyIn(path.join(projectPath, 'src/art'))) {
    if (!/\.gltf$/i.test(file)) continue
    const relative = `src/art/${file}`
    let document: unknown
    try {
      document = JSON.parse(await readFile(path.join(projectPath, relative), 'utf8'))
    } catch {
      continue
    }
    const uris = externalUris(objectRecord(document))
    if (uris.length === 0) continue
    add(
      context,
      'warning',
      'gltf-external-resource',
      `The glTF "${relative}" references external files (${uris.map((uri) => `"${uri}"`).join(', ')}) that will not load in the editor or in the built project; only a .glb, or a .gltf with every buffer and image embedded as a data: uri, works.`,
      relative,
    )
  }
}
