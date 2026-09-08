import type { AudioBackend, AudioResource, BackendPlayHandle, BackendPlayOptions } from './backend.js'

/**
 * The real WebAudio implementation (ADR 0013's default). Builds a small
 * mixing graph — one GainNode per sound, feeding a per-channel GainNode,
 * feeding a single master GainNode — so muting/volume/master changes are
 * plain WebAudio gain assignments, not something this class recomputes by
 * hand for every live sound.
 *
 * The AudioContext itself is never created eagerly: `happy-dom` (this
 * repo's test environment) has no AudioContext/AudioBuffer/GainNode at all,
 * and real browsers block unsolicited audio output before a user gesture.
 * `ensureContext()` is the one lazy constructor, reached only from
 * `resume()` (the unlock, CA-6) or `load()` (so `preload()` can decode
 * ahead of an unlock). If AudioContext isn't available in the current
 * environment, every method degrades to a safe no-op / rejected load
 * instead of throwing — the audio subsystem's own load-failure handling
 * (CA-9) turns that rejection into a single warning, never a crash.
 */
export class WebAudioBackend implements AudioBackend {
  private context: AudioContext | null = null
  private masterGain: GainNode | null = null
  private masterVolume = 1
  private readonly channelGains = new Map<string, GainNode>()
  private readonly channelVolumes = new Map<string, number>()
  private readonly channelMuted = new Map<string, boolean>()

  async load(uri: string): Promise<AudioResource> {
    const context = this.ensureContext()
    if (!context) throw new Error('AudioContext is not available in this environment')
    const response = await fetch(uri)
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching "${uri}"`)
    const data = await response.arrayBuffer()
    return context.decodeAudioData(data)
  }

  play(resource: AudioResource, options: BackendPlayOptions): BackendPlayHandle {
    const context = this.ensureContext()
    if (!context) return noopHandle()
    const source = context.createBufferSource()
    source.buffer = resource as AudioBuffer
    source.loop = options.loop
    const soundGain = context.createGain()
    soundGain.gain.value = options.volume
    source.connect(soundGain)
    soundGain.connect(this.ensureChannelGain(options.channel))
    let ended = false
    const finish = (): void => {
      if (ended) return
      ended = true
      options.onEnded()
    }
    source.onended = finish
    source.start()
    return {
      setVolume: (volume: number) => {
        soundGain.gain.value = volume
      },
      stop: (fadeMs?: number) => {
        if (ended) return
        const now = context.currentTime
        if (fadeMs && fadeMs > 0) {
          soundGain.gain.linearRampToValueAtTime(0, now + fadeMs / 1000)
          source.stop(now + fadeMs / 1000)
        } else {
          source.stop()
        }
      },
    }
  }

  setChannelVolume(channel: string, volume: number): void {
    this.channelVolumes.set(channel, volume)
    this.applyChannelGain(channel)
  }

  setChannelMuted(channel: string, muted: boolean): void {
    this.channelMuted.set(channel, muted)
    this.applyChannelGain(channel)
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = volume
    if (this.masterGain) this.masterGain.gain.value = volume
  }

  suspend(): void {
    void this.context?.suspend()
  }

  resume(): void {
    void this.ensureContext()?.resume()
  }

  close(): void {
    void this.context?.close()
    this.context = null
    this.masterGain = null
    this.channelGains.clear()
  }

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context
    if (typeof AudioContext === 'undefined') return null
    const context = new AudioContext()
    this.context = context
    const masterGain = context.createGain()
    masterGain.gain.value = this.masterVolume
    masterGain.connect(context.destination)
    this.masterGain = masterGain
    for (const channel of this.channelVolumes.keys()) this.ensureChannelGain(channel)
    return context
  }

  private ensureChannelGain(channel: string): GainNode {
    const existing = this.channelGains.get(channel)
    if (existing) return existing
    // Safe: only called once ensureContext() has already produced a context.
    const context = this.context!
    const gain = context.createGain()
    gain.gain.value = this.effectiveChannelGain(channel)
    gain.connect(this.masterGain!)
    this.channelGains.set(channel, gain)
    return gain
  }

  private applyChannelGain(channel: string): void {
    const gain = this.channelGains.get(channel)
    if (gain) gain.gain.value = this.effectiveChannelGain(channel)
  }

  private effectiveChannelGain(channel: string): number {
    if (this.channelMuted.get(channel)) return 0
    return this.channelVolumes.get(channel) ?? 1
  }
}

/** Returned when the environment has no AudioContext at all: inert, never throws. */
function noopHandle(): BackendPlayHandle {
  return {
    setVolume: () => {},
    stop: () => {},
  }
}
