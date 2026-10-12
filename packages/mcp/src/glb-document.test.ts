import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { clipNamesOf, parseGlbDocument, readModelDocument, skinsOf } from './glb-document.js'

/** A glb holding `json` as its JSON chunk and a BIN chunk of `binaryBytes` zeros (none by default), the way the generator scripts write one. */
function glbOf(json: unknown, magic = 'glTF', binaryBytes = 0): Uint8Array {
  const text = Buffer.from(JSON.stringify(json), 'utf8')
  const jsonChunk = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)])
  const binChunk = binaryBytes > 0 ? Buffer.concat([chunkHeaderOf(binaryBytes, 'BIN\0'), Buffer.alloc(binaryBytes)]) : Buffer.alloc(0)
  const header = Buffer.alloc(12)
  header.write(magic, 0, 'ascii')
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(12 + 8 + jsonChunk.length + binChunk.length, 8)
  return new Uint8Array(Buffer.concat([header, chunkHeaderOf(jsonChunk.length, 'JSON'), jsonChunk, binChunk]))
}

function chunkHeaderOf(length: number, type: string): Buffer {
  const chunkHeader = Buffer.alloc(8)
  chunkHeader.writeUInt32LE(length, 0)
  chunkHeader.write(type, 4, 'latin1')
  return chunkHeader
}

const DOCUMENT = {
  asset: { version: '2.0' },
  animations: [{ name: 'idle' }, { name: 'walk' }, {}],
  skins: [{ joints: [1, 2, 3] }],
}

const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))

describe('parseGlbDocument (issue #166 CA-9)', () => {
  it('reads the JSON chunk behind the 12-byte header', () => {
    expect(parseGlbDocument(glbOf(DOCUMENT))).toEqual(DOCUMENT)
  })

  it('returns null for bytes that are not a glb, or too short to hold a chunk', () => {
    expect(parseGlbDocument(glbOf(DOCUMENT, 'nope'))).toBeNull()
    expect(parseGlbDocument(new Uint8Array(8))).toBeNull()
    expect(parseGlbDocument(new TextEncoder().encode('{"asset":{}}'))).toBeNull()
  })
})

describe('clipNamesOf and skinsOf (issue #166 CA-9)', () => {
  it('names every animation, an unnamed one as three does (animation_<index>)', () => {
    expect(clipNamesOf(DOCUMENT)).toEqual(['idle', 'walk', 'animation_2'])
    expect(clipNamesOf({ asset: {} })).toEqual([])
  })

  it('lists the skins with their joint counts', () => {
    expect(skinsOf(DOCUMENT)).toEqual([{ joints: 3 }])
    expect(skinsOf({})).toEqual([])
  })
})

describe('readModelDocument (issue #166 CA-9)', () => {
  it('reads a .glb and a .gltf, and gives null for an absent or unreadable file', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'waica-glb-'))
    roots.push(root)
    await writeFile(path.join(root, 'rig.glb'), glbOf(DOCUMENT))
    await writeFile(path.join(root, 'rig.gltf'), JSON.stringify(DOCUMENT))
    await writeFile(path.join(root, 'broken.gltf'), '{ nope')

    expect(await readModelDocument(path.join(root, 'rig.glb'))).toEqual(DOCUMENT)
    expect(await readModelDocument(path.join(root, 'rig.gltf'))).toEqual(DOCUMENT)
    expect(await readModelDocument(path.join(root, 'broken.gltf'))).toBeNull()
    expect(await readModelDocument(path.join(root, 'missing.glb'))).toBeNull()
  })

  it('reads the JSON chunk of a .glb with a large BIN chunk behind it, and gives null for a file cut short of its JSON chunk (review of PR #168)', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'waica-glb-'))
    roots.push(root)
    const whole = glbOf(DOCUMENT, 'glTF', 1 << 20)
    await writeFile(path.join(root, 'heavy.glb'), whole)
    await writeFile(path.join(root, 'cut.glb'), whole.subarray(0, 40))
    await writeFile(path.join(root, 'header-only.glb'), whole.subarray(0, 12))

    expect(await readModelDocument(path.join(root, 'heavy.glb'))).toEqual(DOCUMENT)
    expect(await readModelDocument(path.join(root, 'cut.glb'))).toBeNull()
    expect(await readModelDocument(path.join(root, 'header-only.glb'))).toBeNull()
  })
})
