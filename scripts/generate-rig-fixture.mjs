// Writes packages/engine/fixtures/rig.glb: the deterministic skinned rig the
// animation tests and the benchmark use (issue #166 CA-5). One skinned mesh (a
// body and two legs, one material) bound to three bones — root, leg.L and
// leg.R — through one skin, and three clips: idle (1 s, the root bobs on y),
// walk (0.8 s, the legs swing in opposite phase) and jump (0.5 s, the legs
// tuck). GLB bytes assembled by hand like scripts/generate-smoke-3d-model.mjs:
// no three, no exporter, no transcendental function (the quaternions are
// literals), so running it again rewrites the same bytes on every platform.
// Usage: node scripts/generate-rig-fixture.mjs [out.glb]
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const OUT = process.argv[2] ?? fileURLToPath(new URL('../packages/engine/fixtures/rig.glb', import.meta.url))

const FLOAT = 5126
const UNSIGNED_BYTE = 5121
const ARRAY_BUFFER = 34962

/** The joints, in skin order. */
const ROOT = 0
const LEG_L = 1
const LEG_R = 2
/** Where each leg hangs from the root, in the rig's space. */
const HIP = { x: 0.175, y: 0.9 }

/** The twelve triangles of an axis-aligned box, counter-clockwise seen from outside, with their flat normals. */
function box([x0, y0, z0], [x1, y1, z1]) {
  const faces = [
    { normal: [1, 0, 0], quad: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]] },
    { normal: [-1, 0, 0], quad: [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]] },
    { normal: [0, 1, 0], quad: [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]] },
    { normal: [0, -1, 0], quad: [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]] },
    { normal: [0, 0, 1], quad: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]] },
    { normal: [0, 0, -1], quad: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]] },
  ]
  const positions = []
  const normals = []
  for (const { normal, quad } of faces) {
    for (const vertex of [quad[0], quad[1], quad[2], quad[0], quad[2], quad[3]]) {
      positions.push(...vertex)
      normals.push(...normal)
    }
  }
  return { positions, normals }
}

/** A box every vertex of which is bound entirely to one joint. */
function part(min, max, joint) {
  const { positions, normals } = box(min, max)
  const count = positions.length / 3
  return { positions, normals, joints: Array.from({ length: count }, () => [joint, 0, 0, 0]).flat(), weights: Array.from({ length: count }, () => [1, 0, 0, 0]).flat() }
}

const PARTS = [
  part([-0.3, 0.9, -0.15], [0.3, 1.8, 0.15], ROOT),
  part([0.05, 0, -0.12], [0.3, 0.9, 0.12], LEG_L),
  part([-0.3, 0, -0.12], [-0.05, 0.9, 0.12], LEG_R),
]

const merge = (key) => PARTS.flatMap((p) => p[key])
const MESH = { positions: merge('positions'), normals: merge('normals'), joints: merge('joints'), weights: merge('weights') }

/** A rotation about x by the angle whose half-angle sine and cosine are given, as a glTF quaternion [x, y, z, w]. */
const aboutX = (sinHalf, cosHalf) => [sinHalf, 0, 0, cosHalf]
/** 15° half-angle (a 30° swing) and 35° (a 70° tuck), as literals so no platform's Math.sin decides the bytes. */
const SWING = { sin: 0.2588190451, cos: 0.9659258263 }
const TUCK = { sin: 0.5735764364, cos: 0.8191520443 }
const IDENTITY = [0, 0, 0, 1]

const CLIPS = [
  { name: 'idle', times: [0, 0.5, 1], tracks: [{ node: ROOT, path: 'translation', values: [[0, 0, 0], [0, 0.05, 0], [0, 0, 0]] }] },
  {
    name: 'walk',
    times: [0, 0.2, 0.4, 0.6, 0.8],
    tracks: [
      { node: LEG_L, path: 'rotation', values: [IDENTITY, aboutX(SWING.sin, SWING.cos), IDENTITY, aboutX(-SWING.sin, SWING.cos), IDENTITY] },
      { node: LEG_R, path: 'rotation', values: [IDENTITY, aboutX(-SWING.sin, SWING.cos), IDENTITY, aboutX(SWING.sin, SWING.cos), IDENTITY] },
    ],
  },
  {
    name: 'jump',
    times: [0, 0.5],
    tracks: [
      { node: LEG_L, path: 'rotation', values: [IDENTITY, aboutX(-TUCK.sin, TUCK.cos)] },
      { node: LEG_R, path: 'rotation', values: [IDENTITY, aboutX(-TUCK.sin, TUCK.cos)] },
    ],
  },
]

/** Accumulates the binary chunk, its bufferViews and accessors, each view padded to 4 bytes. */
function packer() {
  const chunks = []
  const bufferViews = []
  const accessors = []
  let offset = 0
  const push = (bytes, accessor, target) => {
    const padded = Buffer.concat([bytes, Buffer.alloc((4 - (bytes.length % 4)) % 4, 0)])
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, ...(target ? { target } : {}) })
    accessors.push({ bufferView: bufferViews.length - 1, ...accessor })
    chunks.push(padded)
    offset += padded.length
    return accessors.length - 1
  }
  /** A float accessor of `values` of the given type; `bounds` adds min/max, `target` marks a vertex attribute view. */
  const floats = (values, type, { bounds = {}, target } = {}) =>
    push(Buffer.from(new Float32Array(values).buffer), { componentType: FLOAT, count: values.length / SIZE[type], type, ...bounds }, target)
  return { floats, push, binary: () => Buffer.concat(chunks), bufferViews, accessors }
}

const SIZE = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }

const bounds = (values, size) => ({
  min: Array.from({ length: size }, (_, axis) => Math.min(...values.filter((_, i) => i % size === axis))),
  max: Array.from({ length: size }, (_, axis) => Math.max(...values.filter((_, i) => i % size === axis))),
})

/** The inverse bind matrix of a joint standing at (x, y, 0) in the rig: a translation back to the origin, column-major. */
const inverseBind = (x, y) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, 0, 1]

function build() {
  const pack = packer()
  const position = pack.floats(MESH.positions, 'VEC3', { bounds: bounds(MESH.positions, 3), target: ARRAY_BUFFER })
  const normal = pack.floats(MESH.normals, 'VEC3', { target: ARRAY_BUFFER })
  const joints = pack.push(Buffer.from(new Uint8Array(MESH.joints)), { componentType: UNSIGNED_BYTE, count: MESH.joints.length / 4, type: 'VEC4' }, ARRAY_BUFFER)
  const weights = pack.floats(MESH.weights, 'VEC4', { target: ARRAY_BUFFER })
  const inverseBindMatrices = pack.floats([...inverseBind(0, 0), ...inverseBind(HIP.x, HIP.y), ...inverseBind(-HIP.x, HIP.y)], 'MAT4')
  const animations = CLIPS.map((clip) => {
    const input = pack.floats(clip.times, 'SCALAR', { bounds: bounds(clip.times, 1) })
    const samplers = clip.tracks.map((track) => ({ input, output: pack.floats(track.values.flat(), track.path === 'rotation' ? 'VEC4' : 'VEC3'), interpolation: 'LINEAR' }))
    return {
      name: clip.name,
      samplers,
      channels: clip.tracks.map((track, index) => ({ sampler: index, target: { node: 1 + track.node, path: track.path } })),
    }
  })
  const binary = pack.binary()
  const json = {
    asset: { version: '2.0', generator: 'waica scripts/generate-rig-fixture.mjs' },
    scene: 0,
    scenes: [{ nodes: [0, 1] }],
    nodes: [
      { name: 'Rig', mesh: 0, skin: 0 },
      { name: 'root', translation: [0, 0, 0], children: [2, 3] },
      { name: 'leg.L', translation: [HIP.x, HIP.y, 0] },
      { name: 'leg.R', translation: [-HIP.x, HIP.y, 0] },
    ],
    meshes: [{ name: 'Rig', primitives: [{ attributes: { POSITION: position, NORMAL: normal, JOINTS_0: joints, WEIGHTS_0: weights }, material: 0 }] }],
    materials: [{ name: 'Suit', pbrMetallicRoughness: { baseColorFactor: [0.85, 0.55, 0.25, 1], metallicFactor: 0, roughnessFactor: 0.8 } }],
    skins: [{ name: 'Skin', joints: [1, 2, 3], skeleton: 1, inverseBindMatrices }],
    animations,
    accessors: pack.accessors,
    bufferViews: pack.bufferViews,
    buffers: [{ byteLength: binary.length }],
  }
  return glb(json, binary)
}

function glb(json, binary) {
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

const bytes = build()
await writeFile(OUT, bytes)
console.log(`wrote ${OUT} (${bytes.length} bytes)`)
