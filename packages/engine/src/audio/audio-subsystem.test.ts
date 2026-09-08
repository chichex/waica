// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioSubsystem } from './audio-subsystem.js'
import { FakeAudioBackend, flush } from './test-helpers.js'

function makeSubsystem(): { audio: AudioSubsystem; backend: FakeAudioBackend; canvas: HTMLCanvasElement } {
  const canvas = document.createElement('canvas')
  document.body.append(canvas)
  const backend = new FakeAudioBackend()
  const audio = new AudioSubsystem({ canvas, backend })
  return { audio, backend, canvas }
}

function unlock(): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CA-1 — playback, channels and master', () => {
  it('creates music and sfx at volume 1 from construction, in that order', () => {
    const { audio } = makeSubsystem()
    expect(audio.channels()).toEqual(['music', 'sfx'])
    expect(audio.channelState('music')).toEqual({ volume: 1, muted: false })
    expect(audio.channelState('sfx')).toEqual({ volume: 1, muted: false })
  })

  it('hands the backend the resolved uri, channel, volume and loop flag', async () => {
    const { audio, backend } = makeSubsystem()
    unlock()

    audio.play('swing.ogg', { channel: 'ambient', volume: 0.4, loop: true })
    await flush()

    expect(backend.loadCalls).toEqual([{ uri: 'swing.ogg' }])
    expect(backend.playCalls).toEqual([{ resource: 'swing.ogg', channel: 'ambient', volume: 0.4, loop: true }])
  })

  it('defaults channel to sfx, volume to 1 and loop to false', async () => {
    const { audio, backend } = makeSubsystem()
    unlock()

    audio.play('hit.ogg')
    await flush()

    expect(backend.playCalls).toEqual([{ resource: 'hit.ogg', channel: 'sfx', volume: 1, loop: false }])
  })

  it('creates a channel named by play() at volume 1 and enumerates it', async () => {
    const { audio } = makeSubsystem()
    unlock()

    audio.play('bed.ogg', { channel: 'ambient' })
    await flush()

    expect(audio.channels()).toEqual(['music', 'sfx', 'ambient'])
    expect(audio.channelState('ambient')).toEqual({ volume: 1, muted: false })
  })

  it('setting the master forwards to the backend and is readable back', () => {
    const { audio, backend } = makeSubsystem()

    audio.master = 0.5

    expect(audio.master).toBe(0.5)
    expect(backend.masterVolumeCalls).toEqual([0.5])
  })

  it('setChannelVolume/setChannelMuted update channelState and forward to the backend', () => {
    const { audio, backend } = makeSubsystem()

    audio.setChannelVolume('music', 0.2)
    audio.setChannelMuted('music', true)

    expect(audio.channelState('music')).toEqual({ volume: 0.2, muted: true })
    expect(backend.channelVolumeCalls).toEqual([{ channel: 'music', volume: 0.2 }])
    expect(backend.channelMutedCalls).toEqual([{ channel: 'music', muted: true }])
  })

  it('reading channelState() of an unnamed channel reports defaults without creating it', () => {
    const { audio } = makeSubsystem()

    expect(audio.channelState('never-named')).toEqual({ volume: 1, muted: false })
    expect(audio.channels()).toEqual(['music', 'sfx'])
  })

  it('muting a channel makes its sounds inaudible without stopping them', async () => {
    const { audio, backend } = makeSubsystem()
    unlock()
    const handle = audio.play('coin.ogg', { channel: 'sfx' })
    await flush()

    audio.setChannelMuted('sfx', true)

    expect(backend.channelMutedCalls).toEqual([{ channel: 'sfx', muted: true }])
    expect(handle.playing).toBe(true)
    expect(backend.playbacks[0]?.stops).toEqual([])
  })
})

describe('CA-2 — the handle', () => {
  it('reports playing true immediately after play()', async () => {
    const { audio } = makeSubsystem()
    unlock()

    const handle = audio.play('hit.ogg')

    expect(handle.playing).toBe(true)
    await flush()
    expect(handle.playing).toBe(true)
  })

  it('stop() with no fadeMs flips playing to false immediately and stops the backend handle', async () => {
    const { audio, backend } = makeSubsystem()
    unlock()
    const handle = audio.play('hit.ogg')
    await flush()

    handle.stop()

    expect(handle.playing).toBe(false)
    expect(backend.playbacks[0]?.stops).toEqual([{ fadeMs: undefined }])
  })

  it('stop({ fadeMs }) keeps playing true for the length of the ramp, then flips false when the backend ends it', async () => {
    const { audio, backend } = makeSubsystem()
    unlock()
    const handle = audio.play('hit.ogg')
    await flush()

    handle.stop({ fadeMs: 500 })

    expect(backend.playbacks[0]?.stops).toEqual([{ fadeMs: 500 }])
    expect(handle.playing).toBe(true)
    expect(audio.liveSounds()).toEqual([{ uri: 'hit.ogg', channel: 'sfx', scope: 'scene' }])

    backend.playbacks[0]?.finish()

    expect(handle.playing).toBe(false)
    expect(audio.liveSounds()).toEqual([])
  })

  it('setting volume after the backend attaches changes its gain', async () => {
    const { audio, backend } = makeSubsystem()
    unlock()
    const handle = audio.play('hit.ogg', { volume: 1 })
    await flush()

    handle.volume = 0.3

    expect(handle.volume).toBe(0.3)
    expect(backend.playbacks[0]?.setVolumeCalls).toEqual([0.3])
  })

  it('setting volume before the backend attaches is honored at attach time', async () => {
    const { audio, backend } = makeSubsystem()
    unlock()
    const handle = audio.play('hit.ogg', { volume: 1 })

    handle.volume = 0.2
    await flush()

    expect(backend.playCalls).toEqual([{ resource: 'hit.ogg', channel: 'sfx', volume: 0.2, loop: false }])
  })
})

describe('CA-6 — autoplay unlock', () => {
  it('discards play() before any input: registers nothing, starts no AudioContext', async () => {
    const { audio, backend } = makeSubsystem()

    const handle = audio.play('hit.ogg')
    await flush()

    expect(handle.playing).toBe(false)
    expect(backend.loadCalls).toEqual([])
    expect(backend.playCalls).toEqual([])
    expect(backend.resumeCalls).toBe(0)
    expect(audio.liveSounds()).toEqual([])
  })

  it('unlocks on the first keydown: creates/resumes the backend once, then plays normally', async () => {
    const { audio, backend } = makeSubsystem()

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
    expect(backend.resumeCalls).toBe(1)

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' }))
    expect(backend.resumeCalls).toBe(1)

    audio.play('hit.ogg')
    await flush()
    expect(backend.playCalls).toHaveLength(1)
  })

  it('unlocks on the first pointerdown on the canvas', async () => {
    const { audio, backend, canvas } = makeSubsystem()

    canvas.dispatchEvent(new PointerEvent('pointerdown'))
    expect(backend.resumeCalls).toBe(1)

    canvas.dispatchEvent(new PointerEvent('pointerdown'))
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
    expect(backend.resumeCalls).toBe(1)

    audio.play('hit.ogg')
    await flush()
    expect(backend.playCalls).toHaveLength(1)
  })
})

describe('CA-9 — loading, caching and failure', () => {
  it('fetches and decodes a uri once; a second play() of it reuses the buffer, no second fetch', async () => {
    const { audio, backend } = makeSubsystem()
    unlock()

    audio.play('hit.ogg')
    await flush()
    audio.play('hit.ogg')
    await flush()

    expect(backend.loadCalls).toEqual([{ uri: 'hit.ogg' }])
    expect(backend.playCalls).toHaveLength(2)
  })

  it('preload() resolves even when one file fails', async () => {
    const { audio, backend } = makeSubsystem()
    unlock()
    backend.failUri('missing.ogg')

    await expect(audio.preload(['hit.ogg', 'missing.ogg'])).resolves.toBeUndefined()

    expect(backend.loadCalls.map((c) => c.uri).sort()).toEqual(['hit.ogg', 'missing.ogg'])
  })

  it('a uri that fails to load warns once and never throws; later play() calls stay silent', async () => {
    const { audio, backend } = makeSubsystem()
    unlock()
    backend.failUri('missing.ogg')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(() => audio.play('missing.ogg')).not.toThrow()
    await flush()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(backend.playCalls).toEqual([])
    expect(audio.liveSounds()).toEqual([])

    expect(() => audio.play('missing.ogg')).not.toThrow()
    await flush()
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
