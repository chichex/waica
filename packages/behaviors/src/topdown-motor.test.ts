import { describe, expect, it } from 'vitest'
import {
  isAnimationFacingProvider,
  isCameraVelocityProvider,
  Solid,
  THREE,
  type Entity,
  type Game,
} from '@waica/engine'
import { TopDownMotor } from './topdown-motor'

interface MotorHarness {
  motor: TopDownMotor
  addSolid(x: number, y: number, width: number, height: number): void
}

function makeMotor(x = 0, y = 0): MotorHarness {
  const entities: Entity[] = []
  const game = { entities } as unknown as Game
  const motor = new TopDownMotor()
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

/** Drives run() at 60 fps long enough for the damp to fully converge. */
function drive(motor: TopDownMotor, x: number, y: number, frames = 120): void {
  for (let i = 0; i < frames; i += 1) motor.run(x, y, 1 / 60)
}

describe('TopDownMotor axis collision characterization', () => {
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

  it('resolves vertical contact per axis and clears only vertical speed', () => {
    const { motor, addSolid } = makeMotor()
    addSolid(0, 1, 4, 0.5)
    motor.vx = 0
    motor.vy = 10

    motor.step(0.1)

    // Flush against the wall bottom: 0.75 minus half the 0.6 hitbox height.
    expect(motor.entity.position.y).toBeCloseTo(0.45, 3)
    expect(motor.vy).toBe(0)
  })

  it('slides along a wall: a blocked axis does not stop the free one', () => {
    const { motor, addSolid } = makeMotor()
    addSolid(1, 0, 0.5, 8)
    motor.vx = 10
    motor.vy = -3

    motor.step(0.1)

    expect(motor.entity.position.x).toBeCloseTo(0.3, 3)
    expect(motor.entity.position.y).toBeCloseTo(-0.3, 3)
    expect(motor.vx).toBe(0)
    expect(motor.vy).toBe(-3)
  })

  it('carries no gravity: an undriven body stays exactly where it is', () => {
    const { motor } = makeMotor(2, -3)

    motor.run(0, 0, 0.1)
    motor.step(0.1)

    expect(motor.entity.position.x).toBe(2)
    expect(motor.entity.position.y).toBe(-3)
    expect(motor.vy).toBe(0)
  })
})

describe('TopDownMotor eight-direction movement', () => {
  it('moves diagonals at cardinal speed: the input vector is normalized', () => {
    const { motor } = makeMotor()
    drive(motor, 1, 0)
    const cardinal = motor.speed()

    const diagonal = makeMotor().motor
    drive(diagonal, 1, 1)

    expect(cardinal).toBeCloseTo(motor.moveSpeed, 3)
    expect(diagonal.speed()).toBeCloseTo(cardinal, 3)
    expect(diagonal.vx).toBeCloseTo(motor.moveSpeed / Math.SQRT2, 3)
    expect(diagonal.vy).toBeCloseTo(motor.moveSpeed / Math.SQRT2, 3)
  })

  it('decelerates to a stop when the input goes slack', () => {
    const { motor } = makeMotor()
    drive(motor, 1, 0)

    drive(motor, 0, 0)

    expect(motor.speed()).toBeCloseTo(0, 3)
  })
})

describe('TopDownMotor four-direction facing', () => {
  it('starts facing south and follows cardinal input', () => {
    const { motor } = makeMotor()
    expect(motor.facing).toBe('s')

    motor.run(1, 0, 1 / 60)
    expect(motor.facing).toBe('e')
    motor.run(-1, 0, 1 / 60)
    expect(motor.facing).toBe('w')
    motor.run(0, 1, 1 / 60)
    expect(motor.facing).toBe('n')
    motor.run(0, -1, 1 / 60)
    expect(motor.facing).toBe('s')
  })

  it('lets the dominant axis win on uneven diagonals', () => {
    const { motor } = makeMotor()
    motor.run(0.5, -1, 1 / 60)
    expect(motor.facing).toBe('s')

    motor.run(-1, 0.5, 1 / 60)
    expect(motor.facing).toBe('w')
  })

  it('keeps the last facing on perfect diagonals and on no input', () => {
    const { motor } = makeMotor()
    motor.run(1, 0, 1 / 60)
    expect(motor.facing).toBe('e')

    motor.run(1, 1, 1 / 60)
    expect(motor.facing).toBe('e')

    motor.run(0, 0, 1 / 60)
    expect(motor.facing).toBe('e')
  })
})

describe('TopDownMotor provider seams', () => {
  it('advertises live two-axis velocity through the camera seam', () => {
    const { motor } = makeMotor()
    motor.vx = 3
    motor.vy = -7

    expect(isCameraVelocityProvider(motor)).toBe(true)
    expect(motor.getCameraVelocity()).toEqual({ vx: 3, vy: -7 })
  })

  it('reports its facing through the animation seam', () => {
    const { motor } = makeMotor()

    expect(isAnimationFacingProvider(motor)).toBe(true)
    expect(motor.getAnimationFacing()).toBe('s')

    motor.run(1, 0, 1 / 60)
    expect(motor.getAnimationFacing()).toBe('e')
  })
})
