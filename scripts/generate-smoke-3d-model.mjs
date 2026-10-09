// Writes examples/smoke-3d/art/tree.glb: a small low-poly tree (a trunk and
// two cones of foliage, two materials), built from nothing but code so the
// example ships a model nobody else owns. Deterministic: running it again
// rewrites the same bytes. Usage: node scripts/generate-smoke-3d-model.mjs
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const SIDES = 8
const OUT = fileURLToPath(new URL('../examples/smoke-3d/art/tree.glb', import.meta.url))

const subtract = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

function normalOf(a, b, c) {
  const n = cross(subtract(b, a), subtract(c, a))
  const length = Math.hypot(...n) || 1
  return n.map((component) => component / length)
}

/** Triangles (counter-clockwise seen from outside) as flat-shaded, non-indexed vertex arrays. */
function flatShaded(triangles) {
  const positions = []
  const normals = []
  for (const [a, b, c] of triangles) {
    const normal = normalOf(a, b, c)
    for (const vertex of [a, b, c]) {
      positions.push(...vertex)
      normals.push(...normal)
    }
  }
  return { positions, normals }
}

const ring = (radius, y) =>
  Array.from({ length: SIDES }, (_, index) => {
    const angle = (index / SIDES) * Math.PI * 2
    return [Math.cos(angle) * radius, y, Math.sin(angle) * radius]
  })

/** A closed cone: its base ring at `y0`, its tip `height` above. */
function cone(radius, y0, height) {
  const base = ring(radius, y0)
  const tip = [0, y0 + height, 0]
  const triangles = []
  for (let index = 0; index < SIDES; index += 1) {
    const next = (index + 1) % SIDES
    triangles.push([base[next], base[index], tip])
    triangles.push([base[index], base[next], [0, y0, 0]])
  }
  return triangles
}

/** A closed cylinder between two heights. */
function cylinder(radius, y0, y1) {
  const bottom = ring(radius, y0)
  const top = ring(radius, y1)
  const triangles = []
  for (let index = 0; index < SIDES; index += 1) {
    const next = (index + 1) % SIDES
    triangles.push([bottom[index], top[index], top[next]])
    triangles.push([bottom[index], top[next], bottom[next]])
    triangles.push([top[next], top[index], [0, y1, 0]])
    triangles.push([bottom[index], bottom[next], [0, y0, 0]])
  }
  return triangles
}

const TRUNK = flatShaded(cylinder(0.16, 0, 0.8))
const FOLIAGE = flatShaded([...cone(0.85, 0.55, 1.2), ...cone(0.6, 1.3, 1.0)])

/** The glTF binary chunk and the accessors/bufferViews that describe it, for the given primitives. */
function packBuffers(primitives) {
  const chunks = []
  const bufferViews = []
  const accessors = []
  let offset = 0
  // `bounds` ({ min, max }) is required on the POSITION accessor.
  const push = (floats, bounds) => {
    const bytes = Buffer.from(new Float32Array(floats).buffer)
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target: 34962 })
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: 5126,
      count: floats.length / 3,
      type: 'VEC3',
      ...bounds,
    })
    chunks.push(bytes)
    offset += bytes.length
    return accessors.length - 1
  }
  const refs = primitives.map(({ positions, normals }) => {
    const xs = [0, 1, 2].map((axis) => positions.filter((_, index) => index % 3 === axis))
    const position = push(positions, { min: xs.map((v) => Math.min(...v)), max: xs.map((v) => Math.max(...v)) })
    const normal = push(normals)
    return { position, normal }
  })
  return { binary: Buffer.concat(chunks), bufferViews, accessors, refs }
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

const material = (name, color) => ({
  name,
  pbrMetallicRoughness: { baseColorFactor: [...color, 1], metallicFactor: 0, roughnessFactor: 0.9 },
})

const { binary, bufferViews, accessors, refs } = packBuffers([TRUNK, FOLIAGE])
const json = {
  asset: { version: '2.0', generator: 'waica scripts/generate-smoke-3d-model.mjs' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ name: 'Tree', mesh: 0 }],
  meshes: [
    {
      name: 'Tree',
      primitives: refs.map(({ position, normal }, index) => ({
        attributes: { POSITION: position, NORMAL: normal },
        material: index,
      })),
    },
  ],
  materials: [material('Trunk', [0.42, 0.27, 0.13]), material('Foliage', [0.2, 0.55, 0.24])],
  accessors,
  bufferViews,
  buffers: [{ byteLength: binary.length }],
}

const bytes = glb(json, binary)
await writeFile(OUT, bytes)
console.log(`wrote ${OUT} (${bytes.length} bytes)`)
