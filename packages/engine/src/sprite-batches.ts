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
import { buildSpriteRuns, type DrawStep, type Drawable } from './sprite-runs.js'

/** Where an instance reads its map's UV transform: an AnimatedSprite's sheet clone. */
export interface SpriteUvSource {
  readonly offset: THREE.Vector2
  readonly repeat: THREE.Vector2
}

export type SpriteAnchor = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>

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

  constructor(
    readonly anchor: SpriteAnchor,
    private readonly owner: SpriteBatches,
    public key: SpriteBatchKey,
    public batch: SpriteBatch,
    public slot: number,
  ) {}

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

interface FrameDrawable extends Drawable<SpriteBatch> {
  object: THREE.Object3D
  instance: SpriteInstance | null
}

type FrameStep = DrawStep<SpriteBatch, FrameDrawable>

const anchors = new WeakMap<THREE.Object3D, SpriteInstance>()

/** The batch instance whose hidden anchor this is; undefined for an ordinary mesh. */
export function spriteInstanceOf(object: THREE.Object3D | undefined): SpriteInstance | undefined {
  return object ? anchors.get(object) : undefined
}

function isRenderable(object: THREE.Object3D): object is THREE.Mesh | THREE.Line | THREE.Points | THREE.Sprite {
  const flags = object as Partial<THREE.Mesh & THREE.Line & THREE.Points & THREE.Sprite>
  return flags.isMesh === true || flags.isLine === true || flags.isPoints === true || flags.isSprite === true
}

/** Whether three files any of the object's materials in its transparent list. */
function drawsTransparent(object: THREE.Mesh | THREE.Line | THREE.Points | THREE.Sprite): boolean {
  const list = Array.isArray(object.material) ? object.material : [object.material]
  return list.some((material) => {
    const transmission = (material as { transmission?: number }).transmission ?? 0
    return material.visible && material.transparent && transmission <= 0
  })
}

/** The clip-space z three sorts the object by (WebGLRenderer's projectObject). */
function sortDepth(object: THREE.Object3D, projScreen: THREE.Matrix4, point: THREE.Vector4): number {
  if ((object as Partial<THREE.Sprite>).isSprite === true) {
    return point.setFromMatrixPosition(object.matrixWorld).applyMatrix4(projScreen).z
  }
  const own = object as { boundingSphere?: THREE.Sphere | null; computeBoundingSphere?: () => void }
  let center: THREE.Vector3
  if (own.boundingSphere !== undefined) {
    if (own.boundingSphere === null) own.computeBoundingSphere?.()
    center = own.boundingSphere?.center ?? new THREE.Vector3()
  } else {
    const geometry = (object as THREE.Mesh).geometry
    if (geometry.boundingSphere === null) geometry.computeBoundingSphere()
    center = geometry.boundingSphere?.center ?? new THREE.Vector3()
  }
  // Vector4.copy of a Vector3, as three does it: w becomes 1.
  return point.set(center.x, center.y, center.z, 1).applyMatrix4(object.matrixWorld).applyMatrix4(projScreen).z
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
  private readonly point = new THREE.Vector4()
  private readonly projScreen = new THREE.Matrix4()

  constructor(private readonly textures: SpriteBatchTextures) {
    this.root.name = 'waica:sprite-batches'
  }

  /** A new batched sprite in the key's batch; the caller parents its hidden anchor. */
  attach(key: SpriteBatchKey): SpriteInstance {
    const batch = this.batchFor(key)
    const anchor: SpriteAnchor = new THREE.Mesh(this.geometryFor(key.shape), batch.material)
    anchor.visible = false
    const instance = new SpriteInstance(anchor, this, key, batch, batch.join())
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
    instance.batch.leave(instance.slot)
    const batch = this.batchFor(key)
    instance.key = key
    instance.batch = batch
    instance.slot = batch.join()
    instance.anchor.material = batch.material
    instance.anchor.geometry = this.geometryFor(key.shape)
  }

  detach(instance: SpriteInstance): void {
    if (!this.live.delete(instance)) return
    instance.batch.leave(instance.slot)
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
      return () => {}
    }
    scene.updateMatrixWorld()
    camera.updateMatrixWorld()
    this.projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    const drawables: FrameDrawable[] = []
    this.collect(scene, camera, 0, drawables)
    const restore = this.draw(buildSpriteRuns(drawables), camera)
    if (this.root.parent !== scene) scene.add(this.root)
    // Matrices are current: three's own update would recompute the same.
    const autoUpdate = scene.matrixWorldAutoUpdate
    scene.matrixWorldAutoUpdate = false
    return () => {
      scene.matrixWorldAutoUpdate = autoUpdate
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

  /** WebGLRenderer's projectObject walk: visibility, layers and Group render order. */
  private collect(object: THREE.Object3D, camera: THREE.Camera, groupOrder: number, out: FrameDrawable[]): void {
    if (object === this.root) return
    const instance = anchors.get(object)
    if (instance) {
      if (this.live.has(instance) && object.layers.test(camera.layers)) out.push(this.drawable(object, groupOrder, instance))
      return
    }
    if (!object.visible) return
    let order = groupOrder
    if (object.layers.test(camera.layers)) {
      if ((object as Partial<THREE.Group>).isGroup === true) order = object.renderOrder
      else if (isRenderable(object) && drawsTransparent(object)) out.push(this.drawable(object, groupOrder, null))
    }
    for (const child of object.children) this.collect(child, camera, order, out)
  }

  private drawable(object: THREE.Object3D, groupOrder: number, instance: SpriteInstance | null): FrameDrawable {
    return {
      key: instance ? instance.batch : null,
      groupOrder,
      renderOrder: object.renderOrder,
      z: sortDepth(object, this.projScreen, this.point),
      id: object.id,
      object,
      instance,
    }
  }

  private draw(steps: readonly FrameStep[], camera: THREE.Camera): () => void {
    const restores: Array<[THREE.Object3D, number]> = []
    const runsSoFar = new Map<SpriteBatch, number>()
    const drawn = new Set<THREE.InstancedMesh>()
    for (const [order, step] of steps.entries()) {
      if (step.kind === 'other') {
        restores.push([step.item.object, step.item.object.renderOrder])
        step.item.object.renderOrder = order
        continue
      }
      const runIndex = runsSoFar.get(step.key) ?? 0
      runsSoFar.set(step.key, runIndex + 1)
      const instances = step.items.map(({ instance }) => this.placed(instance, camera))
      const mesh = step.key.drawRun(runIndex, instances)
      mesh.renderOrder = order
      if (mesh.parent !== this.root) this.root.add(mesh)
      drawn.add(mesh)
    }
    for (const batch of this.batches.values()) {
      for (const mesh of batch.meshes) if (!drawn.has(mesh)) mesh.removeFromParent()
    }
    return () => {
      for (const [object, renderOrder] of restores) object.renderOrder = renderOrder
    }
  }

  /** The instance with its view × world computed exactly as three computes `modelViewMatrix`. */
  private placed(instance: SpriteInstance | null, camera: THREE.Camera): SpriteInstance {
    if (!instance) throw new Error('a Sprite Batch run holds only sprites')
    instance.modelView.multiplyMatrices(camera.matrixWorldInverse, instance.anchor.matrixWorld)
    return instance
  }
}

const registry = new WeakMap<Game, SpriteBatches>()

/** Internal: the Game wires its batches here at construction. */
export function registerSpriteBatches(game: Game, batches: SpriteBatches): void {
  registry.set(game, batches)
}

/** A Game's Sprite Batches; undefined for anything that is not a constructed Game (a test stub). */
export function spriteBatchesOf(game: Game): SpriteBatches | undefined {
  return registry.get(game)
}
