import { describe, expect, it } from 'vitest'
import {
  collisionBounds,
  collisionOverlap,
  collisionVertices,
  resolveCollisionPoints,
  type CollisionBody,
} from './collision-shape'

const rectangle = (x: number, y: number, width = 2, height = 2): CollisionBody => ({
  x,
  y,
  width,
  height,
  shape: 'rectangle',
})

describe('collision shape geometry', () => {
  it('maps rectangle and polygon vertices into world space', () => {
    expect(collisionVertices(rectangle(3, -2, 4, 2))).toEqual([
      [1, -3],
      [5, -3],
      [5, -1],
      [1, -1],
    ])
    expect(
      collisionVertices({
        x: 2,
        y: 1,
        width: 4,
        height: 2,
        shape: 'polygon',
        points: [
          [-0.5, -0.5],
          [0.5, -0.5],
          [0, 0.5],
        ],
      }),
    ).toEqual([
      [0, 0],
      [4, 0],
      [2, 2],
    ])
  })

  it('uses absolute dimensions when calculating bounds', () => {
    expect(collisionBounds(rectangle(0, 0, -4, -2))).toEqual({
      left: -2,
      right: 2,
      top: 1,
      bottom: -1,
    })
  })

  it('detects rectangle overlap and containment, but not edge contact', () => {
    expect(collisionOverlap(rectangle(0, 0), rectangle(1, 0))).toBe(true)
    expect(collisionOverlap(rectangle(0, 0, 8, 8), rectangle(0, 0, 1, 1))).toBe(true)
    expect(collisionOverlap(rectangle(0, 0), rectangle(2, 0))).toBe(false)
  })

  it('handles circle and polygon shape combinations', () => {
    const circle: CollisionBody = { x: 0, y: 0, width: 2, height: 2, shape: 'circle' }
    const triangle: CollisionBody = {
      x: 0.7,
      y: 0,
      width: 2,
      height: 2,
      shape: 'polygon',
      points: [
        [-0.5, -0.5],
        [0.5, 0],
        [-0.5, 0.5],
      ],
    }
    expect(collisionOverlap(circle, triangle)).toBe(true)
    expect(collisionOverlap(circle, { ...triangle, x: 4 })).toBe(false)
    expect(
      collisionOverlap(circle, { x: 1.5, y: 0, width: 2, height: 1, shape: 'circle' }),
    ).toBe(true)
  })

  it('falls back to a fresh default polygon for malformed serialized points', () => {
    const first = resolveCollisionPoints([[0, 0], ['bad', 1], [1, 0]])
    const second = resolveCollisionPoints(null)
    expect(first).toEqual([
      [-0.5, -0.5],
      [0.5, -0.5],
      [0, 0.5],
    ])
    expect(second).toEqual(first)
    expect(second).not.toBe(first)
  })
})
