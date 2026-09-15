import { describe, expect, it, vi } from 'vitest'
import {
  collisionMaskTargets,
  validCollisionLayer,
} from './collision-category.js'

describe('Collision Layer syntax', () => {
  it.each([
    ['default', true],
    ['enemy', true],
    ['scene-transition', true],
    ['unknown-9', true],
    ['', false],
    ['*', false],
    ['Enemy', false],
    ['enemy_one', false],
    ['9-enemy', false],
    ['enemy ', false],
    [null, false],
    [7, false],
  ])('classifies %j without normalization', (value, expected) => {
    expect(validCollisionLayer(value)).toBe(expected)
  })
})

describe('Collision Mask matching', () => {
  it('matches exact valid layers or the wildcard, case-sensitively', () => {
    expect(collisionMaskTargets(['enemy'], 'enemy')).toBe(true)
    expect(collisionMaskTargets(['Enemy', 'enemy'], 'enemy')).toBe(true)
    expect(collisionMaskTargets(['Enemy'], 'enemy')).toBe(false)
    expect(collisionMaskTargets(['*'], 'unknown-layer')).toBe(true)
    expect(collisionMaskTargets([], 'enemy')).toBe(false)
  })

  it('ignores duplicate, invalid, and non-string entries without logging', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(collisionMaskTargets(['enemy', 'enemy'], 'enemy')).toBe(true)
    expect(collisionMaskTargets([null, 1, {}, 'ENEMY'], 'enemy')).toBe(false)
    expect(collisionMaskTargets('enemy', 'enemy')).toBe(false)
    expect(collisionMaskTargets(null, 'enemy')).toBe(false)

    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    warn.mockRestore()
    error.mockRestore()
  })

  it('never targets an invalid layer, even with a wildcard', () => {
    for (const target of ['*', '', 'Enemy', 'enemy_one', null, 1]) {
      expect(collisionMaskTargets(['*', String(target)], target)).toBe(false)
    }
  })
})
