import { afterEach, describe, expect, it, vi } from 'vitest'
import { browserSoundPreview } from './sound-preview'

class FakeAudio {
  static instances: FakeAudio[] = []
  volume = 1
  src: string
  played = false
  constructor(src: string) {
    this.src = src
    FakeAudio.instances.push(this)
  }
  play(): Promise<void> {
    this.played = true
    return Promise.resolve()
  }
}

class RejectingAudio extends FakeAudio {
  override play(): Promise<void> {
    return Promise.reject(new Error('decode failed'))
  }
}

describe('browserSoundPreview (CA-18)', () => {
  afterEach(() => {
    FakeAudio.instances = []
    vi.unstubAllGlobals()
  })

  it('plays the given url at full volume through a plain Audio element', () => {
    vi.stubGlobal('Audio', FakeAudio)

    browserSoundPreview.play('blob:swing')

    expect(FakeAudio.instances).toHaveLength(1)
    expect(FakeAudio.instances[0]!.src).toBe('blob:swing')
    expect(FakeAudio.instances[0]!.volume).toBe(1)
    expect(FakeAudio.instances[0]!.played).toBe(true)
  })

  it('never throws when playback is rejected (e.g. a decode failure)', async () => {
    vi.stubGlobal('Audio', RejectingAudio)

    expect(() => browserSoundPreview.play('blob:bad')).not.toThrow()
    // Let the rejected promise's .catch settle before the test ends.
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
})
