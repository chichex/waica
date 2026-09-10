import type { AudioBackend, AudioResource, BackendPlayHandle } from './backend.js'
import { Entity } from '../entity.js'
import { attenuationForDistance, panForOffset } from './spatial.js'
import { WebAudioBackend } from './web-audio-backend.js'
import type { AudioChannelState, AudioPlayOptions, LiveSoundInfo, SoundHandle } from './types.js'

export interface AudioSubsystemOptions {
  /** The game's canvas — the audio unlock listens for a pointerdown on it (CA-6). */
  canvas: HTMLCanvasElement
  /** Replaces the real WebAudio implementation (ADR 0013); defaults to it. */
  backend?: AudioBackend
  /**
   * Resolves a uri the same way the scene loader resolves every prefab's
   * string prop (`resolveProps` in scene.ts), but for direct `play()`/
   * `preload()` calls — a project role or the host, not a spawned prefab.
   * Looked up on every call rather than captured once, since `Game` wires
   * this to its registered scene catalog, which can be (re)registered at
   * any time and — unlike `Game.registry` — survives `unloadScene()`.
   * Defaults to identity, so an unresolvable or already-resolved uri (a
   * pre-resolving caller) passes through unchanged either way.
   */
  resolveAsset?: (uri: string) => string
}

type ResourceState = { status: 'pending' } | { status: 'ready'; resource: AudioResource } | { status: 'failed' }

/** Where a positional sound's placement comes from (CA-8): a tracked entity, or a fixed point. */
type SoundPlacement = { kind: 'entity'; entity: Entity } | { kind: 'point'; x: number; y: number }

interface LiveSound {
  uri: string
  channel: string
  scope: 'scene' | 'session'
  loop: boolean
  /** The sound's own gain, set by the caller/handle — independent of positional attenuation. */
  volume: number
  /** Last computed distance attenuation (CA-8): 1 for a flat sound, always. */
  attenuation: number
  /** Last computed stereo pan (CA-8): 0 (centered) for a flat sound, always. */
  pan: number
  /** Null for a flat sound (no `at`): never touched by updatePlacements. */
  placement: SoundPlacement | null
  ended: boolean
  backendHandle: BackendPlayHandle | null
  /**
   * True once stop({ fadeMs }) has started the backend's gain ramp toward
   * zero. `playing` stays true for the length of that ramp (CA-2), so the
   * sound is still in `live` and would otherwise keep receiving per-frame
   * placement updates (CA-8) — a plain `setVolume` write competing with the
   * backend's own ramp, cutting it short instead of fading. updatePlacements
   * skips a fading sound entirely once this is set.
   */
  fading: boolean
}

function resolvePlacement(at: AudioPlayOptions['at']): SoundPlacement | null {
  if (!at) return null
  if (at instanceof Entity) return { kind: 'entity', entity: at }
  return { kind: 'point', x: at.x, y: at.y }
}

const FACTORY_CHANNELS = ['music', 'sfx'] as const

/**
 * The engine's audio mixer (`game.audio`). Talks to WebAudio only through
 * the AudioBackend seam (ADR 0013), so the whole contract is assertable in
 * `happy-dom` against an injected fake. A sound dies with its scene unless
 * it says `{ scope: 'session' }` — the opposite default from GameUi, on
 * purpose (ADR 0012); `unloadScene()` is Game's hook for that (CA-7).
 * `updatePlacements()` is Game's per-frame hook for positional audio (CA-8).
 */
export class AudioSubsystem {
  private readonly backend: AudioBackend
  private readonly canvas: HTMLCanvasElement
  private readonly resolveAsset: (uri: string) => string
  private readonly channelsMap = new Map<string, AudioChannelState>()
  private readonly live = new Set<LiveSound>()
  /**
   * Loops requested before unlock (defect: a music bed started at boot,
   * before any gesture, used to be discarded forever). Each is already in
   * `live` and already has a real handle; only its attach() to the backend
   * is deferred until the unlock latch flips. A non-looping call before
   * unlock is still discarded exactly as before — see `play()`.
   */
  private readonly pendingUnlock = new Set<LiveSound>()
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
    this.resolveAsset = options.resolveAsset ?? ((uri) => uri)
    for (const name of FACTORY_CHANNELS) this.channelsMap.set(name, { volume: 1, muted: false })
    window.addEventListener('keydown', this.handleUnlockEvent)
    this.canvas.addEventListener('pointerdown', this.handleUnlockEvent)
  }

  /**
   * Starts a sound. Before the first unlock (CA-6), a one-shot registers
   * nothing and touches no backend at all — the returned handle just
   * reports `playing: false` forever. A *looping* call is different: it is
   * remembered (a deliberate, singular bed, unlike a burst of one-shots
   * that would all fire at once and sound broken) and started once the
   * unlock happens, on this same handle — nothing reaches the backend
   * until then either way. `opts.at` (CA-8, positional audio) sets up
   * placement tracking; Game calls updatePlacements() once per frame to
   * actually compute pan/attenuation and forward them to the backend.
   */
  play(uri: string, opts: AudioPlayOptions = {}): SoundHandle {
    const resolvedUri = this.resolveAsset(uri)
    const channel = opts.channel ?? 'sfx'
    const volume = opts.volume ?? 1
    const loop = opts.loop ?? false
    const scope: 'scene' | 'session' = opts.scope === 'session' ? 'session' : 'scene'
    const placement = resolvePlacement(opts.at)
    this.ensureChannel(channel)

    if (!this.unlocked && !loop) return inertHandle(volume)

    const sound: LiveSound = {
      uri: resolvedUri,
      channel,
      scope,
      loop,
      volume,
      attenuation: 1,
      pan: 0,
      placement,
      ended: false,
      backendHandle: null,
      fading: false,
    }
    this.live.add(sound)
    if (this.unlocked) this.attach(resolvedUri, sound)
    else this.pendingUnlock.add(sound)
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
    await Promise.all(uris.map((uri) => this.ensureLoading(this.resolveAsset(uri))))
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

  /**
   * Recomputes pan and distance attenuation for every live sound started
   * with `at` (CA-8) — called by Game once per frame. `listener` and every
   * placement's source position are logical coordinates, so attenuation
   * reflects real game distance; `toRenderSpace` (`game.renderPoint`)
   * converts both to render space for panning, so an isometric source that
   * reads to the right on screen pans right regardless of its logical
   * distance. A sound with no placement (a flat sound) is never touched.
   */
  updatePlacements(
    listener: { x: number; y: number },
    toRenderSpace: (x: number, y: number) => { x: number; y: number },
  ): void {
    if (this.live.size === 0) return
    let listenerRender: { x: number; y: number } | null = null
    for (const sound of this.live) {
      if (sound.fading) continue
      const placement = sound.placement
      if (!placement) continue
      const source =
        placement.kind === 'entity'
          ? { x: placement.entity.position.x, y: placement.entity.position.y }
          : placement
      sound.attenuation = attenuationForDistance(Math.hypot(source.x - listener.x, source.y - listener.y))
      listenerRender ??= toRenderSpace(listener.x, listener.y)
      const sourceRender = toRenderSpace(source.x, source.y)
      sound.pan = panForOffset(sourceRender.x - listenerRender.x)
      sound.backendHandle?.setVolume(sound.volume * sound.attenuation)
      sound.backendHandle?.setPan(sound.pan)
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
    this.pendingUnlock.clear()
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
      volume: sound.volume * sound.attenuation,
      loop: sound.loop,
      onEnded: () => {
        if (sound.ended) return
        sound.ended = true
        this.live.delete(sound)
      },
    })
    // A placement update may have already run while this sound was still
    // loading (CA-8) — carry its pan over now that a backend handle exists.
    if (sound.placement) sound.backendHandle.setPan(sound.pan)
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
      sound.fading = true
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
        // While a fade-out ramp is running (fading), skip the backend write:
        // a plain gain assignment is equivalent to a setValueAtTime inserted
        // before the ramp's end (Web Audio spec), which jumps the gain back
        // up and only then resumes descending — cutting the fade short,
        // same mechanism updatePlacements() already guards against. The
        // stored value above is updated regardless, so the sound reads back
        // correctly however long it stays `fading` before it truly ends.
        if (!sound.fading) sound.backendHandle?.setVolume(value * sound.attenuation)
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
   * Flips the one-way unlock latch, detaches the DOM listeners, and releases
   * every loop that was retained while locked (the boot-music-bed fix) —
   * without syncing output. Callers decide when to sync so a silencing
   * change arriving in the same call (setSilenced) composes into a single,
   * correct resume/suspend decision instead of a spurious resume-then-
   * suspend pair.
   */
  private markUnlocked(): void {
    if (this.unlocked) return
    this.unlocked = true
    window.removeEventListener('keydown', this.handleUnlockEvent)
    this.canvas.removeEventListener('pointerdown', this.handleUnlockEvent)
    const pending = [...this.pendingUnlock]
    this.pendingUnlock.clear()
    for (const sound of pending) {
      // stop() while still pending drops the sound outright (no backend
      // handle to fade) and marks it ended — it must never start.
      if (sound.ended) continue
      this.attach(sound.uri, sound)
    }
  }

  private syncOutput(): void {
    const desired = this.unlocked && this.active && !this.silenced
    if (desired === this.outputLive) return
    this.outputLive = desired
    if (desired) this.backend.resume()
    else this.backend.suspend()
  }
}

/**
 * Returned by play() for a non-looping call made before the first unlock:
 * registers nothing in `live`, touches no backend, and reports `playing`
 * false forever. A uri already known to have failed takes a different path
 * — it still registers a real sound (attach() -> drop()), so play() returns
 * a handleFor() handle whose `sound.ended` is already true instead of this one.
 */
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
