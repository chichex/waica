import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { ArchetypeArt } from '@waica/engine'
import { ISOMETRIC_ART } from './art'
import { ISOMETRIC_PREFABS } from './prefabs'

function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(fileURLToPath(new URL(`../assets/${file}`, import.meta.url)))
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG')
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

/** Confirms a committed file is a real Ogg container: the four-byte "OggS" capture pattern. */
function assertRealOgg(file: string): void {
  const bytes = readFileSync(fileURLToPath(new URL(`../assets/${file}`, import.meta.url)))
  expect(bytes.subarray(0, 4).toString('ascii'), file).toBe('OggS')
}

/**
 * The exact one-line mapping create-project.ts:47 and template.ts:29 both
 * use to emit project art: `archetype.art.map((art) => [art.uri, ...])`.
 * Reproduced here (rather than imported, since those packages are out of
 * this change's scope) to prove it needs no kind-specific branch — a sound
 * entry flows through identically to an image one (CA-11).
 */
function projectUriMap(art: ArchetypeArt[]): Record<string, string> {
  return Object.fromEntries(art.map((entry) => [entry.uri, `src/art/${entry.file}`]))
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
  cellSize?: number
  cells?: number[]
  solidTiles?: number[]
  width?: number
  height?: number
  clips?: Record<string, { frames: number[] }>
}

describe('isometric stock art', () => {
  it('ships a real PNG for every image art row', () => {
    for (const art of ISOMETRIC_ART.filter((entry) => entry.kind === 'image')) {
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
      expect(cols, ref).toBe(11)
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

  it('lowers every character quad so the boots stand on the footprint', () => {
    // The Puny bodies leave nine transparent texels under the boots; drawn
    // at 16 texels per unit that is 9/16 of a unit the sprite would otherwise
    // float above the position the motor collides from.
    for (const ref of ['characters/player', 'characters/villager', 'characters/orc']) {
      const sprite = ISOMETRIC_PREFABS[ref]!.components.find(
        (candidate) => candidate.type === 'AnimatedSprite',
      )!.props as AppearanceProps & { offsetY?: number; anchorY?: number }
      expect(sprite.anchorY, ref).toBe(0)
      expect(sprite.offsetY, ref).toBe(-9 / 16)
    }
  })

  it('declares one column per pose: idle, three walk, three attack, two hurt, two death', () => {
    const hero = ISOMETRIC_PREFABS['characters/player']!.components.find(
      (candidate) => candidate.type === 'AnimatedSprite',
    )!.props as AppearanceProps
    const row = (direction: string) => ['n', 'ne', 'e', 'se', 's'].indexOf(direction) * 11
    for (const direction of ['n', 'ne', 'e', 'se', 's']) {
      const first = row(direction)
      expect(hero.clips![`idle-${direction}`]!.frames).toEqual([first])
      expect(hero.clips![`walk-${direction}`]!.frames).toEqual([first + 1, first + 2, first + 3, first + 2])
      expect(hero.clips![`attack-${direction}`]!.frames).toEqual([first + 4, first + 5, first + 6])
      expect(hero.clips![`hurt-${direction}`]!.frames).toEqual([first + 7, first + 8])
      expect(hero.clips![`death-${direction}`]!.frames).toEqual([first + 9, first + 10])
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

  it('keeps every texture in one power-of-two texel-density family', () => {
    const densities: Record<string, [number, number]> = {}
    for (const ref of ['characters/player', 'characters/villager', 'characters/orc']) {
      const sprite = ISOMETRIC_PREFABS[ref]!.components.find(
        (candidate) => candidate.type === 'AnimatedSprite',
      )!.props as AppearanceProps
      densities[ref] = [32 / sprite.width!, 32 / sprite.height!]
    }

    const tilemap = ISOMETRIC_PREFABS['tiles/ground']!.components[0]!
      .props as AppearanceProps
    densities['tiles/ground'] = [
      tilemap.cellWidth! / (2 * tilemap.cellSize!),
      tilemap.cellHeight! / tilemap.cellSize!,
    ]

    for (const ref of ['objects/tree', 'objects/rock', 'objects/crate']) {
      const sprite = ISOMETRIC_PREFABS[ref]!.components.find(
        (candidate) => candidate.type === 'Sprite',
      )!.props as AppearanceProps
      const size = pngSize(artFileFor(sprite.texture!))
      densities[ref] = [size.width / sprite.width!, size.height / sprite.height!]
    }

    expect(densities).toEqual({
      'characters/player': [16, 16],
      'characters/villager': [16, 16],
      'characters/orc': [16, 16],
      'tiles/ground': [32, 32],
      'objects/tree': [32, 32],
      'objects/rock': [32, 32],
      'objects/crate': [32, 32],
    })
  })
})

describe('CA-11 — sounds are art with a declared kind', () => {
  it('tags every image row image and every sound row sound', () => {
    const imageFiles = [
      'waica-iso-hero.png',
      'waica-iso-villager.png',
      'waica-iso-orc.png',
      'waica-iso-ground.png',
      'waica-iso-tree.png',
      'waica-iso-rock.png',
      'waica-iso-crate.png',
      'waica-iso-click-marker.png',
    ]
    const soundFiles = [
      'waica-iso-sword-swing.ogg',
      'waica-iso-hit.ogg',
      'waica-iso-hurt.ogg',
      'waica-iso-town-theme.ogg',
    ]
    expect(ISOMETRIC_ART.map((art) => art.file).sort()).toEqual(
      [...imageFiles, ...soundFiles].sort(),
    )
    for (const file of imageFiles) {
      expect(ISOMETRIC_ART.find((art) => art.file === file), file).toMatchObject({ kind: 'image' })
    }
    for (const file of soundFiles) {
      expect(ISOMETRIC_ART.find((art) => art.file === file), file).toMatchObject({ kind: 'sound' })
    }
  })

  it('declares the four sound files with waica:iso-<name> uris, following the image convention', () => {
    const expected: Record<string, string> = {
      'waica-iso-sword-swing.ogg': 'waica:iso-sword-swing',
      'waica-iso-hit.ogg': 'waica:iso-hit',
      'waica-iso-hurt.ogg': 'waica:iso-hurt',
      'waica-iso-town-theme.ogg': 'waica:iso-town-theme',
    }
    for (const [file, uri] of Object.entries(expected)) {
      expect(ISOMETRIC_ART.find((art) => art.file === file), file).toEqual({
        file,
        uri,
        kind: 'sound',
      })
    }
  })

  it('ships a real Ogg container for every sound row, already committed', () => {
    for (const art of ISOMETRIC_ART.filter((entry) => entry.kind === 'sound')) {
      assertRealOgg(art.file)
    }
  })

  it('emits sounds into a demo project exactly like images: the generic uri-to-project-path mapping needs no kind branch', () => {
    const projected = projectUriMap(ISOMETRIC_ART)
    expect(projected['waica:iso-sword-swing']).toBe('src/art/waica-iso-sword-swing.ogg')
    expect(projected['waica:iso-hit']).toBe('src/art/waica-iso-hit.ogg')
    expect(projected['waica:iso-hurt']).toBe('src/art/waica-iso-hurt.ogg')
    expect(projected['waica:iso-town-theme']).toBe('src/art/waica-iso-town-theme.ogg')
    // Every art row round-trips through the mapping, sound and image alike.
    expect(Object.keys(projected)).toHaveLength(ISOMETRIC_ART.length)
  })
})
