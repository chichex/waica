import { describe, expect, it } from 'vitest'
import { isCameraVelocityProvider, Solid, THREE, type Entity, type Game } from '@waica/engine'
import { PlatformerMotor } from './platformer-motor'

interface MotorHarness {
  motor: PlatformerMotor
  addSolid(x: number, y: number, width: number, height: number): void
}

function makeMotor(x = 0, y = 0): MotorHarness {
  const entities: Entity[] = []
  const input = {
    justPressed: () => false,
    held: () => false,
    consume: () => {},
  }
  const game = { entities, input } as unknown as Game
  const motor = new PlatformerMotor()
  const entity = {
    game,
    position: new THREE.Vector3(x, y, 0),
    scale: new THREE.Vector3(1, 1, 1),
  } as unknown as Entity
  motor.entity = entity
  motor.game = game

  return {
    motor,
    addSolid(sx, sy, width, height) {
      const solid = new Solid()
      const solidEntity = {
        game,
        position: new THREE.Vector3(sx, sy, 0),
        get(Class: unknown) {
          return Class === Solid ? solid : undefined
        },
      } as unknown as Entity
      solid.entity = solidEntity
      solid.game = game
      solid.width = width
      solid.height = height
      entities.push(solidEntity)
    },
  }
}

describe('PlatformerMotor axis collision characterization', () => {
  it('binary-searches horizontal contact until the character is flush', () => {
    const { motor, addSolid } = makeMotor()
    addSolid(1, 0, 0.5, 4)
    motor.vx = 10

    motor.step(0.1)

    expect(motor.entity.position.x).toBeCloseTo(0.3, 3)
    expect(motor.vx).toBe(0)
  })

  it('stops at a thin wall instead of tunneling at the 0.1 second frame clamp', () => {
    const { motor, addSolid } = makeMotor()
    addSolid(1, 0, 0.1, 4)
    motor.vx = 22

    motor.step(0.1)

    expect(motor.entity.position.x).toBeCloseTo(0.5, 3)
    expect(motor.vx).toBe(0)
  })

  it('documents the current spawn-inside-wall pass-through bail', () => {
    // Documented current behavior, not approved behavior: a body already
    // overlapping a Solid keeps its move instead of being teleported out.
    const { motor, addSolid } = makeMotor()
    addSolid(0, 0, 1, 2)
    motor.vx = 1

    motor.step(0.1)

    expect(motor.entity.position.x).toBeCloseTo(0.1)
    expect(motor.vx).toBe(1)
  })

  it('marks downward floor contact grounded and clears vertical speed', () => {
    const { motor, addSolid } = makeMotor(0, 0.5)
    addSolid(0, -1, 10, 1)
    motor.vy = -10

    motor.step(0.1)

    expect(motor.entity.position.y).toBeCloseTo(-0.025, 3)
    expect(motor.vy).toBe(0)
    expect(motor.grounded).toBe(true)
  })

  it('clears an upward ceiling hit without marking the character grounded', () => {
    const { motor, addSolid } = makeMotor(0, -0.5)
    addSolid(0, 1, 10, 1)
    motor.vy = 10

    motor.step(0.1)

    expect(motor.entity.position.y).toBeCloseTo(0.025, 3)
    expect(motor.vy).toBe(0)
    expect(motor.grounded).toBe(false)
  })

  it('documents jump buffering after the same press was consumed elsewhere', () => {
    // Documented current behavior, not approved behavior: tick only consults
    // justPressed, so another consumer spending the press does not suppress it.
    const { motor } = makeMotor()
    motor.grounded = true
    motor.game = {
      ...motor.game,
      input: {
        justPressed: (action: string) => action === 'jump',
        consumed: () => true,
        held: () => false,
      },
    } as unknown as Game

    motor.tick(0.016)

    expect(motor.wantsJump()).toBe(true)
  })
})

describe('PlatformerMotor camera velocity provider', () => {
  it('advertises live two-axis velocity through the provider seam', () => {
    const { motor } = makeMotor()
    motor.vx = 3
    motor.vy = -7

    expect(isCameraVelocityProvider(motor)).toBe(true)
    expect(motor.getCameraVelocity()).toEqual({ vx: 3, vy: -7 })
  })
})
