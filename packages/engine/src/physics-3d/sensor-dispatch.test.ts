// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('../test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { Component } from '../component.js'
import type { Entity } from '../entity.js'
import type { SceneComponentJson, SceneEntityJson } from '../scene.js'
import { use3dTestEnvironment } from '../test-game-3d.js'
import { FLOOR, physicsFixture, worldOf } from '../test-physics-3d.js'
import { defined } from '../test-support.js'

use3dTestEnvironment()

/** Records who it was told about, by owner name. */
class Hears extends Component {
  static override componentName = 'Hears'
  static log: string[] = []
  override onCollide(other: Entity): void {
    Hears.log.push(`${this.entity.name}<-${other.name}`)
  }
}

const HEARS: SceneComponentJson = { type: 'Hears' }

interface Placement {
  at?: [number, number, number]
  props?: Record<string, unknown>
  rigid?: Record<string, unknown>
  hears?: boolean
}

/** A 4 x 2 x 4 sensor zone (listening unless told otherwise). */
function zone(name: string, { at = [0, 1, 0], props = {}, hears = true }: Placement = {}): SceneEntityJson {
  return {
    name,
    position: at,
    components: [{ type: 'Collider', props: { sensor: true, size: [4, 2, 4], ...props } }, ...(hears ? [HEARS] : [])],
  }
}

/** A unit body, dynamic unless `rigid` says otherwise (not listening unless told so). */
function body(name: string, { at = [0, 1, 0], props = {}, rigid = {}, hears = false }: Placement = {}): SceneEntityJson {
  return {
    name,
    position: at,
    components: [{ type: 'Collider', props }, { type: 'RigidBody', props: rigid }, ...(hears ? [HEARS] : [])],
  }
}

const FLOATING = { gravity: [0, 0, 0] as [number, number, number] }

describe('sensors are the 3D Hitbox (CA-16)', () => {
  it('fires onCollide on the sensor every step while a body overlaps it, and stops when it leaves', async () => {
    Hears.log = []
    const { game, step } = await physicsFixture(
      [zone('Zone', { props: { collidesWith: ['crate'] } }), body('Crate', { props: { layer: 'crate' } })],
      { components: { Hears }, simulation: FLOATING },
    )

    step(3)
    expect(Hears.log).toEqual(['Zone<-Crate', 'Zone<-Crate', 'Zone<-Crate'])

    Hears.log = []
    worldOf(game).recordOf(defined(game.find('Crate')))?.body.setTranslation({ x: 20, y: 1, z: 0 }, true)
    step(2)
    expect(Hears.log).toEqual([])
  })

  it('honors directional interest: only a side whose mask names the other layer is told', async () => {
    Hears.log = []
    const { step } = await physicsFixture(
      [
        zone('Pickup', { props: { layer: 'pickup', collidesWith: [] } }),
        zone('Radar', { at: [0, 1, 0.5], props: { layer: 'radar', collidesWith: ['crate'] } }),
        body('Crate', { props: { layer: 'crate' } }),
      ],
      { components: { Hears }, simulation: FLOATING },
    )

    step(1)

    expect(Hears.log).toEqual(['Radar<-Crate'])
  })

  it('tells both sides of a sensor pair when each names the other', async () => {
    Hears.log = []
    const { step } = await physicsFixture(
      [
        zone('A', { props: { layer: 'team-a', collidesWith: ['team-b'] } }),
        zone('B', { props: { layer: 'team-b', collidesWith: ['team-a'] } }),
      ],
      { components: { Hears }, simulation: FLOATING },
    )

    step(1)

    expect(Hears.log).toEqual(['A<-B', 'B<-A'])
  })
})

describe('sensors and solid colliders (CA-16)', () => {
  it('does not tell a solid collider about a sensor it touches unless it declares a mask itself', async () => {
    Hears.log = []
    const { step } = await physicsFixture(
      [
        zone('Zone', { props: { layer: 'zone' } }),
        body('Plain', { hears: true }),
        body('Declared', { at: [1, 1, 0], props: { collidesWith: ['zone'] }, hears: true }),
      ],
      { components: { Hears }, simulation: FLOATING },
    )

    step(1)

    expect(Hears.log).toContain('Zone<-Plain')
    expect(Hears.log).toContain('Zone<-Declared')
    expect(Hears.log).toContain('Declared<-Zone')
    expect(Hears.log).not.toContain('Plain<-Zone')
  })

  it('never fires onCollide for two solid colliders in contact', async () => {
    Hears.log = []
    const crate = body('Crate', { at: [0, 0.6, 0], props: { collidesWith: ['default'] }, hears: true })
    const { step } = await physicsFixture([FLOOR, crate], { components: { Hears } })

    step(60)

    expect(Hears.log).toEqual([])
  })

  it('detects a fixed collider and a kinematic body inside a sensor on a fixed body', async () => {
    Hears.log = []
    const wall: SceneEntityJson = { name: 'Wall', position: [0, 1, 0], components: [{ type: 'Collider', props: { size: [1, 1, 1] } }] }
    const { step } = await physicsFixture([zone('Zone'), wall, body('Walker', { at: [1, 1, 0], rigid: { type: 'kinematic' } })], {
      components: { Hears },
      simulation: FLOATING,
    })

    step(2)

    expect(Hears.log.filter((line) => line === 'Zone<-Wall')).toHaveLength(2)
    expect(Hears.log.filter((line) => line === 'Zone<-Walker')).toHaveLength(2)
  })
})

describe('sensor timing (CA-16)', () => {
  it('sees what happens this step: a falling body is reported on the step it first overlaps', async () => {
    Hears.log = []
    const { game, step } = await physicsFixture([zone('Zone', { at: [0, 2, 0] }), body('Crate', { at: [0, 6, 0] })], {
      components: { Hears },
    })
    const crate = game.find('Crate')
    let firstHeard = -1
    let yWhenHeard = Number.NaN
    for (let frame = 1; frame <= 120 && firstHeard < 0; frame += 1) {
      step(1)
      if (Hears.log.length > 0) {
        firstHeard = frame
        yWhenHeard = crate?.position.y ?? Number.NaN
      }
    }

    expect(firstHeard).toBeGreaterThan(1)
    // The zone spans y in [1, 3]; the box (half height 0.5) first touches it when its centre drops below 3.5.
    expect(yWhenHeard).toBeLessThanOrEqual(3.5)
    expect(yWhenHeard).toBeGreaterThan(3.5 - 0.5)
  })
})
