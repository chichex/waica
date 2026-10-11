// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { RigidBody } from './components/rigid-body.js'
import { loadScene } from './scene.js'
import { ready3dGame, registryOf, runtimeBridgeOf, use3dTestEnvironment } from './test-game-3d.js'
import { crate, FLOOR, physicsFixture } from './test-physics-3d.js'
import { loadRapier } from './physics-3d/rapier-module.js'
import { defined } from './test-support.js'

use3dTestEnvironment()

describe('Runtime Snapshot physics section (CA-17)', () => {
  it('reports the state, the scene gravity and every body in spawn order', async () => {
    const { snapshot, step } = await physicsFixture([FLOOR, crate('Crate', 5)], { simulation: { gravity: [0, -3, 0] } })

    const before = snapshot()
    expect(before.physics?.state).toBe('ready')
    expect(before.physics?.gravity).toEqual([0, -3, 0])
    expect(before.physics?.bodies).toEqual([
      { entity: 'Floor', id: 'entity-1', type: 'fixed', velocity: [0, 0, 0], grounded: false },
      { entity: 'Crate', id: 'entity-2', type: 'dynamic', velocity: [0, 0, 0], grounded: false },
    ])

    step(10)

    const falling = defined(snapshot().physics?.bodies[1])
    expect(falling.velocity[1]).toBeCloseTo(-3 * (10 / 60), 3)
    expect(falling.velocity[0]).toBe(0)
    expect(snapshot().entities.map((entity) => entity.id)).toEqual(['entity-1', 'entity-2'])
  })

  it('rounds velocities to 1e-6', async () => {
    const { game, snapshot } = await physicsFixture([crate('Crate', 5)], { simulation: { gravity: [0, 0, 0] } })
    const body = defined(game.find('Crate')?.get(RigidBody))

    body.linearVelocity = { x: 0.123456789, y: -2.0000004, z: 1e-9 }

    expect(snapshot().physics?.bodies[0]?.velocity).toEqual([0.123457, -2, 0])
  })
})

describe('Runtime Snapshot physics section: other states (CA-17)', () => {
  it('reports a loading world with no bodies yet', async () => {
    const { snapshot } = await physicsFixture([FLOOR], { game: { physics: () => new Promise(() => {}) }, settle: false })

    expect(snapshot().physics).toEqual({ state: 'loading', gravity: [0, -9.81, 0], bodies: [] })
  })

  it('reports a failed world', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { game, snapshot } = await physicsFixture([FLOOR], { game: { physics: () => Promise.reject(new Error('no wasm')) } })
    await game.assets.ready()

    expect(snapshot().physics?.state).toBe('failed')
  })

  it('has no physics key in a 2D scene', async () => {
    const { game } = await ready3dGame(undefined, undefined, { physics: loadRapier })
    loadScene(game, { waicaScene: 3, entities: [{ name: 'Lone' }] }, registryOf({}))

    const snapshot = runtimeBridgeOf(game).inspect({})

    expect(Object.keys(snapshot)).not.toContain('physics')
  })

  it('is never filtered by entity or component filters', async () => {
    const { bridge } = await physicsFixture([FLOOR, crate('Crate', 5)])

    const filtered = bridge.inspect({ entity_names: ['Crate'], component_types: ['Collider'] })

    expect(filtered.entities.map((entity) => entity.name)).toEqual(['Crate'])
    expect(filtered.physics?.bodies.map((body) => body.entity)).toEqual(['Floor', 'Crate'])
  })

  it('truncates bodies from the end, with a marker, when the snapshot outgrows 1 MiB', async () => {
    // Long names: the entities go first, and what is left of the bodies still outgrows the cap.
    const longName = (index: number): string => `${'x'.repeat(20_000)}${index}`
    const boxes = Array.from({ length: 60 }, (_, index) => crate(longName(index), 1 + index * 2))
    const { snapshot } = await physicsFixture(boxes, { simulation: { gravity: [0, 0, 0] } })

    const capped = snapshot()

    const kept = defined(capped.physics).bodies.length
    expect(kept).toBeGreaterThan(0)
    expect(kept).toBeLessThan(60)
    expect(capped.projectionIssues).toContainEqual({ path: `physics.bodies[${kept}]`, marker: 'truncated', omitted: 60 - kept })
    expect(JSON.stringify(capped).length).toBeLessThanOrEqual(1024 * 1024)
  }, 20_000)
})
