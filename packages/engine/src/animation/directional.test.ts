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
    // ANIMATION.contract.fallbacks maps walk -> idle, and 'idle' is bare in
    // the available set, so the base-chain walk legitimately reaches it.
    const resolved = resolveDirectionalClip(ANIMATION, ['idle'], 'walk', 'n')
    expect(resolved).toEqual({ clip: 'idle', flip: false })
  })

  it('survives a directional fallback cycle and dead-ends when the base chain has nowhere to go', () => {
    // Deliberately updated: this fixture's contract.fallbacks is empty, so
    // there was never a real path from 'walk' to 'idle' — the old result
    // only "worked" because a dead end fell back to an arbitrary available
    // clip. Under the fix, no path means no clip; the cycle still can't hang.
    const cyclic: DirectionalAnimation = {
      directions: ['n', 's'],
      fallbacks: { n: { dir: 's' }, s: { dir: 'n' } },
      contract: { required: [], fallbacks: {} },
    }
    const resolved = resolveDirectionalClip(cyclic, ['idle'], 'walk', 'n')
    expect(resolved).toEqual({ clip: undefined, flip: false })
  })

  it('refuses a facing that is not one of the declared directions', () => {
    const resolved = resolveDirectionalClip(ANIMATION, ['walk-e', 'idle'], 'walk', 'up')
    expect(resolved).toEqual({ clip: undefined, flip: false })
  })

  it('dead-ends to undefined instead of an arbitrary available clip', () => {
    // Only a directional clip for a different state is available ('walk-n'
    // while resolving 'idle'); the old code's last resort ("first available
    // clip") would have returned it arbitrarily.
    const resolved = resolveDirectionalClip(ANIMATION, ['walk-n'], 'idle', 'e')
    expect(resolved).toEqual({ clip: undefined, flip: false })
  })

  it('resolves a base-chain candidate directionally before trying it bare', () => {
    const contract: DirectionalAnimation = {
      directions: ['n', 's', 'e', 'w'],
      contract: { required: [], fallbacks: { walk: 'idle' } },
    }
    const resolved = resolveDirectionalClip(contract, ['idle-e'], 'walk', 'e')
    expect(resolved).toEqual({ clip: 'idle-e', flip: false })
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
