import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ISOMETRIC_ART } from './art'
import { ISOMETRIC_PREFABS } from './prefabs'

function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(fileURLToPath(new URL(`../assets/${file}`, import.meta.url)))
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG')
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

function artFileFor(uri: string): string {
  const row = ISOMETRIC_ART.find((art) => art.uri === uri)
  expect(row, uri).toBeDefined()
  return row!.file
}

interface AppearanceProps {
  texture?: string
  cols?: number
  rows?: number
  spacingX?: number
  spacingY?: number
  cellWidth?: number
  cellHeight?: number
  cells?: number[]
  solidTiles?: number[]
  width?: number
  height?: number
  clips?: Record<string, { frames: number[] }>
}

describe('isometric stock art', () => {
  it('ships a real PNG for every art row', () => {
    for (const art of ISOMETRIC_ART) {
      const size = pngSize(art.file)
      expect(size.width, art.file).toBeGreaterThan(0)
      expect(size.height, art.file).toBeGreaterThan(0)
    }
  })

  it('cuts every character into five native 32px rows with transparent gutters', () => {
    for (const ref of ['characters/player', 'characters/villager', 'characters/orc']) {
      const component = ISOMETRIC_PREFABS[ref]!.components.find(
        (candidate) => candidate.type === 'AnimatedSprite',
      )!
      const sprite = component.props as AppearanceProps
      const cols = sprite.cols!
      const rows = sprite.rows!
      const size = pngSize(artFileFor(sprite.texture!))
      expect(rows, ref).toBe(5)
      expect(sprite.spacingX, ref).toBe(1)
      expect(sprite.spacingY, ref).toBe(1)
      expect(size.width, ref).toBe(cols * 32 + (cols - 1))
      expect(size.height, ref).toBe(rows * 32 + (rows - 1))
      expect({ width: sprite.width, height: sprite.height }).toEqual({ width: 2, height: 2 })
    }
  })

  it('declares a regular 64x32 ground sheet and valid tile indices', () => {
    const tilemap = ISOMETRIC_PREFABS['tiles/ground']!.components[0]!.props as AppearanceProps
    const cols = tilemap.cols!
    const rows = tilemap.rows!
    const size = pngSize(artFileFor(tilemap.texture!))
    expect(tilemap.cellWidth).toBe(64)
    expect(tilemap.cellHeight).toBe(32)
    expect(tilemap.spacingX).toBe(1)
    expect(tilemap.spacingY).toBe(1)
    expect(size.width).toBe(cols * 64 + (cols - 1))
    expect(size.height).toBe(rows * 32 + (rows - 1))
    for (const index of [...(tilemap.cells ?? []), ...(tilemap.solidTiles ?? [])]) {
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(cols * rows)
    }
  })

  it('keeps every animation frame inside its declared sheet', () => {
    for (const [ref, prefab] of Object.entries(ISOMETRIC_PREFABS)) {
      for (const component of prefab.components) {
        if (component.type !== 'AnimatedSprite') continue
        const sprite = component.props as AppearanceProps
        for (const [clip, definition] of Object.entries(sprite.clips ?? {})) {
          for (const frame of definition.frames) {
            expect(frame, `${ref} ${clip}`).toBeLessThan(sprite.cols! * sprite.rows!)
          }
        }
      }
    }
  })

  it('draws textured props at their PNG aspect', () => {
    for (const ref of ['objects/tree', 'objects/rock', 'objects/crate']) {
      const sprite = ISOMETRIC_PREFABS[ref]!.components.find(
        (candidate) => candidate.type === 'Sprite',
      )!.props as AppearanceProps
      const size = pngSize(artFileFor(sprite.texture!))
      expect((sprite.height ?? 1) / (sprite.width ?? 1), ref).toBeCloseTo(
        size.height / size.width,
        8,
      )
    }
  })
})
