import { describe, expect, it } from 'vitest'
import { resetRegistries } from '../state/hooks'
import {
  installDirectionalAnimation,
  installedDirectionalAnimation,
  isAnimationFacingProvider,
  resolveDirectionalClip,
  type DirectionalAnimation,
} from './directional'

const ANIMATION: DirectionalAnimation = {
  directions: ['n', 's', 'e', 'w'],
  fallbacks: { w: { dir: 'e', flip: true } },
  contract: { required: ['idle', 'walk'], fallbacks: { walk: 'idle' } },
}

describe('resolveDirectionalClip', () => {
  it('returns the exact state-facing clip unflipped when it exists', () => {
    const resolved = resolveDirectionalClip(ANIMATION, ['walk-w', 'walk-e'], 'walk', 'w')
    expect(resolved).toEqual({ clip: 'walk-w', flip: false })
  })

  it('mirrors through a declared directional fallback', () => {
    const resolved = resolveDirectionalClip(ANIMATION, ['walk-e'], 'walk', 'w')
    expect(resolved).toEqual({ clip: 'walk-e', flip: true })
  })

  it('follows chained directional fallbacks accumulating the flip', () => {
    const chained: DirectionalAnimation = {
      directions: ['ne', 'nw', 'e', 'w'],
      fallbacks: { nw: { dir: 'w' }, w: { dir: 'e', flip: true } },
      contract: { required: [], fallbacks: {} },
    }
    const resolved = resolveDirectionalClip(chained, ['run-e'], 'run', 'nw')
    expect(resolved).toEqual({ clip: 'run-e', flip: true })
  })

  it('falls back to the base contract chain unflipped', () => {
    const resolved = resolveDirectionalClip(ANIMATION, ['idle'], 'walk', 'n')
    expect(resolved).toEqual({ clip: 'idle', flip: false })
  })

  it('survives a directional fallback cycle and lands on the base chain', () => {
    const cyclic: DirectionalAnimation = {
      directions: ['n', 's'],
      fallbacks: { n: { dir: 's' }, s: { dir: 'n' } },
      contract: { required: [], fallbacks: {} },
    }
    const resolved = resolveDirectionalClip(cyclic, ['idle'], 'walk', 'n')
    expect(resolved).toEqual({ clip: 'idle', flip: false })
  })
})

describe('directional contract installation', () => {
  it('stores the installed contract and resetRegistries clears it', () => {
    installDirectionalAnimation(ANIMATION)
    expect(installedDirectionalAnimation()).toBe(ANIMATION)
    resetRegistries()
    expect(installedDirectionalAnimation()).toBeNull()
  })
})

describe('isAnimationFacingProvider', () => {
  it('recognizes only objects exposing getAnimationFacing', () => {
    expect(isAnimationFacingProvider({ getAnimationFacing: () => 'e' })).toBe(true)
    expect(isAnimationFacingProvider({ facing: 1 })).toBe(false)
    expect(isAnimationFacingProvider(null)).toBe(false)
  })
})
