import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TOPDOWN_ART } from './art'
import { TOPDOWN_PREFABS } from './prefabs'

/** PNG IHDR: width and height as big-endian u32 at byte offsets 16 and 20. */
function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(fileURLToPath(new URL(`../assets/${file}`, import.meta.url)))
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG')
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

function artFileFor(uri: string): string {
  const row = TOPDOWN_ART.find((art) => art.uri === uri)
  expect(row, uri).toBeDefined()
  return row!.file
}

interface SpriteProps {
  texture?: string
  cols?: number
  rows?: number
  width?: number
  height?: number
  clips?: Record<string, { frames: number[] }>
}

describe('topdown stock art', () => {
  it('ships a real file for every art row', () => {
    for (const art of TOPDOWN_ART) {
      const { width, height } = pngSize(art.file)
      expect(width, art.file).toBeGreaterThan(0)
      expect(height, art.file).toBeGreaterThan(0)
    }
  })

  it('cuts every animated sheet into 16px cells matching its declared grid', () => {
    for (const [ref, prefab] of Object.entries(TOPDOWN_PREFABS)) {
      for (const component of prefab.components) {
        if (component.type !== 'AnimatedSprite') continue
        const sprite = component.props as SpriteProps
        const { width, height } = pngSize(artFileFor(sprite.texture!))
        const cols = sprite.cols ?? 1
        const rows = sprite.rows ?? 1
        expect(width, `${ref} sheet width`).toBe(cols * 16)
        expect(height, `${ref} sheet height`).toBe(rows * 16)
        for (const [clip, def] of Object.entries(sprite.clips ?? {})) {
          for (const frame of def.frames) {
            expect(frame, `${ref} ${clip}`).toBeLessThan(cols * rows)
          }
        }
      }
    }
  })

  it('keeps textured tile art in the aspect its sprite draws', () => {
    for (const [ref, prefab] of Object.entries(TOPDOWN_PREFABS)) {
      for (const component of prefab.components) {
        if (component.type !== 'Sprite') continue
        const sprite = component.props as SpriteProps
        if (!sprite.texture) continue
        const { width, height } = pngSize(artFileFor(sprite.texture))
        expect(height / width, ref).toBe((sprite.height ?? 1) / (sprite.width ?? 1))
      }
    }
  })
})
