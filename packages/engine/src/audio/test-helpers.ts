import type { AudioBackend, AudioResource, BackendPlayHandle, BackendPlayOptions } from './backend.js'

export interface FakeLoadCall {
  uri: string
}

export interface FakePlayCall {
  resource: AudioResource
  channel: string
  volume: number
  loop: boolean
}

export interface FakeStopCall {
  fadeMs: number | undefined
}

/** One playing sound as the fake backend sees it: its own log plus the onEnded hook a test can fire manually. */
export interface FakePlayback {
  readonly resource: AudioResource
  readonly channel: string
  readonly loop: boolean
  volume: number
  pan: number
  readonly stops: FakeStopCall[]
  readonly setVolumeCalls: number[]
  /** CA-8: every pan the subsystem sent this playback, in order. Empty for a flat sound. */
  readonly setPanCalls: number[]
  /** Simulates the sound truly finishing (natural end, or a fade's ramp completing). */
  finish(): void
}

/**
 * Records exactly what a real WebAudioBackend would receive, per ADR 0013.
 * Load resolves to `uri` itself as the "decoded resource" unless a uri is
 * registered to fail via failUri().
 */
export class FakeAudioBackend implements AudioBackend {
  readonly loadCalls: FakeLoadCall[] = []
  readonly playCalls: FakePlayCall[] = []
  readonly playbacks: FakePlayback[] = []
  readonly channelVolumeCalls: Array<{ channel: string; volume: number }> = []
  readonly channelMutedCalls: Array<{ channel: string; muted: boolean }> = []
  readonly masterVolumeCalls: number[] = []
  suspendCalls = 0
  resumeCalls = 0
  closeCalls = 0

  private readonly failingUris = new Set<string>()

  /** Makes a subsequent load() of this uri reject, as if the fetch/decode failed. */
  failUri(uri: string): void {
    this.failingUris.add(uri)
  }

  async load(uri: string): Promise<AudioResource> {
    this.loadCalls.push({ uri })
    if (this.failingUris.has(uri)) throw new Error(`fake backend: "${uri}" is configured to fail`)
    return uri
  }

  play(resource: AudioResource, options: BackendPlayOptions): BackendPlayHandle {
    this.playCalls.push({ resource, channel: options.channel, volume: options.volume, loop: options.loop })
    let ended = false
    const playback: FakePlayback = {
      resource,
      channel: options.channel,
      loop: options.loop,
      volume: options.volume,
      pan: 0,
      stops: [],
      setVolumeCalls: [],
      setPanCalls: [],
      finish: () => {
        if (ended) return
        ended = true
        options.onEnded()
      },
    }
    this.playbacks.push(playback)
    return {
      setVolume: (volume: number) => {
        playback.volume = volume
        playback.setVolumeCalls.push(volume)
      },
      setPan: (pan: number) => {
        playback.pan = pan
        playback.setPanCalls.push(pan)
      },
      stop: (fadeMs?: number) => {
        playback.stops.push({ fadeMs })
        if (!fadeMs) playback.finish()
      },
    }
  }

  setChannelVolume(channel: string, volume: number): void {
    this.channelVolumeCalls.push({ channel, volume })
  }

  setChannelMuted(channel: string, muted: boolean): void {
    this.channelMutedCalls.push({ channel, muted })
  }

  setMasterVolume(volume: number): void {
    this.masterVolumeCalls.push(volume)
  }

  suspend(): void {
    this.suspendCalls += 1
  }

  resume(): void {
    this.resumeCalls += 1
  }

  close(): void {
    this.closeCalls += 1
  }
}

/** Waits for the microtask queue to drain, past the async load()/play() attach chain. */
export async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}
