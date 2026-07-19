// Generates Waica's official placeholder pixel-art spritesheets, with no
// dependencies (hand-rolled PNG writer). Outputs in
// packages/archetype-platformer/assets/:
//   waica-dog.png   64×64 — the dog: idle ×4 / run ×4 / jump ×2 / fall ×2
//   waica-coin.png  32×8  — spinning coin ×4
//   waica-slime.png 64×16 — bouncing slime ×4
//
//   node scripts/generate-sprites.mjs

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PALETTE = {
  '.': [0, 0, 0, 0], // transparent
  O: [255, 183, 3, 255], // waica orange
  D: [127, 79, 36, 255], // brown (ears, tail, edges)
  K: [26, 26, 46, 255], // near black (eyes, nose)
  W: [255, 244, 214, 255], // shine
  R: [230, 57, 70, 255], // slime red
}

// ---------- the dog (16×16, 4×4 grid) ----------

const DOG_SIZE = 16
const DOG_BASE = [
  '................',
  '................',
  '..........DD....',
  '..........DOD...',
  '.........OOOO...',
  '.........OKOO...',
  '.........OOOOK..',
  '..D......OOOO...',
  '..DD..OOOOOOO...',
  '...OOOOOOOOOO...',
  '...OOOOOOOOO....',
  '...OOOOOOOOO....',
  '...OO.....OO....',
  '...OO.....OO....',
  '...DD.....DD....',
  '................',
]

const grid = (frame) => frame.map((row) => row.split(''))

function moveRect(m, x0, x1, rowIdxs, dx) {
  const out = m.map((r) => [...r])
  for (const y of rowIdxs) {
    const slice = []
    for (let x = x0; x <= x1; x++) {
      slice.push(m[y][x])
      out[y][x] = '.'
    }
    slice.forEach((ch, i) => {
      const x = x0 + dx + i
      if (ch !== '.' && x >= 0 && x < DOG_SIZE) out[y][x] = ch
    })
  }
  return out
}

const LEG_ROWS = [12, 13, 14]
const frontLegs = (m, dx) => moveRect(m, 10, 11, LEG_ROWS, dx)
const backLegs = (m, dx) => moveRect(m, 3, 4, LEG_ROWS, dx)

function tailDown(m) {
  const out = m.map((r) => [...r])
  out[7][2] = '.'
  return out
}

function blink(m) {
  const out = m.map((r) => [...r])
  out[5][10] = 'O'
  return out
}

const shiftDown = (m) => [Array(DOG_SIZE).fill('.'), ...m.slice(0, DOG_SIZE - 1)]

function tuckLegs(m) {
  const out = m.map((r) => [...r])
  for (const y of [13, 14]) for (let x = 0; x < DOG_SIZE; x++) out[y][x] = '.'
  for (const x of [3, 4, 10, 11]) out[13][x] = 'D'
  return out
}

const dogBase = grid(DOG_BASE)
const DOG_FRAMES = [
  // idle
  dogBase,
  tailDown(dogBase),
  dogBase,
  blink(tailDown(dogBase)),
  // run
  frontLegs(backLegs(dogBase, -1), 1),
  shiftDown(dogBase),
  frontLegs(backLegs(dogBase, 1), -1),
  shiftDown(dogBase),
  // jump
  tuckLegs(dogBase),
  tailDown(tuckLegs(dogBase)),
  null,
  null,
  // fall
  frontLegs(backLegs(dogBase, -2), 2),
  tailDown(frontLegs(backLegs(dogBase, -2), 2)),
  null,
  null,
]

// ---------- the coin (8×8, 4 spin frames) ----------

function coinFrame(width, highlight) {
  const S = 8
  const m = Array.from({ length: S }, () => Array(S).fill('.'))
  const x0 = Math.floor((S - width) / 2)
  const x1 = x0 + width - 1
  for (let y = 1; y <= 6; y++) {
    for (let x = x0; x <= x1; x++) {
      const edge = y === 1 || y === 6 || x === x0 || x === x1
      m[y][x] = edge ? 'D' : 'O'
    }
  }
  if (highlight && width >= 5) m[3][x0 + 1] = 'W'
  return m
}

const COIN_FRAMES = [coinFrame(6, true), coinFrame(4, false), coinFrame(2, false), coinFrame(4, false)]

// ---------- the slime (16×16, 4 bounce frames) ----------

function slimeFrame(squash) {
  const S = 16
  const m = Array.from({ length: S }, () => Array(S).fill('.'))
  const height = 7 - squash
  const width = 11 + squash * 2
  const bottom = 12
  const x0 = Math.floor((S - width) / 2)
  for (let i = 0; i < height; i++) {
    const y = bottom - i
    // rounding: the top rows are narrower
    const inset = i === height - 1 ? 2 : i === height - 2 ? 1 : 0
    for (let x = x0 + inset; x <= x0 + width - 1 - inset; x++) m[y][x] = 'R'
  }
  const eyeY = bottom - height + 3
  m[eyeY][x0 + 3] = 'K'
  m[eyeY][x0 + width - 4] = 'K'
  return m
}

const SLIME_FRAMES = [slimeFrame(0), slimeFrame(1), slimeFrame(2), slimeFrame(1)]

// ---------- minimal PNG writer (RGBA, no filters) ----------

const CRC_TABLE = new Int32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c
}
function crc32(buf) {
  let c = -1
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function chunk(type, data) {
  const t = Buffer.from(type)
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}
function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------- compose sheets and write ----------

function sheet(frames, size, cols) {
  const rows = Math.ceil(frames.length / cols)
  const W = size * cols
  const H = size * rows
  const rgba = Buffer.alloc(W * H * 4)
  frames.forEach((frame, i) => {
    if (!frame) return
    const gx = (i % cols) * size
    const gy = Math.floor(i / cols) * size
    frame.forEach((row, y) => {
      row.forEach((ch, x) => {
        const [r, g, b, a] = PALETTE[ch] ?? PALETTE['.']
        const o = ((gy + y) * W + gx + x) * 4
        rgba[o] = r
        rgba[o + 1] = g
        rgba[o + 2] = b
        rgba[o + 3] = a
      })
    })
  })
  return png(W, H, rgba)
}

const here = dirname(fileURLToPath(import.meta.url))
const assets = join(here, '..', 'packages', 'archetype-platformer', 'assets')
mkdirSync(assets, { recursive: true })

const OUTPUTS = [
  ['waica-dog.png', sheet(DOG_FRAMES, 16, 4)],
  ['waica-coin.png', sheet(COIN_FRAMES, 8, 4)],
  ['waica-slime.png', sheet(SLIME_FRAMES, 16, 4)],
]
for (const [name, buf] of OUTPUTS) {
  writeFileSync(join(assets, name), buf)
  console.log(`spritesheet: ${name} (${buf.length} bytes)`)
}
