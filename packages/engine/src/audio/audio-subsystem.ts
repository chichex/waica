import type { AudioBackend, AudioResource, BackendPlayHandle } from './backend.js'
import { WebAudioBackend } from './web-audio-backend.js'
import type { AudioChannelState, AudioPlayOptions, LiveSoundInfo, SoundHandle } from './types.js'

export interface AudioSubsystemOptions {
  /** The game's canvas — the audio unlock listens for a pointerdown on it (CA-6). */
  canvas: HTMLCanvasElement
  /** Replaces the real WebAudio implementation (ADR 0013); defaults to it. */
  backend?: AudioBackend
}

type ResourceState = { status: 'pending' } | { status: 'ready'; resource: AudioResource } | { status: 'failed' }

interface LiveSound {
  uri: string
  channel: string
  scope: 'scene' | 'session'
  loop: boolean
  volume: number
  ended: boolean
  backendHandle: BackendPlayHandle | null
}

const FACTORY_CHANNELS = ['music', 'sfx'] as const

/**
 * The engine's audio mixer (`game.audio`). Talks to WebAudio only through
 * the AudioBackend seam (ADR 0013), so the whole contract is assertable in
 * `happy-dom` against an injected fake. A sound dies with its scene unless
 * it says `{ scope: 'session' }` — the opposite default from GameUi, on
 * purpose (ADR 0012); `unloadScene()` is Game's hook for that (CA-7).
 */
export class AudioSubsystem {
  private readonly backend: AudioBackend
  private readonly canvas: HTMLCanvasElement
  private readonly channelsMap = new Map<string, AudioChannelState>()
  private readonly live = new Set<LiveSound>()
  private readonly resourceStates = new Map<string, ResourceState>()
  private readonly resourcePromises = new Map<string, Promise<void>>()
  private masterVolume = 1
  private active = true
  private silenced = false
  private unlocked = false
  /** Whether the backend was last told to be resumed (true) or suspended (false). */
  private outputLive = false

  constructor(options: AudioSubsystemOptions) {
    this.backend = options.backend ?? new WebAudioBackend()
    this.canvas = options.canvas
    for (const name of FACTORY_CHANNELS) this.channelsMap.set(name, { volume: 1, muted: false })
    window.addEventListener('keydown', this.handleUnlockEvent)
    this.canvas.addEventListener('pointerdown', this.handleUnlockEvent)
  }

  /**
   * Starts a sound. Before the first unlock (CA-6) this registers nothing
   * and touches no backend at all — the returned handle just reports
   * `playing: false` forever. `opts.at` (CA-8, positional audio) is
   * accepted here and currently ignored: the sound plays flat.
   */
  play(uri: string, opts: AudioPlayOptions = {}): SoundHandle {
    const channel = opts.channel ?? 'sfx'
    const volume = opts.volume ?? 1
    const loop = opts.loop ?? false
    const scope: 'scene' | 'session' = opts.scope === 'session' ? 'session' : 'scene'
    this.ensureChannel(channel)

    if (!this.unlocked) return inertHandle(volume)

    const sound: LiveSound = { uri, channel, scope, loop, volume, ended: false, backendHandle: null }
    this.live.add(sound)
    this.attach(uri, sound)
    return this.handleFor(sound)
  }

  /** Every channel name, factory and runtime-created, in creation order. */
  channels(): string[] {
    return [...this.channelsMap.keys()]
  }

  /** A channel's current volume/mute. Reading an unnamed channel reports defaults without creating it. */
  channelState(name: string): AudioChannelState {
    const state = this.channelsMap.get(name)
    return state ? { ...state } : { volume: 1, muted: false }
  }

  setChannelVolume(name: string, volume: number): void {
    this.ensureChannel(name).volume = volume
    this.backend.setChannelVolume(name, volume)
  }

  /** Silences (or restores) every sound on the channel without stopping them. */
  setChannelMuted(name: string, muted: boolean): void {
    this.ensureChannel(name).muted = muted
    this.backend.setChannelMuted(name, muted)
  }

  get master(): number {
    return this.masterVolume
  }

  /** Scales every channel's effective output. */
  set master(value: number) {
    this.masterVolume = value
    this.backend.setMasterVolume(value)
  }

  /**
   * Fetches and decodes every uri ahead of time. Resolves even if one (or
   * all) of them fail to load — each failure still only warns once, the
   * same as a failing play() (CA-9).
   */
  async preload(uris: string[]): Promise<void> {
    await Promise.all(uris.map((uri) => this.ensureLoading(uri)))
  }

  /** Every currently-playing sound, sorted by uri then channel. */
  liveSounds(): LiveSoundInfo[] {
    return [...this.live]
      .map(({ uri, channel, scope }) => ({ uri, channel, scope }))
      .sort((a, b) => (a.uri === b.uri ? a.channel.localeCompare(b.channel) : a.uri.localeCompare(b.uri)))
  }

  /** Called by Game from runFrame: the editor's pause suspends output without touching sounds in flight (CA-4). */
  setActive(active: boolean): void {
    if (this.active === active) return
    this.active = active
    this.syncOutput()
  }

  /**
   * Called by Game when a Runtime Bridge registers/unregisters (CA-5).
   * Registering also counts as an unlock: the Runtime Bridge drives the
   * game programmatically (injectAction/injectClick), never through a real
   * trusted keydown/pointerdown, so CA-6's gesture-gate would otherwise
   * discard every sound for the whole life of an automated run. Silencing
   * keeps the same run producing no audio output regardless.
   */
  setSilenced(silenced: boolean): void {
    if (silenced) this.markUnlocked()
    if (this.silenced === silenced) return
    this.silenced = silenced
    this.syncOutput()
  }

  /**
   * Stops every scene-scoped sound; a sound started with `{ scope: 'session'
   * }` keeps playing, untouched (CA-7, ADR 0012). Called by Game.unloadScene().
   */
  unloadScene(): void {
    for (const sound of [...this.live]) {
      if (sound.scope === 'session') continue
      this.stopSound(sound, undefined)
    }
  }

  /** Stops every live sound — including session-scoped ones — and closes the backend (CA-10). */
  dispose(): void {
    window.removeEventListener('keydown', this.handleUnlockEvent)
    this.canvas.removeEventListener('pointerdown', this.handleUnlockEvent)
    for (const sound of [...this.live]) {
      sound.ended = true
      sound.backendHandle?.stop()
    }
    this.live.clear()
    this.backend.close()
  }

  private ensureChannel(name: string): AudioChannelState {
    let state = this.channelsMap.get(name)
    if (!state) {
      state = { volume: 1, muted: false }
      this.channelsMap.set(name, state)
    }
    return state
  }

  private attach(uri: string, sound: LiveSound): void {
    const state = this.resourceStates.get(uri)
    if (state?.status === 'ready') {
      this.startPlayback(sound, state.resource)
      return
    }
    if (state?.status === 'failed') {
      this.drop(sound)
      return
    }
    this.ensureLoading(uri)
      .then(() => {
        if (sound.ended) return
        const resolved = this.resourceStates.get(uri)
        if (resolved?.status === 'ready') this.startPlayback(sound, resolved.resource)
        else this.drop(sound)
      })
      .catch(() => {
        // ensureLoading never rejects; this is defensive, never expected to run.
        this.drop(sound)
      })
  }

  private startPlayback(sound: LiveSound, resource: AudioResource): void {
    sound.backendHandle = this.backend.play(resource, {
      channel: sound.channel,
      volume: sound.volume,
      loop: sound.loop,
      onEnded: () => {
        if (sound.ended) return
        sound.ended = true
        this.live.delete(sound)
      },
    })
  }

  private drop(sound: LiveSound): void {
    sound.ended = true
    this.live.delete(sound)
  }

  private ensureLoading(uri: string): Promise<void> {
    const existing = this.resourcePromises.get(uri)
    if (existing) return existing
    this.resourceStates.set(uri, { status: 'pending' })
    const promise = this.backend.load(uri).then(
      (resource) => {
        this.resourceStates.set(uri, { status: 'ready', resource })
      },
      (error: unknown) => {
        console.warn(`[waica] audio: failed to load "${uri}"`, error)
        this.resourceStates.set(uri, { status: 'failed' })
      },
    )
    this.resourcePromises.set(uri, promise)
    return promise
  }

  private stopSound(sound: LiveSound, fadeMs: number | undefined): void {
    if (sound.ended) return
    if (!sound.backendHandle) {
      // Still loading: nothing audible exists yet to fade, so cancel
      // outright — it must never start once the load resolves.
      this.drop(sound)
      return
    }
    if (fadeMs) {
      sound.backendHandle.stop(fadeMs)
      // playing stays true until the backend's onEnded fires, once the ramp completes.
    } else {
      sound.ended = true
      this.live.delete(sound)
      sound.backendHandle.stop()
    }
  }

  private handleFor(sound: LiveSound): SoundHandle {
    const subsystem = this
    return {
      get playing(): boolean {
        return !sound.ended
      },
      get volume(): number {
        return sound.volume
      },
      set volume(value: number) {
        sound.volume = value
        sound.backendHandle?.setVolume(value)
      },
      stop(opts: { fadeMs?: number } = {}): void {
        subsystem.stopSound(sound, opts.fadeMs)
      },
    }
  }

  private handleUnlockEvent = (): void => {
    this.markUnlocked()
    this.syncOutput()
  }

  /**
   * Flips the one-way unlock latch and detaches the DOM listeners, without
   * syncing output — callers decide when to sync so a silencing change
   * arriving in the same call (setSilenced) composes into a single,
   * correct resume/suspend decision instead of a spurious resume-then-
   * suspend pair.
   */
  private markUnlocked(): void {
    if (this.unlocked) return
    this.unlocked = true
    window.removeEventListener('keydown', this.handleUnlockEvent)
    this.canvas.removeEventListener('pointerdown', this.handleUnlockEvent)
  }

  private syncOutput(): void {
    const desired = this.unlocked && this.active && !this.silenced
    if (desired === this.outputLive) return
    this.outputLive = desired
    if (desired) this.backend.resume()
    else this.backend.suspend()
  }
}

/** Returned by play() before the first unlock, or once a uri is known to have failed: registers nothing. */
function inertHandle(initialVolume: number): SoundHandle {
  let volume = initialVolume
  return {
    get playing(): boolean {
      return false
    },
    get volume(): number {
      return volume
    },
    set volume(value: number) {
      volume = value
    },
    stop(): void {},
  }
}
