// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'

// The engine's own copy of three, by path: this package does not depend on three.
vi.mock(
  new URL('../../engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../engine/src/test-renderer.js')).withFakeRenderer(await importOriginal<Record<string, unknown>>()),
)

import { authoringDefaults, RigidBody, type SceneEntityJson } from '@waica/engine'
import { use3dTestEnvironment } from '../../engine/src/test-game-3d.js'
import { FLOOR, physicsFixture, type PhysicsFixture } from '../../engine/src/test-physics-3d.js'
import { defined } from '../../engine/src/test-support.js'
import { CharacterMotor } from './character-motor.js'

use3dTestEnvironment()

const BINDINGS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  jump: ['Space'],
}

function player(props: Record<string, unknown> = {}, rigid: Record<string, unknown> = { type: 'kinematic' }): SceneEntityJson {
  return {
    name: 'Player',
    position: [0, 0.9, 0],
    components: [
      { type: 'Collider', props: { shape: 'capsule', radius: 0.4, height: 1.8 } },
      { type: 'RigidBody', props: rigid },
      { type: 'CharacterMotor', props },
    ],
  }
}

async function playground(entity = player(), bindings: Record<string, string[]> = BINDINGS): Promise<PhysicsFixture> {
  const fixture = await physicsFixture([FLOOR, entity], { components: { CharacterMotor }, game: { bindings } })
  fixture.step(20)
  return fixture
}

const where = (fixture: PhysicsFixture): { x: number; y: number; z: number } => {
  const { x, y, z } = defined(fixture.game.find('Player')).position
  return { x, y, z }
}

const hold = (fixture: PhysicsFixture, action: string): void => {
  fixture.bridge.control({ operation: 'hold', action })
}

describe('CharacterMotor (CA-20)', () => {
  it('declares the 3D space and the documented defaults', () => {
    expect(CharacterMotor.space).toBe('3d')
    expect(authoringDefaults(CharacterMotor)).toEqual({
      speed: 6,
      jumpSpeed: 6,
      leftAction: 'left',
      rightAction: 'right',
      forwardAction: 'up',
      backAction: 'down',
      jumpAction: 'jump',
    })
  })

  it('walks right at its speed: one second of a held action moves it speed units, within 5 percent', async () => {
    const fixture = await playground()
    const start = where(fixture)

    hold(fixture, 'right')
    fixture.step(60)

    expect(where(fixture).x - start.x).toBeGreaterThan(6 * 0.95)
    expect(where(fixture).x - start.x).toBeLessThan(6 * 1.05)
    expect(where(fixture).z).toBeCloseTo(start.z, 3)
  })

  it('maps left, forward (up, toward -z) and back (down, toward +z) on the world axes, diagonals at the cardinal speed', async () => {
    const fixture = await playground(player({ speed: 3 }))
    const start = where(fixture)

    hold(fixture, 'left')
    hold(fixture, 'up')
    fixture.step(60)

    // Normalized like TopDownMotor: one second on a diagonal covers 3 units, not 3 * sqrt(2).
    expect(where(fixture).x - start.x).toBeCloseTo(-3 / Math.SQRT2, 1)
    expect(where(fixture).z - start.z).toBeCloseTo(-3 / Math.SQRT2, 1)
    expect(Math.hypot(where(fixture).x - start.x, where(fixture).z - start.z)).toBeCloseTo(3, 1)

    const midway = where(fixture).z
    fixture.bridge.control({ operation: 'release', action: 'up' })
    hold(fixture, 'down')
    fixture.step(60)
    expect(where(fixture).z - midway).toBeCloseTo(3 / Math.SQRT2, 1)
  })
})

describe('CharacterMotor input (CA-20)', () => {
  it('stands still when no action is held, or when the Game binds none', async () => {
    const idle = await playground()
    const before = where(idle)
    idle.step(60)
    expect(where(idle)).toEqual(before)

    const unbound = await playground(player(), {})
    const start = where(unbound)
    unbound.step(60)
    expect(where(unbound).x).toBeCloseTo(start.x, 3)
  })

  it('reads the action names its params give it', async () => {
    const fixture = await playground(player({ rightAction: 'dash' }), { ...BINDINGS, dash: ['KeyE'] })
    const start = where(fixture)

    hold(fixture, 'right')
    fixture.step(30)
    expect(where(fixture).x).toBeCloseTo(start.x, 3)

    hold(fixture, 'dash')
    fixture.step(30)
    expect(where(fixture).x - start.x).toBeGreaterThan(2)
  })
})

describe('CharacterMotor jumping (CA-20)', () => {
  it('jumps on a press of the jump action and lands again', async () => {
    const fixture = await playground()
    const start = where(fixture).y

    fixture.bridge.control({ operation: 'press', action: 'jump' })
    fixture.step(20)
    expect(where(fixture).y).toBeGreaterThan(start + 1)

    fixture.step(70)
    expect(where(fixture).y).toBeCloseTo(start, 1)
    expect(defined(fixture.game.find('Player')?.get(RigidBody)).grounded).toBe(true)
  })

  it('uses the jump speed it is given', async () => {
    const low = await playground(player({ jumpSpeed: 3 }))
    const high = await playground(player({ jumpSpeed: 9 }))
    const top = (fixture: PhysicsFixture): number => {
      let highest = 0
      fixture.bridge.control({ operation: 'press', action: 'jump' })
      for (let frame = 0; frame < 60; frame += 1) {
        fixture.step(1)
        highest = Math.max(highest, where(fixture).y)
      }
      return highest
    }

    expect(top(high)).toBeGreaterThan(top(low) + 2)
  })

  it('spends the press when it jumps: nothing else reads the same jump', async () => {
    const fixture = await playground()
    const consumed = vi.spyOn(fixture.game.input, 'consume')

    fixture.bridge.control({ operation: 'press', action: 'jump' })
    fixture.step(1)

    expect(consumed).toHaveBeenCalledWith('jump')
  })

})

describe('CharacterMotor and a jump press it cannot use (PR #163 finding 6)', () => {
  it('leaves the press alone when it cannot jump (in the air), for a double jump or a glide to read', async () => {
    const fixture = await playground(player({}, { type: 'kinematic' }))
    fixture.bridge.control({ operation: 'press', action: 'jump' })
    fixture.step(10)
    expect(defined(fixture.game.find('Player')?.get(RigidBody)).grounded).toBe(false)
    const consumed = vi.spyOn(fixture.game.input, 'consume')

    fixture.bridge.control({ operation: 'press', action: 'jump' })
    fixture.step(1)

    expect(consumed).not.toHaveBeenCalledWith('jump')
  })
})

describe('CharacterMotor without a body (CA-20)', () => {
  it('does nothing beside a dynamic RigidBody, or with no RigidBody at all', async () => {
    const dynamic = await playground(player({}, { type: 'dynamic' }))
    hold(dynamic, 'right')
    expect(() => dynamic.step(30)).not.toThrow()
    expect(Math.abs(where(dynamic).x)).toBeLessThan(0.1)
    expect(defined(dynamic.game.find('Player')?.get(RigidBody)).desiredVelocity).toEqual({ x: 0, z: 0 })

    const bare: SceneEntityJson = { name: 'Player', components: [{ type: 'Collider' }, { type: 'CharacterMotor' }] }
    const none = await playground(bare)
    hold(none, 'right')
    expect(() => none.step(30)).not.toThrow()
    expect(defined(none.game.find('Player')).position.x).toBe(0)
  })
})
