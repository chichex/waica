import { describe, expect, it } from 'vitest'
import { missingClips, resolveClip, type AnimationContract } from './contract'

const CONTRACT: AnimationContract = {
  required: ['idle', 'run', 'jump', 'fall'],
  fallbacks: { run: 'idle', jump: 'idle', fall: 'jump' },
}

describe('resolveClip', () => {
  it('returns the requested clip if it exists', () => {
    expect(resolveClip(CONTRACT, ['idle', 'run'], 'run')).toBe('run')
  })

  it('degrades along the fallback chain', () => {
    expect(resolveClip(CONTRACT, ['idle'], 'run')).toBe('idle')
    // fall → jump → idle
    expect(resolveClip(CONTRACT, ['idle'], 'fall')).toBe('idle')
  })

  it('falls back to the first available clip if the chain fails', () => {
    expect(resolveClip(CONTRACT, ['walk'], 'run')).toBe('walk')
  })

  it('returns undefined with no clips available', () => {
    expect(resolveClip(CONTRACT, [], 'run')).toBeUndefined()
  })
})

describe('missingClips', () => {
  it('lists the contract gaps', () => {
    expect(missingClips(CONTRACT, ['idle', 'jump'])).toEqual(['run', 'fall'])
  })

  it('empty when the contract is complete', () => {
    expect(missingClips(CONTRACT, ['idle', 'run', 'jump', 'fall', 'extra'])).toEqual([])
  })
})
