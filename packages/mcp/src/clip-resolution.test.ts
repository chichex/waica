import { describe, expect, it } from 'vitest'
import type { DirectionalAnimation } from '@waica/engine'
import { isPlayableClip } from './clip-resolution.js'

/** Four facings drawn as three, with west mirrored from east — the top-down shape. */
const FOUR_WAY: DirectionalAnimation = {
  directions: ['n', 's', 'e', 'w'],
  fallbacks: { w: { dir: 'e', flip: true } },
  contract: { required: ['idle'], fallbacks: { walk: 'idle' } },
}

function clips(...names: string[]): Set<string> {
  return new Set(names)
}

describe('isPlayableClip', () => {
  it('accepts a literal clip and rejects an absent one when no contract is declared', () => {
    expect(isPlayableClip(clips('idle', 'walk'), 'idle', undefined)).toBe(true)
    expect(isPlayableClip(clips('idle', 'walk'), 'run', undefined)).toBe(false)
  })

  it('rejects a directionally-named sheet when no contract is declared', () => {
    // Nothing resolves `idle` to `idle-s` without an archetype contract.
    expect(isPlayableClip(clips('idle-n', 'idle-s', 'idle-e'), 'idle', undefined)).toBe(false)
  })

  it('accepts a clip that resolves in every declared direction, mirrors included', () => {
    expect(isPlayableClip(clips('idle-n', 'idle-s', 'idle-e'), 'idle', FOUR_WAY)).toBe(true)
  })

  it('rejects a clip that dead-ends in one declared direction', () => {
    // No idle-e, so east dead-ends and west (mirrored from east) with it.
    expect(isPlayableClip(clips('idle-n', 'idle-s'), 'idle', FOUR_WAY)).toBe(false)
  })

  it('still accepts a plain literal clip under a contract', () => {
    // Facing-less characters ship flat clips; the contract must not break them.
    expect(isPlayableClip(clips('idle', 'walk'), 'walk', FOUR_WAY)).toBe(true)
  })

  it('accepts a state that only resolves through the contract state fallback', () => {
    // walk -> idle: deliberate parity with archetype-conformance.test.ts. The
    // character plays an idle instead of a walk, and validation stays quiet.
    expect(isPlayableClip(clips('idle-n', 'idle-s', 'idle-e'), 'walk', FOUR_WAY)).toBe(true)
  })

  it('rejects a state outside the contract fallbacks with no art of its own', () => {
    expect(isPlayableClip(clips('idle-n', 'idle-s', 'idle-e'), 'sprint', FOUR_WAY)).toBe(false)
  })

  it('rejects everything under a contract that declares no direction', () => {
    // "every declared direction" must not pass vacuously on an empty list.
    const noDirections: DirectionalAnimation = { ...FOUR_WAY, directions: [] }
    expect(isPlayableClip(clips('idle-n'), 'idle', noDirections)).toBe(false)
  })

  it('rejects an explicit empty clip name rather than resolving it', () => {
    expect(isPlayableClip(clips('idle-n', 'idle-s', 'idle-e'), '', FOUR_WAY)).toBe(false)
  })
})
