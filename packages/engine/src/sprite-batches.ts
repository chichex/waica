import * as THREE from 'three'
import type { TextureOutcome } from './assets/asset-loader.js'
import type { Game } from './game.js'
import {
  SpriteBatch,
  spriteBatchKeyId,
  spriteGeometry,
  type SpriteBatchInstance,
  type SpriteBatchKey,
  type SpriteBatchShape,
  type SpriteBatchTextures,
} from './sprite-batch.js'
import { TransparentDrawCollector, type FrameDrawable } from './sprite-draw-collector.js'
import { compareTransparentDraws, forEachSpriteRun, type SpriteRunVisitor } from './sprite-runs.js'

/** Where an instance reads its map's UV transform: an AnimatedSprite's sheet clone. */
export interface SpriteUvSource {
  readonly offset: THREE.Vector2
  readonly repeat: THREE.Vector2
}

export type SpriteAnchor = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>

/** Where an instance sits: its key, that key's batch and its slot there. */
export interface SpriteBatchSeat {
  key: SpriteBatchKey
  batch: SpriteBatch
  slot: number
}

/**
 * One sprite inside a Sprite Batch. Its `anchor` is a hidden mesh placed
 * exactly where the sprite's own mesh would be — same parent, transform,
 * shape geometry and creation order — so draw order, y-sort and the world
 * matrix come out as before; the anchor itself is never drawn.
 */
export class SpriteInstance implements SpriteBatchInstance {
  /** Linear RGB tint, what the per-sprite path writes into its material color. */
  readonly color = new THREE.Color(1, 1, 1)
  /** Identity until an AnimatedSprite points it at its current sheet's clone. */
  uvSource: SpriteUvSource = { offset: new THREE.Vector2(0, 0), repeat: new THREE.Vector2(1, 1) }
  readonly modelView = new THREE.Matrix4()
  /**
   * For an AnimatedSprite: the sheet its key was last chosen for and whether
   * that sheet had failed, so a frame on the same sheet skips the move.
   */
  shownSheet = -1
  shownSheetFailed = false

  constructor(
    readonly anchor: SpriteAnchor,
    private readonly owner: SpriteBatches,
    public seat: SpriteBatchSeat,
  ) {}

  get key(): SpriteBatchKey {
    return this.seat.key
  }

  get uvRepeat(): THREE.Vector2 {
    return this.uvSource.repeat
  }

  get uvOffset(): THREE.Vector2 {
    return this.uvSource.offset
  }

  /** Moves to the batch of `key` (a shape change, a failed texture, another sheet); a no-op for the same key. */
  moveTo(key: SpriteBatchKey): void {
    this.owner.move(this, key)
  }

  /** Frees the slot and removes the anchor: the sprite was destroyed. */
  release(): void {
    this.owner.detach(this)
  }
}

type SpriteDrawable = FrameDrawable<SpriteBatch, SpriteInstance>

const anchors = new WeakMap<THREE.Object3D, SpriteInstance>()

/** The batch instance whose hidden anchor this is; undefined for an ordinary mesh. */
export function spriteInstanceOf(object: THREE.Object3D | undefined): SpriteInstance | undefined {
  return object ? anchors.get(object) : undefined
}

/**
 * A Game's Sprite Batches (ADR 0024): one SpriteBatch per key, the hidden
 * anchors of every batched sprite, and the per-frame pass that orders the
 * frame like three would, groups runs and draws each through one instanced
 * mesh. Scene-scoped: unload() releases everything (ADR 0011).
 */
export class SpriteBatches {
  /** Whether sprites readied from now on batch: the scene's `render.batch !== false`. */
  enabled = true
  private readonly batches = new Map<string, SpriteBatch>()
  private readonly geometries = new Map<SpriteBatchShape, THREE.BufferGeometry>()
  private readonly live = new Set<SpriteInstance>()
  private readonly root = new THREE.Group()
  /** Under root, one Group per non-zero group order, so a run keeps its sprites' Group renderOrder. */
  private readonly groups = new Map<number, THREE.Group>()
  private readonly collector: TransparentDrawCollector<SpriteBatch, SpriteInstance>
  // Per-frame state, reused every frame: the camera, the next renderOrder to
  // pin, and the non-sprite renderables whose renderOrder is pinned.
  private camera: THREE.Camera = new THREE.Camera()
  private nextOrder = 0
  private readonly pinned: THREE.Object3D[] = []
  private readonly pinnedOrders: number[] = []
  private pinnedScene: THREE.Scene | null = null
  private sceneAutoUpdate = true
  private readonly visitor: SpriteRunVisitor<SpriteBatch, SpriteDrawable> = {
    run: (batch, start, end) => this.drawRun(batch, start, end),
    other: (item) => this.pin(item.object),
  }

  constructor(private readonly textures: SpriteBatchTextures) {
    this.root.name = 'waica:sprite-batches'
    this.collector = new TransparentDrawCollector<SpriteBatch, SpriteInstance>(
      {
        instanceOf: (object) => {
          const instance = anchors.get(object)
          return instance && this.live.has(instance) ? instance : undefined
        },
        keyOf: (instance) => instance.seat.batch,
      },
      this.root,
    )
  }

  /** A new batched sprite in the key's batch; the caller parents its hidden anchor. */
  attach(key: SpriteBatchKey): SpriteInstance {
    const batch = this.batchFor(key)
    const anchor: SpriteAnchor = new THREE.Mesh(this.geometryFor(key.shape), batch.material)
    // Never drawn and never read for visibility: a batched sprite shows or
    // hides through its entity's node (README "Sprite Batches").
    anchor.visible = false
    const instance = new SpriteInstance(anchor, this, { key, batch, slot: batch.join() })
    anchors.set(anchor, instance)
    this.live.add(instance)
    return instance
  }

  /** When the key's texture settled; null for an untextured or bare entry. */
  settled(key: SpriteBatchKey): Promise<TextureOutcome> | null {
    return this.batchFor(key).settled
  }

  move(instance: SpriteInstance, key: SpriteBatchKey): void {
    if (spriteBatchKeyId(key) === spriteBatchKeyId(instance.key)) return
    instance.seat.batch.leave(instance.seat.slot)
    const batch = this.batchFor(key)
    instance.seat = { key, batch, slot: batch.join() }
    instance.anchor.material = batch.material
    instance.anchor.geometry = this.geometryFor(key.shape)
  }

  detach(instance: SpriteInstance): void {
    if (!this.live.delete(instance)) return
    instance.seat.batch.leave(instance.seat.slot)
    instance.anchor.removeFromParent()
    anchors.delete(instance.anchor)
  }

  /**
   * The frame pass, right before `renderer.render`: orders every transparent
   * renderable as three would, draws each run of same-key sprites through one
   * instanced mesh, and pins that order with renderOrder. Returns what undoes
   * the temporary renderOrder of the non-sprite renderables after the render.
   */
  prepareFrame(scene: THREE.Scene, camera: THREE.Camera): () => void {
    if (this.live.size === 0) {
      this.root.removeFromParent()
      return this.unpin
    }
    scene.updateMatrixWorld()
    camera.updateMatrixWorld()
    this.collector.collect(scene, camera)
    const drawables = this.collector.drawables.sort(compareTransparentDraws)
    this.camera = camera
    this.nextOrder = 0
    for (const batch of this.batches.values()) batch.beginFrame()
    forEachSpriteRun(drawables, this.visitor)
    for (const batch of this.batches.values()) batch.detachUndrawn()
    if (this.root.parent !== scene) scene.add(this.root)
    // Matrices are current: three's own update would recompute the same.
    this.pinnedScene = scene
    this.sceneAutoUpdate = scene.matrixWorldAutoUpdate
    scene.matrixWorldAutoUpdate = false
    return this.unpin
  }

  /** Runs `render` with this frame's runs drawn and the draw order pinned, then undoes the pin. */
  drawFrame(scene: THREE.Scene, camera: THREE.Camera, render: () => void): void {
    const restore = this.prepareFrame(scene, camera)
    try {
      render()
    } finally {
      restore()
    }
  }

  /** Releases every batch, geometry and run mesh; batching is on again for the next scene. */
  unload(): void {
    for (const instance of [...this.live]) instance.release()
    for (const batch of this.batches.values()) batch.dispose()
    this.batches.clear()
    for (const geometry of this.geometries.values()) geometry.dispose()
    this.geometries.clear()
    for (const group of this.groups.values()) group.removeFromParent()
    this.groups.clear()
    this.root.removeFromParent()
    this.enabled = true
  }

  private batchFor(key: SpriteBatchKey): SpriteBatch {
    const id = spriteBatchKeyId(key)
    const existing = this.batches.get(id)
    if (existing) return existing
    const created = new SpriteBatch(key, this.textures, this.geometryFor(key.shape))
    this.batches.set(id, created)
    return created
  }

  private geometryFor(shape: SpriteBatchShape): THREE.BufferGeometry {
    const existing = this.geometries.get(shape)
    if (existing) return existing
    const created = spriteGeometry(shape)
    this.geometries.set(shape, created)
    return created
  }

  /** Draws the frame's run `start`..`end` of `batch` through its next pooled run mesh, in its Group order. */
  private drawRun(batch: SpriteBatch, start: number, end: number): void {
    const drawables = this.collector.drawables
    const run = batch.nextRun(end - start)
    for (let index = start; index < end; index += 1) run.write(index - start, this.placed(drawables[index]?.instance))
    run.commit(end - start)
    run.mesh.renderOrder = this.nextOrder
    this.nextOrder += 1
    const group = this.groupFor(drawables[start]?.groupOrder ?? 0)
    if (run.mesh.parent !== group) group.add(run.mesh)
  }

  /** Pins a non-sprite renderable's renderOrder to its place in the frame, until unpin. */
  private pin(object: THREE.Object3D): void {
    this.pinned.push(object)
    this.pinnedOrders.push(object.renderOrder)
    object.renderOrder = this.nextOrder
    this.nextOrder += 1
  }

  /** After the render: every pinned renderOrder back, and the scene's own matrix updates. */
  private readonly unpin = (): void => {
    for (const [index, object] of this.pinned.entries()) object.renderOrder = this.pinnedOrders[index] ?? object.renderOrder
    this.pinned.length = 0
    this.pinnedOrders.length = 0
    if (this.pinnedScene) this.pinnedScene.matrixWorldAutoUpdate = this.sceneAutoUpdate
    this.pinnedScene = null
  }

  /** The Group a run of `groupOrder` hangs from: three reads its renderOrder as the run's group order. */
  private groupFor(groupOrder: number): THREE.Object3D {
    if (groupOrder === 0) return this.root
    const existing = this.groups.get(groupOrder)
    if (existing) return existing
    const group = new THREE.Group()
    group.renderOrder = groupOrder
    this.root.add(group)
    this.groups.set(groupOrder, group)
    return group
  }

  /** The instance with its view × world computed exactly as three computes `modelViewMatrix`. */
  private placed(instance: SpriteInstance | null | undefined): SpriteInstance {
    if (!instance) throw new Error('a Sprite Batch run holds only sprites')
    instance.modelView.multiplyMatrices(this.camera.matrixWorldInverse, instance.anchor.matrixWorld)
    return instance
  }
}

const registry = new WeakMap<Game, SpriteBatches>()

/** Internal: the Game creates its batches here at construction, findable by its sprites. */
export function createSpriteBatches(game: Game, textures: SpriteBatchTextures): SpriteBatches {
  const batches = new SpriteBatches(textures)
  registry.set(game, batches)
  return batches
}

/** A Game's Sprite Batches; undefined for anything that is not a constructed Game (a test stub). */
export function spriteBatchesOf(game: Game): SpriteBatches | undefined {
  return registry.get(game)
}
