import { describe, expect, it } from 'vitest'
import { COLLISION_SHAPES, DynamicBody } from '@waica/engine'
import { PLATFORMER_REGISTRY } from './registry'

describe('platformer DynamicBody registration', () => {
  it('exposes the engine component to prefab and editor infrastructure (CA-8)', () => {
    expect(PLATFORMER_REGISTRY.components.DynamicBody).toBe(DynamicBody)
    expect(DynamicBody.params).toEqual({
      vx: { label: 'x velocity', step: 0.1 },
      vy: { label: 'y velocity', step: 0.1 },
      shape: { label: 'shape', options: [...COLLISION_SHAPES] },
      width: { label: 'width', min: 0, step: 0.1 },
      height: { label: 'height', min: 0, step: 0.1 },
      offsetX: { label: 'x offset', step: 0.1 },
      offsetY: { label: 'y offset', step: 0.1 },
      points: { label: 'polygon points' },
    })
    expect(new DynamicBody()).toMatchObject({
      vx: 0,
      vy: 0,
      shape: 'rectangle',
      width: 1,
      height: 1,
      offsetX: 0,
      offsetY: 0,
    })
  })
})
