// Genera el spritesheet placeholder oficial de Waica: la perrita 🐕 en
// pixel art 16×16, grilla 4×4 (fila 0: idle ×4, fila 1: run ×4,
// fila 2: jump ×2, fila 3: fall ×2). Salida: PNG RGBA sin dependencias.
//
//   node scripts/generate-dog-sheet.mjs

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIZE = 16
const COLS = 4
const ROWS = 4

const PALETTE = {
  '.': [0, 0, 0, 0], // transparente
  O: [255, 183, 3, 255], // naranja waica
  D: [127, 79, 36, 255], // marrón (orejas, cola, pies)
  K: [26, 26, 46, 255], // casi negro (ojo, nariz)
}

// Perfil mirando a la derecha: cabeza cols 9-13, cola cols 2-3, patas abajo.
const BASE = [
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
const rows = (m) => m.map((r) => r.join(''))

/** Mueve horizontalmente los píxeles de las columnas [x0,x1] en esas filas. */
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
      if (ch !== '.' && x >= 0 && x < SIZE) out[y][x] = ch
    })
  }
  return out
}

const LEG_ROWS = [12, 13, 14]
const frontLegs = (m, dx) => moveRect(m, 10, 11, LEG_ROWS, dx)
const backLegs = (m, dx) => moveRect(m, 3, 4, LEG_ROWS, dx)

function tailDown(m) {
  const out = m.map((r) => [...r])
  out[7][2] = '.' // baja la punta de la cola
  return out
}

function blink(m) {
  const out = m.map((r) => [...r])
  out[5][10] = 'O'
  return out
}

function shiftDown(m) {
  return [Array(SIZE).fill('.'), ...m.slice(0, SIZE - 1)]
}

function tuckLegs(m) {
  // Patas recogidas para el salto: se acortan una fila.
  let out = m.map((r) => [...r])
  for (const y of [13, 14]) for (let x = 0; x < SIZE; x++) out[y][x] = '.'
  for (const x of [3, 4, 10, 11]) out[13][x] = 'D'
  return out
}

const base = grid(BASE)

const FRAMES = [
  // idle: respira, mueve la cola, parpadea
  base,
  tailDown(base),
  base,
  blink(tailDown(base)),
  // run: dos fases de patas con rebote
  frontLegs(backLegs(base, -1), 1),
  shiftDown(base),
  frontLegs(backLegs(base, 1), -1),
  shiftDown(base),
  // jump: patas recogidas, cola arriba
  tuckLegs(base),
  tailDown(tuckLegs(base)),
  null,
  null,
  // fall: patas estiradas
  frontLegs(backLegs(base, -2), 2),
  tailDown(frontLegs(backLegs(base, -2), 2)),
  null,
  null,
].map((f) => (f ? rows(f) : null))

// ---- PNG writer mínimo (RGBA, sin filtros) ----

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
    raw[y * (width * 4 + 1)] = 0 // filtro: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---- Componer la grilla y escribir ----

const W = SIZE * COLS
const H = SIZE * ROWS
const rgba = Buffer.alloc(W * H * 4)
FRAMES.forEach((frame, i) => {
  if (!frame) return
  const gx = (i % COLS) * SIZE
  const gy = Math.floor(i / COLS) * SIZE
  frame.forEach((row, y) => {
    ;[...row].forEach((ch, x) => {
      const [r, g, b, a] = PALETTE[ch] ?? PALETTE['.']
      const o = ((gy + y) * W + gx + x) * 4
      rgba[o] = r
      rgba[o + 1] = g
      rgba[o + 2] = b
      rgba[o + 3] = a
    })
  })
})

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', 'packages', 'archetype-platformer', 'assets', 'waica-dog.png')
mkdirSync(dirname(out), { recursive: true })
const buf = png(W, H, rgba)
writeFileSync(out, buf)
console.log(`spritesheet: ${out} (${W}×${H}, ${buf.length} bytes)`)
