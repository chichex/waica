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

/** The accessor indices one mesh primitive references: its attributes, indices and morph targets. */
function primitiveAccessors(primitive) {
  const targets = (primitive.targets ?? []).flatMap((target) => Object.values(target))
  return [...Object.values(primitive.attributes), ...(primitive.indices === undefined ? [] : [primitive.indices]), ...targets]
}

/** The accessor indices the kept document references: meshes, skins and animations. */
function usedAccessors(json) {
  const meshes = (json.meshes ?? []).flatMap((mesh) => mesh.primitives.flatMap(primitiveAccessors))
  const skins = (json.skins ?? []).flatMap((skin) => (skin.inverseBindMatrices === undefined ? [] : [skin.inverseBindMatrices]))
  const animations = (json.animations ?? []).flatMap((animation) => animation.samplers.flatMap((sampler) => [sampler.input, sampler.output]))
  return new Set([...meshes, ...skins, ...animations])
}

/** Points one record's values (a primitive's attributes, a morph target) at their new accessor indices. */
function renumberRecord(record, renumber) {
  for (const key of Object.keys(record)) record[key] = renumber(record[key])
}

/** Points one mesh primitive's attributes, indices and morph targets at their new accessor indices. */
function renumberPrimitive(primitive, renumber) {
  renumberRecord(primitive.attributes, renumber)
  if (primitive.indices !== undefined) primitive.indices = renumber(primitive.indices)
  for (const target of primitive.targets ?? []) renumberRecord(target, renumber)
}

/** Points every accessor reference of the document at its new index. */
function renumberAccessors(json, renumber) {
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) renumberPrimitive(primitive, renumber)
  for (const skin of json.skins ?? []) if (skin.inverseBindMatrices !== undefined) skin.inverseBindMatrices = renumber(skin.inverseBindMatrices)
  for (const animation of json.animations ?? []) {
    for (const sampler of animation.samplers) {
      sampler.input = renumber(sampler.input)
      sampler.output = renumber(sampler.output)
    }
  }
}

/** Keeps only the meshes some node still draws, renumbering the nodes' references. */
function pruneMeshes(json) {
  const kept = [...new Set(json.nodes.flatMap((node) => (node.mesh === undefined ? [] : [node.mesh])))].sort((a, b) => a - b)
  const remap = new Map(kept.map((index, newIndex) => [index, newIndex]))
  json.meshes = kept.map((index) => json.meshes[index])
  for (const node of json.nodes) if (node.mesh !== undefined) node.mesh = remap.get(node.mesh)
}

/** Appends the bytes of one buffer view to the new binary, padded to 4 bytes, and describes the copy. */
function copier(json, binary) {
  const views = []
  const chunks = []
  let offset = 0
  const copy = (viewIndex) => {
    const view = json.bufferViews[viewIndex]
    const bytes = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
    const padded = Buffer.concat([bytes, Buffer.alloc((4 - (bytes.length % 4)) % 4, 0)])
    views.push({ ...view, buffer: 0, byteOffset: offset })
    chunks.push(padded)
    offset += padded.length
    return views.length - 1
  }
  return { copy, views, binary: () => Buffer.concat(chunks) }
}

/** Rebuilds accessors, bufferViews and the binary from what is used, in first-use order. */
function repack(json, binary) {
  pruneMeshes(json)
  const used = usedAccessors(json)
  const { copy, views, binary: packed } = copier(json, binary)
  const viewRemap = new Map()
  const accessorRemap = new Map()
  const accessors = []
  for (const [index, accessor] of json.accessors.entries()) {
    if (!used.has(index)) continue
    const copied = { ...accessor }
    if (accessor.bufferView !== undefined) {
      if (!viewRemap.has(accessor.bufferView)) viewRemap.set(accessor.bufferView, copy(accessor.bufferView))
      copied.bufferView = viewRemap.get(accessor.bufferView)
    }
    accessorRemap.set(index, accessors.length)
    accessors.push(copied)
  }
  // Images keep their own views (never through an accessor).
  for (const image of json.images ?? []) if (image.bufferView !== undefined) image.bufferView = copy(image.bufferView)
  renumberAccessors(json, (value) => accessorRemap.get(value))
  json.accessors = accessors
  json.bufferViews = views
  const bytes = packed()
  json.buffers = [{ byteLength: bytes.length }]
  return bytes
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
