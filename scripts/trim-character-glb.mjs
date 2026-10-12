// Trims a self-contained glb to the clips and parts a scene uses (issue #166
// CA-17): keeps the named animations, drops the named nodes (gear a character
// pack hangs off its hand slots) with everything under them, keeps only the
// meshes a node still in a scene draws and the accessors and buffer views the
// kept meshes, skins and animations reference, and repacks the binary chunk.
// Materials, textures and images are kept as they are (one shared texture is
// the common case), and the dropped nodes stay in `nodes`, orphaned, so the
// indices of everything else hold. No three, no dependency — the same header
// and chunk layout scripts/generate-smoke-3d-model.mjs writes, so the result
// stays a plain glb with its texture embedded. Deterministic.
// Usage: node scripts/trim-character-glb.mjs <in.glb> <out.glb> --keep-clips Idle,Walking_A --drop-nodes Badge_Shield,2H_Sword
import { readFile, writeFile } from 'node:fs/promises'

const USAGE = 'usage: trim-character-glb.mjs <in.glb> <out.glb> [--keep-clips a,b] [--drop-nodes x,y]'

/** The two positional paths and the two list options, each option needing a value that is not another flag. */
function parseArgs(argv) {
  const positional = []
  const options = { '--keep-clips': [], '--drop-nodes': [] }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument.startsWith('--')) {
      positional.push(argument)
      continue
    }
    const value = argv[index + 1]
    if (!(argument in options) || value === undefined || value.startsWith('--')) throw new Error(`${USAGE}\n${argument} needs a comma-separated value`)
    options[argument] = value.split(',').filter(Boolean)
    index += 1
  }
  const [input, output] = positional
  if (!input || !output || positional.length > 2) throw new Error(USAGE)
  return { input, output, keepClips: options['--keep-clips'], dropNodes: options['--drop-nodes'] }
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

/** Removes the named nodes and their descendants from the graph: from every parent's children, from the scenes, and from what draws. */
function dropNodes(json, names) {
  const dropped = new Set()
  const drop = (index) => {
    if (dropped.has(index)) return
    dropped.add(index)
    for (const child of json.nodes[index].children ?? []) drop(child)
  }
  for (const [index, node] of json.nodes.entries()) if (names.includes(node.name)) drop(index)
  for (const node of json.nodes) if (node.children) node.children = node.children.filter((child) => !dropped.has(child))
  for (const scene of json.scenes) scene.nodes = scene.nodes.filter((root) => !dropped.has(root))
  for (const index of dropped) {
    const node = json.nodes[index]
    delete node.mesh
    delete node.skin
  }
  return dropped
}

/** The nodes a scene reaches: the roots and everything under them. */
function reachableNodes(json) {
  const reached = new Set()
  const visit = (index) => {
    if (reached.has(index)) return
    reached.add(index)
    for (const child of json.nodes[index].children ?? []) visit(child)
  }
  for (const scene of json.scenes) for (const root of scene.nodes) visit(root)
  return reached
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

/** Keeps only the meshes a node a scene reaches still draws, renumbering the nodes' references; an orphaned node loses its mesh. */
function pruneMeshes(json) {
  const reached = reachableNodes(json)
  for (const [index, node] of json.nodes.entries()) if (!reached.has(index)) delete node.mesh
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
  /** The new index of a buffer view, copied on its first use so two users share one copy. */
  const remapView = (viewIndex) => {
    if (!viewRemap.has(viewIndex)) viewRemap.set(viewIndex, copy(viewIndex))
    return viewRemap.get(viewIndex)
  }
  const accessorRemap = new Map()
  const accessors = []
  for (const [index, accessor] of json.accessors.entries()) {
    if (!used.has(index)) continue
    const copied = { ...accessor }
    if (accessor.bufferView !== undefined) copied.bufferView = remapView(accessor.bufferView)
    // A sparse accessor (morph targets, often) keeps its indices and values in views of their own.
    if (accessor.sparse) {
      copied.sparse = {
        ...accessor.sparse,
        indices: { ...accessor.sparse.indices, bufferView: remapView(accessor.sparse.indices.bufferView) },
        values: { ...accessor.sparse.values, bufferView: remapView(accessor.sparse.values.bufferView) },
      }
    }
    accessorRemap.set(index, accessors.length)
    accessors.push(copied)
  }
  // Images keep their own views (never through an accessor).
  for (const image of json.images ?? []) if (image.bufferView !== undefined) image.bufferView = remapView(image.bufferView)
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
