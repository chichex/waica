import { describe, expect, it } from 'vitest'
import type { Entity } from '@waica/engine'
import { Patrol, type PatrolAxis } from './patrol'

function makePatrol(axis: PatrolAxis, x = 0, y = 0): Patrol {
  const patrol = new Patrol()
  patrol.entity = {
    position: { x, y },
    scale: { x: 1, y: 1 },
  } as unknown as Entity
  patrol.axis = axis
  patrol.distance = 2
  patrol.speed = 2
  patrol.onReady()
  return patrol
}

describe('Patrol', () => {
  it('walks sideways and turns around at the rail ends', () => {
    const patrol = makePatrol('horizontal', 5)
    patrol.step(0.5) // +1
    expect(patrol.entity.position.x).toBeCloseTo(6)
    expect(patrol.entity.scale.x).toBe(1)
    patrol.step(1) // clamps at origin + distance, turns
    expect(patrol.entity.position.x).toBeCloseTo(7)
    patrol.step(0.5) // now walking back
    expect(patrol.entity.position.x).toBeCloseTo(6)
    expect(patrol.entity.scale.x).toBe(-1)
    expect(patrol.entity.position.y).toBe(0)
  })

  it('floats up and down on the vertical axis, without flipping the sprite', () => {
    const patrol = makePatrol('vertical', 0, 3)
    patrol.step(0.5) // +1
    expect(patrol.entity.position.y).toBeCloseTo(4)
    patrol.step(1) // clamps at origin + distance, turns
    expect(patrol.entity.position.y).toBeCloseTo(5)
    patrol.step(0.5) // now moving down
    expect(patrol.entity.position.y).toBeCloseTo(4)
    expect(patrol.entity.position.x).toBe(0)
    expect(patrol.entity.scale.x).toBe(1)
  })

  it('turns back at the bottom end of a vertical rail', () => {
    const patrol = makePatrol('vertical', 0, 0)
    patrol.step(1.5) // past the top: clamp at +2, turn
    patrol.step(2.5) // past the bottom: clamp at -2, turn
    expect(patrol.entity.position.y).toBeCloseTo(-2)
    patrol.step(0.5)
    expect(patrol.entity.position.y).toBeCloseTo(-1)
  })
})
