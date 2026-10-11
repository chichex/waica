// A small RFC 1321 MD5 for the tests that pin a simulation by a hash (the engine
// has no Node typings, so no node:crypto), excluded from builds.

const SHIFTS = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]
const K = Array.from({ length: 64 }, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 2 ** 32) >>> 0)

const rotateLeft = (value: number, bits: number): number => (value << bits) | (value >>> (32 - bits))

function utf8(text: string): number[] {
  return [...new TextEncoder().encode(text)]
}

/** The padded message as little-endian 32-bit words. */
function words(bytes: number[]): number[] {
  const padded = [...bytes, 0x80]
  while (padded.length % 64 !== 56) padded.push(0)
  const bits = bytes.length * 8
  for (let index = 0; index < 8; index += 1) padded.push(Math.floor(bits / 2 ** (8 * index)) & 0xff)
  const out: number[] = []
  for (let index = 0; index < padded.length; index += 4) {
    out.push(((padded[index] ?? 0) | ((padded[index + 1] ?? 0) << 8) | ((padded[index + 2] ?? 0) << 16) | ((padded[index + 3] ?? 0) << 24)) >>> 0)
  }
  return out
}

/** One 64-byte block folded into the running state. */
function fold(state: [number, number, number, number], block: number[]): [number, number, number, number] {
  let [a, b, c, d] = state
  for (let round = 0; round < 64; round += 1) {
    let mix: number
    let index: number
    if (round < 16) {
      mix = (b & c) | (~b & d)
      index = round
    } else if (round < 32) {
      mix = (d & b) | (~d & c)
      index = (5 * round + 1) % 16
    } else if (round < 48) {
      mix = b ^ c ^ d
      index = (3 * round + 5) % 16
    } else {
      mix = c ^ (b | ~d)
      index = (7 * round) % 16
    }
    const shift = SHIFTS[(round >> 4) * 4 + (round % 4)] ?? 0
    const sum = (a + mix + (K[round] ?? 0) + (block[index] ?? 0)) >>> 0
    ;[a, d, c, b] = [d, c, b, (b + rotateLeft(sum, shift)) >>> 0]
  }
  return [(state[0] + a) >>> 0, (state[1] + b) >>> 0, (state[2] + c) >>> 0, (state[3] + d) >>> 0]
}

/** The MD5 of a string's UTF-8 bytes as 32 lowercase hex digits. */
export function md5(text: string): string {
  const message = words(utf8(text))
  let state: [number, number, number, number] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476]
  for (let offset = 0; offset < message.length; offset += 16) state = fold(state, message.slice(offset, offset + 16))
  return state
    .flatMap((word) => [word & 0xff, (word >>> 8) & 0xff, (word >>> 16) & 0xff, (word >>> 24) & 0xff])
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
