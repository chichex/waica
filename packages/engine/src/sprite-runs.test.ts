import { describe, expect, it } from 'vitest'
import { buildSpriteRuns, type Drawable } from './sprite-runs'
import { ySortZ } from './render-sort'

/** A drawable named for the assertions: a sprite of `key`, or a non-sprite renderable when key is null. */
interface Named extends Drawable<string> {
  name: string
}

let nextId = 1
function sprite(name: string, key: string, z = 0): Named {
  return { name, key, z, id: nextId++, groupOrder: 0, renderOrder: 0 }
}
function other(name: string, z = 0): Named {
  return { name, key: null, z, id: nextId++, groupOrder: 0, renderOrder: 0 }
}

/** The runs as compact strings: `A[a1,a2]` for a Sprite Batch, `(p)` for anything else. */
function shape(drawables: readonly Named[]): string[] {
  return buildSpriteRuns(drawables).map((step) =>
    step.kind === 'run'
      ? `${step.key}[${step.items.map((item) => item.name).join(',')}]`
      : `(${step.item.name})`,
  )
}

describe('buildSpriteRuns (CA-2)', () => {
  it('groups consecutive same-key sprites into one run', () => {
    expect(shape([sprite('a1', 'A'), sprite('a2', 'A'), sprite('a3', 'A')])).toEqual(['A[a1,a2,a3]'])
  })

  it('ends a run at a sprite of another key', () => {
    expect(shape([sprite('a1', 'A'), sprite('b1', 'B'), sprite('a2', 'A')])).toEqual([
      'A[a1]',
      'B[b1]',
      'A[a2]',
    ])
  })

  it('ends a run at a non-sprite renderable in between', () => {
    expect(shape([sprite('a1', 'A'), other('particles'), sprite('a2', 'A')])).toEqual([
      'A[a1]',
      '(particles)',
      'A[a2]',
    ])
  })

  it("orders by three's transparent sort: farther (higher clip z) first", () => {
    // Clip-space z grows away from the camera, so z 0.5 draws before z 0.1.
    expect(shape([sprite('near', 'A', 0.1), other('tiles', 0.3), sprite('far', 'A', 0.5)])).toEqual([
      'A[far]',
      '(tiles)',
      'A[near]',
    ])
  })

  it('keeps spawn (id) order on equal z, including against other renderables', () => {
    const first = sprite('first', 'A')
    const between = other('between')
    const last = sprite('last', 'A')
    expect(shape([last, between, first])).toEqual(['A[first]', '(between)', 'A[last]'])
  })

  it('lets renderOrder and groupOrder win over z, as three does', () => {
    const lifted = { ...sprite('lifted', 'A', 0.9), renderOrder: 1 }
    const grouped = { ...sprite('grouped', 'B', 0.9), groupOrder: 1 }
    const plain = sprite('plain', 'A', 0.1)
    expect(shape([grouped, lifted, plain])).toEqual(['A[plain,lifted]', 'B[grouped]'])
  })

  it('respects layer bands and the y-sort order inside a band', () => {
    // Entities: a (y 2, layer 0), b (y -2, layer 0), c (y 0, layer 1). Higher
    // scene z is nearer the camera, i.e. lower clip z: clip z = -sceneZ here.
    const entries = [
      { layer: 0, y: 2 },
      { layer: 0, y: -2 },
      { layer: 1, y: 0 },
    ]
    const [za, zb, zc] = ySortZ(entries).map((z) => -z)
    const a = sprite('a', 'A', za)
    const b = sprite('b', 'B', zb)
    const c = sprite('c', 'A', zc)
    // Back to front: a (higher y), then b (lower y, same band), then c (layer 1).
    expect(shape([c, b, a])).toEqual(['A[a]', 'B[b]', 'A[c]'])
  })

  it('returns no steps for an empty frame', () => {
    expect(buildSpriteRuns([])).toEqual([])
  })
})
