import { afterEach, describe, expect, it, vi } from 'vitest'
import { browserSoundPreview } from './sound-preview'

class FakeAudio {
  static instances: FakeAudio[] = []
  volume = 1
  src: string
  played = false
  paused = false
  private listeners = new Map<string, Array<() => void>>()
  constructor(src: string) {
    this.src = src
    FakeAudio.instances.push(this)
  }
  play(): Promise<void> {
    this.played = true
    this.paused = false
    return Promise.resolve()
  }
  pause(): void {
    this.paused = true
  }
  addEventListener(type: string, listener: () => void): void {
    const list = this.listeners.get(type) ?? []
    list.push(listener)
    this.listeners.set(type, list)
  }
  /** Test helper: simulates the browser firing this event on the element. */
  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener()
  }
}

class RejectingAudio extends FakeAudio {
  override play(): Promise<void> {
    return Promise.reject(new Error('decode failed'))
  }
}

describe('browserSoundPreview (CA-18, review finding B)', () => {
  afterEach(() => {
    browserSoundPreview.stop()
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

  it('a second play() stops the first preview before starting the new one', () => {
    vi.stubGlobal('Audio', FakeAudio)

    browserSoundPreview.play('blob:swing')
    const first = FakeAudio.instances[0]!
    expect(first.paused).toBe(false)

    browserSoundPreview.play('blob:hit')

    expect(first.paused).toBe(true)
    expect(FakeAudio.instances).toHaveLength(2)
    expect(FakeAudio.instances[1]!.played).toBe(true)
    expect(FakeAudio.instances[1]!.paused).toBe(false)
  })

  it('stop() stops a playing preview', () => {
    vi.stubGlobal('Audio', FakeAudio)

    browserSoundPreview.play('blob:swing')
    const audio = FakeAudio.instances[0]!
    expect(audio.paused).toBe(false)

    browserSoundPreview.stop()

    expect(audio.paused).toBe(true)
  })

  it('stop() is a no-op when nothing is playing', () => {
    vi.stubGlobal('Audio', FakeAudio)

    expect(() => browserSoundPreview.stop()).not.toThrow()
  })

  it('notifies onEnded exactly once when stopped explicitly', () => {
    vi.stubGlobal('Audio', FakeAudio)
    const onEnded = vi.fn()

    browserSoundPreview.play('blob:swing', onEnded)
    browserSoundPreview.stop()

    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('notifies the first preview onEnded when a second one replaces it', () => {
    vi.stubGlobal('Audio', FakeAudio)
    const onEnded = vi.fn()

    browserSoundPreview.play('blob:swing', onEnded)
    browserSoundPreview.play('blob:hit')

    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('notifies onEnded when playback ends naturally, without a stop() call', () => {
    vi.stubGlobal('Audio', FakeAudio)
    const onEnded = vi.fn()

    browserSoundPreview.play('blob:swing', onEnded)
    FakeAudio.instances[0]!.emit('ended')

    expect(onEnded).toHaveBeenCalledTimes(1)
  })
})
