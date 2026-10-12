// Trims a self-contained glb to the clips and parts a scene uses (issue #166
// CA-17): keeps the named animations, drops the named nodes (gear a character
// pack hangs off its hand slots), prunes everything nothing references any
// more, and repacks the binary chunk. No three, no dependency — the same
// header and chunk layout scripts/generate-smoke-3d-model.mjs writes, so the
// result stays a plain glb with its texture embedded. Deterministic.
// Usage: node scripts/trim-character-glb.mjs <in.glb> <out.glb> --keep-clips Idle,Walking_A --drop-nodes Badge_Shield,2H_Sword
import { readFile, writeFile } from 'node:fs/promises'

function parseArgs(argv) {
  const [input, output] = argv
  const option = (name) => {
    const index = argv.indexOf(name)
    return index === -1 ? [] : argv[index + 1].split(',').filter(Boolean)
  }
  if (!input || !output) throw new Error('usage: trim-character-glb.mjs <in.glb> <out.glb> [--keep-clips a,b] [--drop-nodes x,y]')
  return { input, output, keepClips: option('--keep-clips'), dropNodes: option('--drop-nodes') }
}

function readGlb(bytes) {
  const jsonLength = bytes.readUInt32LE(12)
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'))
  const binaryStart = 20 + jsonLength + 8
  const binaryLength = bytes.readUInt32LE(20 + jsonLength)
  return { json, binary: bytes.subarray(binaryStart, binaryStart + binaryLength) }
}

function writeGlb(json, binary) {
  const text = Buffer.from(JSON.stringify(json), 'utf8')
  const jsonChunk = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)])
  const binChunk = Buffer.concat([binary, Buffer.alloc((4 - (binary.length % 4)) % 4, 0)])
  const header = Buffer.alloc(12)
  header.write('glTF', 0, 'ascii')
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8)
  const chunkHeader = (length, type) => {
    const buffer = Buffer.alloc(8)
    buffer.writeUInt32LE(length, 0)
    buffer.write(type, 4, 'latin1')
    return buffer
  }
  return Buffer.concat([header, chunkHeader(jsonChunk.length, 'JSON'), jsonChunk, chunkHeader(binChunk.length, 'BIN\0'), binChunk])
}

/** Removes the named nodes from the graph: from every parent's children and from the scenes. */
function dropNodes(json, names) {
  const dropped = new Set(json.nodes.flatMap((node, index) => (names.includes(node.name) ? [index] : [])))
  for (const node of json.nodes) if (node.children) node.children = node.children.filter((child) => !dropped.has(child))
  for (const scene of json.scenes) scene.nodes = scene.nodes.filter((root) => !dropped.has(root))
  for (const index of dropped) {
    const node = json.nodes[index]
    delete node.mesh
    delete node.skin
  }
  return dropped
}

/** The accessors the kept document references, in first-use order. */
function usedAccessors(json) {
  const used = new Set()
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      for (const accessor of Object.values(primitive.attributes)) used.add(accessor)
      if (primitive.indices !== undefined) used.add(primitive.indices)
      for (const target of primitive.targets ?? []) for (const accessor of Object.values(target)) used.add(accessor)
    }
  }
  for (const skin of json.skins ?? []) if (skin.inverseBindMatrices !== undefined) used.add(skin.inverseBindMatrices)
  for (const animation of json.animations ?? []) {
    for (const sampler of animation.samplers) {
      used.add(sampler.input)
      used.add(sampler.output)
    }
  }
  return used
}

/** Rebuilds accessors, bufferViews and the binary from what is used; `remap` says where each old index went. */
function repack(json, binary) {
  const keptMeshes = new Set(json.nodes.flatMap((node) => (node.mesh !== undefined ? [node.mesh] : [])))
  const meshRemap = new Map()
  json.meshes = json.meshes.filter((_, index) => keptMeshes.has(index)).map((mesh, newIndex, kept) => mesh)
  let meshIndex = 0
  for (let index = 0; index < keptMeshes.size + 100; index += 1) if (keptMeshes.has(index)) meshRemap.set(index, meshIndex++)
  for (const node of json.nodes) if (node.mesh !== undefined) node.mesh = meshRemap.get(node.mesh)

  const used = usedAccessors(json)
  const accessorRemap = new Map()
  const viewRemap = new Map()
  const views = []
  const chunks = []
  let offset = 0
  const accessors = []
  for (const [index, accessor] of json.accessors.entries()) {
    if (!used.has(index)) continue
    const copy = { ...accessor }
    if (accessor.bufferView !== undefined) {
      if (!viewRemap.has(accessor.bufferView)) {
        const view = json.bufferViews[accessor.bufferView]
        const bytes = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
        const padded = Buffer.concat([bytes, Buffer.alloc((4 - (bytes.length % 4)) % 4, 0)])
        viewRemap.set(accessor.bufferView, views.length)
        views.push({ ...view, buffer: 0, byteOffset: offset })
        chunks.push(padded)
        offset += padded.length
      }
      copy.bufferView = viewRemap.get(accessor.bufferView)
    }
    accessorRemap.set(index, accessors.length)
    accessors.push(copy)
  }
  // Images keep their own views (never through an accessor).
  for (const image of json.images ?? []) {
    if (image.bufferView === undefined) continue
    const view = json.bufferViews[image.bufferView]
    const bytes = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
    const padded = Buffer.concat([bytes, Buffer.alloc((4 - (bytes.length % 4)) % 4, 0)])
    image.bufferView = views.length
    views.push({ ...view, buffer: 0, byteOffset: offset })
    chunks.push(padded)
    offset += padded.length
  }
  const renumber = (value) => accessorRemap.get(value)
  for (const mesh of json.meshes) {
    for (const primitive of mesh.primitives) {
      for (const key of Object.keys(primitive.attributes)) primitive.attributes[key] = renumber(primitive.attributes[key])
      if (primitive.indices !== undefined) primitive.indices = renumber(primitive.indices)
      for (const target of primitive.targets ?? []) for (const key of Object.keys(target)) target[key] = renumber(target[key])
    }
  }
  for (const skin of json.skins ?? []) if (skin.inverseBindMatrices !== undefined) skin.inverseBindMatrices = renumber(skin.inverseBindMatrices)
  for (const animation of json.animations ?? []) {
    for (const sampler of animation.samplers) {
      sampler.input = renumber(sampler.input)
      sampler.output = renumber(sampler.output)
    }
  }
  json.accessors = accessors
  json.bufferViews = views
  const packed = Buffer.concat(chunks)
  json.buffers = [{ byteLength: packed.length }]
  return packed
}

const { input, output, keepClips, dropNodes: names } = parseArgs(process.argv.slice(2))
const { json, binary } = readGlb(await readFile(input))
const before = json.animations.map((animation) => animation.name)
if (keepClips.length) {
  for (const name of keepClips) if (!before.includes(name)) throw new Error(`no clip "${name}" in ${input}; it has: ${before.join(', ')}`)
  json.animations = json.animations.filter((animation) => keepClips.includes(animation.name))
}
const dropped = names.length ? dropNodes(json, names) : new Set()
for (const name of names) if (!json.nodes.some((node) => node.name === name)) throw new Error(`no node "${name}" in ${input}`)
const packed = repack(json, binary)
json.asset = { ...json.asset, extras: { ...(json.asset.extras ?? {}), trimmedBy: 'waica scripts/trim-character-glb.mjs', keptClips: json.animations.map((animation) => animation.name), droppedNodes: names } }
const bytes = writeGlb(json, packed)
await writeFile(output, bytes)
console.log(`wrote ${output} (${bytes.length} bytes): ${json.animations.length} of ${before.length} clips, ${dropped.size} nodes dropped`)
