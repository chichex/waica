import { describe, expect, it } from 'vitest'
import {
  isAnimationFacingProvider,
  isCameraVelocityProvider,
  Solid,
  THREE,
  type Entity,
  type Game,
} from '@waica/engine'
import { IsoMotor, type IsoFacing } from './iso-motor'

interface MotorHarness {
  motor: IsoMotor
  addSolid(x: number, y: number, width: number, height: number): void
}

function makeMotor(x = 0, y = 0): MotorHarness {
  const entities: Entity[] = []
  const game = { entities } as unknown as Game
  const motor = new IsoMotor()
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

function drive(motor: IsoMotor, x: number, y: number, frames = 120): void {
  for (let frame = 0; frame < frames; frame += 1) motor.run(x, y, 1 / 60)
}

describe('IsoMotor screen-relative movement', () => {
  const cases: Array<[number, number, IsoFacing]> = [
    [1, 0, 'e'],
    [1, 1, 'ne'],
    [0, 1, 'n'],
    [-1, 1, 'nw'],
    [-1, 0, 'w'],
    [-1, -1, 'sw'],
    [0, -1, 's'],
    [1, -1, 'se'],
  ]

  it.each(cases)('moves input (%s, %s) at one logical speed while facing %s', (x, y, facing) => {
    const { motor } = makeMotor()

    drive(motor, x, y)

    expect(motor.speed()).toBeCloseTo(motor.moveSpeed, 3)
    expect(motor.facing).toBe(facing)
  })

  it('maps screen-right onto equal and opposite logical axes', () => {
    const { motor } = makeMotor()

    drive(motor, 1, 0)

    expect(motor.vx).toBeCloseTo(motor.moveSpeed * Math.SQRT1_2, 3)
    expect(motor.vy).toBeCloseTo(-motor.moveSpeed * Math.SQRT1_2, 3)
  })

  it('decelerates to a stop when input goes slack', () => {
    const { motor } = makeMotor()
    drive(motor, 1, 0)

    drive(motor, 0, 0)

    expect(motor.speed()).toBeCloseTo(0, 3)
  })

  it('starts south and keeps the last facing on zero input', () => {
    const { motor } = makeMotor()
    expect(motor.facing).toBe('s')

    motor.run(-1, 1, 1 / 60)
    motor.run(0, 0, 1 / 60)

    expect(motor.facing).toBe('nw')
  })
})

describe('IsoMotor logical-axis collision', () => {
  it('stops flush against a Solid on the logical x axis', () => {
    const { motor, addSolid } = makeMotor()
    addSolid(1, 0, 0.5, 4)
    motor.vx = 10

    motor.step(0.1)

    expect(motor.entity.position.x).toBeCloseTo(0.3, 3)
    expect(motor.vx).toBe(0)
  })

  it('does not tunnel through a thin Solid at the clamped frame time', () => {
    const { motor, addSolid } = makeMotor()
    addSolid(1, 0, 0.1, 4)
    motor.vx = 22

    motor.step(0.1)

    expect(motor.entity.position.x).toBeCloseTo(0.5, 3)
    expect(motor.vx).toBe(0)
  })

  it('resolves logical y independently and preserves free-axis sliding', () => {
    const { motor, addSolid } = makeMotor()
    addSolid(0, 1, 4, 0.5)
    motor.vx = -3
    motor.vy = 10

    motor.step(0.1)

    // The solid's bottom face sits at 0.75; the square isometric footprint
    // (0.9 deep, unlike the short top-down body) stops half its height short.
    expect(motor.hitboxHeight).toBe(0.9)
    expect(motor.entity.position.x).toBeCloseTo(-0.3, 3)
    expect(motor.entity.position.y).toBeCloseTo(0.3, 3)
    expect(motor.vx).toBe(-3)
    expect(motor.vy).toBe(0)
  })

  it('carries no gravity when undriven', () => {
    const { motor } = makeMotor(2, -3)

    motor.run(0, 0, 0.1)
    motor.step(0.1)

    expect(motor.entity.position.toArray()).toEqual([2, -3, 0])
    expect(motor.vy).toBe(0)
  })
})

describe('IsoMotor provider seams', () => {
  it('advertises logical velocity to the camera and facing to animation', () => {
    const { motor } = makeMotor()
    motor.vx = 3
    motor.vy = -7
    motor.run(1, 1, 1 / 60)

    expect(isCameraVelocityProvider(motor)).toBe(true)
    expect(motor.getCameraVelocity()).toEqual({ vx: motor.vx, vy: motor.vy })
    expect(isAnimationFacingProvider(motor)).toBe(true)
    expect(motor.getAnimationFacing()).toBe('ne')
  })
})
