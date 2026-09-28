import * as THREE from 'three'
import { ThreeTextureBackend, type TextureBackend } from './texture-backend.js'
import { reportRejection } from '../report-rejection.js'

/** `game.assets.status`: a fresh snapshot of the cache's counters, cumulative for the Game. */
export interface AssetStatus {
  /** Requested URLs that have not settled yet. */
  pending: number
  /** Settled URLs whose image arrived. */
  loaded: number
  /** Settled URLs whose load failed — recorded, warned once, never retried. */
  failed: number
}

export type TextureOutcome = 'loaded' | 'failed'

/** What a consumer gets from `game.assets.texture(url)`: its own clone, and when the image settled. */
export interface TextureHandle {
  texture: THREE.Texture
  settled: Promise<TextureOutcome>
}

export interface AssetLoaderOptions {
  /** Replaces the real `THREE.TextureLoader` implementation (ADR 0013); defaults to it. */
  backend?: TextureBackend
  /**
   * Resolves a uri for `preload()` the way the scene loader resolves every
   * prefab's string prop (`resolveProps` in scene.ts). Looked up on every
   * call: `Game` wires this to its registered scene catalog, which survives
   * `unloadScene()`. Defaults to identity, so an already-resolved or
   * unresolvable uri passes through unchanged either way.
   */
  resolveAsset?: (uri: string) => string
}

interface CacheEntry {
  /** The one texture per URL that owns the image; consumers only ever get clones of it. */
  base: THREE.Texture
  outcome: TextureOutcome | null
  settled: Promise<TextureOutcome>
}

type LoadAttempt =
  | { outcome: 'loaded'; texture: THREE.Texture }
  | { outcome: 'failed'; error: unknown }

/**
 * Not `base.clone()`: `Texture.copy` sets `needsUpdate`, which bumps the
 * shared Source's version — a GPU re-upload of the same image for every
 * clone — and, while the image is still missing, makes the renderer warn
 * on every frame. Sharing the Source and mirroring `version` instead marks
 * the clone uploadable exactly when the base is, and three then keeps one
 * GPU texture per (Source, sampler parameters), reference-counted across
 * clones (WebGLTextures). Colour space is the base's; filters, repeat and
 * offset are the clone's own.
 */
function cloneOf(base: THREE.Texture): THREE.Texture {
  const clone = new THREE.Texture()
  clone.source = base.source
  clone.colorSpace = base.colorSpace
  clone.version = base.version
  return clone
}

/**
 * The engine's texture cache (`game.assets`, ADR 0019): keep-all for the
 * Game's whole life, keyed by the URL as received, one backend load and one
 * base texture per URL. `ready()` is the **Assets Ready** signal — a
 * promise beside the synchronous scene load — and a failed image is
 * recorded, not thrown, so it never breaks a host or a Run Session that
 * awaits it. `unloadScene()` never touches this cache; `dispose()` empties it.
 */
export class AssetLoader {
  private readonly backend: TextureBackend
  private readonly resolveAsset: (uri: string) => string
  private readonly entries = new Map<string, CacheEntry>()
  private pendingCount = 0
  private loadedCount = 0
  private failedCount = 0

  constructor(options: AssetLoaderOptions = {}) {
    this.backend = options.backend ?? new ThreeTextureBackend()
    this.resolveAsset = options.resolveAsset ?? ((uri) => uri)
  }

  /** A fresh object on every read: `pending` is current, `loaded` and `failed` only grow until `dispose()`. */
  get status(): AssetStatus {
    return { pending: this.pendingCount, loaded: this.loadedCount, failed: this.failedCount }
  }

  /**
   * The consumer entry (Sprite, AnimatedSprite, Tilemap): requests `url`
   * — already resolved by `resolveProps` — and returns a clone of its base
   * right away, so a mesh exists before the image arrives, plus the
   * settlement of that URL, which also fires on a cache hit.
   */
  texture(url: string): TextureHandle {
    const entry = this.request(url)
    const texture = cloneOf(entry.base)
    if (entry.outcome === null) {
      // Chained here, before the consumer chains its own continuation on
      // `settled`, so the clone is uploadable by the time that one runs.
      reportRejection(entry.settled.then((outcome) => {
        if (outcome === 'loaded') texture.version = entry.base.version
      }), 'texture upload')
    }
    return { texture, settled: entry.settled }
  }

  /**
   * Requests every uri ahead of time, each resolved through the registered
   * scene catalog. Resolves once all of them settled, failures included —
   * a failure still only warns once, the same as a component's request.
   */
  async preload(uris: string[]): Promise<void> {
    await Promise.all(uris.map((uri) => this.request(this.resolveAsset(uri)).settled))
  }

  /**
   * Assets Ready: resolves the first time `pending` is 0 after the call —
   * at once when nothing is pending, otherwise once every URL requested
   * before or while waiting has settled. Never rejects. Resolves after the
   * `settled` continuations consumers chained before the call, so a host
   * that does `await game.assets.ready()` then `game.start()` renders its
   * first frame with the textures in place.
   */
  async ready(): Promise<void> {
    while (this.pendingCount > 0) {
      const inFlight = [...this.entries.values()].filter((entry) => entry.outcome === null)
      await Promise.all(inFlight.map((entry) => entry.settled))
    }
  }

  /** Disposes every cached base exactly once and forgets everything; called by `Game.dispose()`. */
  dispose(): void {
    for (const entry of this.entries.values()) entry.base.dispose()
    this.entries.clear()
    this.pendingCount = 0
    this.loadedCount = 0
    this.failedCount = 0
  }

  private request(url: string): CacheEntry {
    const existing = this.entries.get(url)
    if (existing) return existing
    const base = new THREE.Texture()
    base.colorSpace = THREE.SRGBColorSpace
    const entry: CacheEntry = { base, outcome: null, settled: Promise.resolve('failed') }
    // Registered and counted before the backend runs, so a backend that
    // throws synchronously still settles this very entry.
    this.entries.set(url, entry)
    this.pendingCount += 1
    entry.settled = this.load(url, entry)
    return entry
  }

  private async load(url: string, entry: CacheEntry): Promise<TextureOutcome> {
    const attempt = await this.attempt(url)
    // A dispose() in flight already forgot this entry and disposed its base:
    // nothing to write, warn about or count. Only the settlement is still
    // owed, so a consumer awaiting it never hangs; it reports what the
    // backend did.
    if (this.entries.get(url) !== entry) return attempt.outcome
    if (attempt.outcome === 'loaded') {
      // The image lands on the base's Source, which every clone shares.
      entry.base.image = attempt.texture.image
      entry.base.needsUpdate = true
      this.loadedCount += 1
    } else {
      console.warn(`[waica] assets: failed to load "${url}"`, attempt.error)
      this.failedCount += 1
    }
    entry.outcome = attempt.outcome
    this.pendingCount -= 1
    return attempt.outcome
  }

  /** One backend load as an outcome, never a rejection — a backend that throws synchronously included. */
  private async attempt(url: string): Promise<LoadAttempt> {
    try {
      return { outcome: 'loaded', texture: await this.backend.load(url) }
    } catch (error: unknown) {
      return { outcome: 'failed', error }
    }
  }
}
