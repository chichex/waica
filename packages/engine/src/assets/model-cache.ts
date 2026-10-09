import * as THREE from 'three/webgpu'
import { clone as cloneWithSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import type { LoadedModel, ModelBackend } from './model-backend.js'

export type ModelOutcome = 'loaded' | 'failed'

/**
 * What a consumer gets from `game.assets.model(url)`: a root that is empty
 * until the glTF settles and then holds the consumer's own clone of it, the
 * file's animation clips (empty until then, and for a failed load), and when
 * the file settled. The cached glTF itself is never handed out.
 */
export interface ModelHandle {
  readonly root: THREE.Group
  readonly animations: readonly THREE.AnimationClip[]
  readonly settled: Promise<ModelOutcome>
}

interface ModelEntry {
  /** The one parsed glTF per URL; consumers only ever get clones of its scene. */
  base: LoadedModel | null
  outcome: ModelOutcome | null
  settled: Promise<ModelOutcome>
}

/** The cache's counters, summed into `game.assets.status` beside the textures'. */
export interface ModelCounts {
  pending: number
  loaded: number
  failed: number
}

type LoadAttempt = { outcome: 'loaded'; model: LoadedModel } | { outcome: 'failed'; error: unknown }

type SceneMesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>

function isMesh(object: THREE.Object3D): object is SceneMesh {
  return object instanceof THREE.Mesh
}

/** The textures a material references, for disposal. */
function texturesOf(material: THREE.Material): THREE.Texture[] {
  const values: unknown[] = Object.values(material)
  return values.filter((value): value is THREE.Texture => value instanceof THREE.Texture)
}

/** Disposes the geometry, materials and textures a glTF scene owns. */
function disposeScene(scene: THREE.Object3D): void {
  scene.traverse((object) => {
    if (!isMesh(object)) return
    object.geometry.dispose()
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      for (const texture of texturesOf(material)) texture.dispose()
      material.dispose()
    }
  })
}

/**
 * The model half of `game.assets` (ADR 0019): keep-all for the Game's whole
 * life, keyed by the URL as received, one backend load and one parsed glTF
 * per URL, counted like the texture cache so Assets Ready waits for it. A
 * failed file is recorded and warned about once, never retried.
 */
export class ModelCache {
  private readonly entries = new Map<string, ModelEntry>()
  private pendingCount = 0
  private loadedCount = 0
  private failedCount = 0

  constructor(private readonly backend: ModelBackend) {}

  get counts(): ModelCounts {
    return { pending: this.pendingCount, loaded: this.loadedCount, failed: this.failedCount }
  }

  /** The consumer entry: requests `url` and returns a handle whose root fills with a clone once the file settles. */
  handle(url: string): ModelHandle {
    const entry = this.request(url)
    const root = new THREE.Group()
    const animations: THREE.AnimationClip[] = []
    const settled = entry.settled.then((outcome) => {
      const model = entry.base
      if (outcome === 'loaded' && model && this.entries.get(url) === entry) {
        root.add(cloneWithSkeleton(model.scene))
        animations.push(...model.animations)
      }
      return outcome
    })
    return { root, animations, settled }
  }

  /** Requests `url` ahead of time; resolves with its outcome. */
  preload(url: string): Promise<ModelOutcome> {
    return this.request(url).settled
  }

  /** The settlements of every file that has not settled yet, for Assets Ready. */
  inFlight(): Promise<ModelOutcome>[] {
    return [...this.entries.values()].filter((entry) => entry.outcome === null).map((entry) => entry.settled)
  }

  /** Disposes every cached glTF exactly once and forgets everything. */
  dispose(): void {
    for (const entry of this.entries.values()) if (entry.base) disposeScene(entry.base.scene)
    this.entries.clear()
    this.pendingCount = 0
    this.loadedCount = 0
    this.failedCount = 0
  }

  private request(url: string): ModelEntry {
    const existing = this.entries.get(url)
    if (existing) return existing
    const entry: ModelEntry = { base: null, outcome: null, settled: Promise.resolve('failed') }
    // Registered and counted before the backend runs, so a backend that
    // throws synchronously still settles this very entry.
    this.entries.set(url, entry)
    this.pendingCount += 1
    entry.settled = this.load(url, entry)
    return entry
  }

  private async load(url: string, entry: ModelEntry): Promise<ModelOutcome> {
    const attempt = await this.attempt(url)
    // A dispose() in flight already forgot this entry: only the settlement is still owed.
    if (this.entries.get(url) !== entry) {
      if (attempt.outcome === 'loaded') disposeScene(attempt.model.scene)
      return attempt.outcome
    }
    if (attempt.outcome === 'loaded') {
      entry.base = attempt.model
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
      return { outcome: 'loaded', model: await this.backend.load(url) }
    } catch (error: unknown) {
      return { outcome: 'failed', error }
    }
  }
}
