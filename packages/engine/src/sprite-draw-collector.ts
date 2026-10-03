import * as THREE from 'three/webgpu'
import type { Drawable } from './sprite-runs.js'

/** A frame drawable: what three sorts it by, the object, and the sprite instance it stands for (null otherwise). */
export interface FrameDrawable<K, I> extends Drawable<K> {
  object: THREE.Object3D
  instance: I | null
}

/** How the collector recognises a batched sprite's hidden anchor and its batch key. */
export interface CollectedSprites<K, I> {
  /** The live sprite instance this object anchors, or undefined for any other object. */
  instanceOf(object: THREE.Object3D): I | undefined
  keyOf(instance: I): K
}

type Renderable = THREE.Mesh | THREE.Line | THREE.Points | THREE.Sprite

function isRenderable(object: THREE.Object3D): object is Renderable {
  const flags = object as Partial<THREE.Mesh & THREE.Line & THREE.Points & THREE.Sprite>
  return flags.isMesh === true || flags.isLine === true || flags.isPoints === true || flags.isSprite === true
}

/** Whether three files any of the object's materials in its transparent list. */
function drawsTransparent(object: Renderable): boolean {
  const list = Array.isArray(object.material) ? object.material : [object.material]
  return list.some((material) => {
    const transmission = (material as { transmission?: number }).transmission ?? 0
    return material.visible && material.transparent && transmission <= 0
  })
}

/** The bounding-sphere center three sorts a mesh, line or points by: the object's own sphere if it has one. */
function sortCenter(object: THREE.Object3D): THREE.Vector3 {
  const own = object as { boundingSphere?: THREE.Sphere | null; computeBoundingSphere?: () => void }
  if (own.boundingSphere === undefined) {
    const geometry = (object as THREE.Mesh).geometry
    if (geometry.boundingSphere === null) geometry.computeBoundingSphere()
    return geometry.boundingSphere?.center ?? new THREE.Vector3()
  }
  if (own.boundingSphere === null) own.computeBoundingSphere?.()
  return own.boundingSphere?.center ?? new THREE.Vector3()
}

/**
 * One frame's transparent drawables, collected the way three's renderer
 * (`_projectObject`) walks the scene: visibility, camera layers, Group render
 * order, frustum culling, and the clip-space z it sorts by. Sprite anchors
 * are hidden yet collected when in view; `skip` (the batches' own run
 * meshes) is never walked. The drawables are pooled across frames.
 */
export class TransparentDrawCollector<K, I> {
  /** This frame's drawables, in walk order; the same array every frame. */
  readonly drawables: FrameDrawable<K, I>[] = []
  private readonly pool: FrameDrawable<K, I>[] = []
  private readonly projScreen = new THREE.Matrix4()
  private readonly frustum = new THREE.Frustum()
  private readonly point = new THREE.Vector4()
  private layers = new THREE.Layers()

  constructor(
    private readonly sprites: CollectedSprites<K, I>,
    private readonly skip: THREE.Object3D,
  ) {}

  /** Walks `scene` for `camera`, whose matrices must be current. */
  collect(scene: THREE.Object3D, camera: THREE.Camera): void {
    this.layers = camera.layers
    this.projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    this.frustum.setFromProjectionMatrix(this.projScreen, THREE.WebGLCoordinateSystem, camera.reversedDepth)
    this.drawables.length = 0
    this.visit(scene, 0)
  }

  private visit(object: THREE.Object3D, groupOrder: number): void {
    if (object === this.skip) return
    const instance = this.sprites.instanceOf(object)
    if (instance !== undefined) {
      if (object.layers.test(this.layers) && this.inView(object)) this.push(object, groupOrder, instance)
      return
    }
    if (!object.visible) return
    const order = this.visitOwn(object, groupOrder)
    for (const child of object.children) this.visit(child, order)
  }

  /** Files the object itself when three would draw it transparent; returns the group order for its children. */
  private visitOwn(object: THREE.Object3D, groupOrder: number): number {
    if (!object.layers.test(this.layers)) return groupOrder
    if ((object as Partial<THREE.Group>).isGroup === true) return object.renderOrder
    if (isRenderable(object) && drawsTransparent(object) && this.inView(object)) this.push(object, groupOrder, null)
    return groupOrder
  }

  /** three's per-object culling: `!frustumCulled || intersectsFrustum`. */
  private inView(object: THREE.Object3D): boolean {
    return !object.frustumCulled || object.intersectsFrustum(this.frustum) === true
  }

  private push(object: THREE.Object3D, groupOrder: number, instance: I | null): void {
    const index = this.drawables.length
    const drawable = this.pool[index] ?? { key: null, groupOrder: 0, renderOrder: 0, z: 0, id: 0, object, instance: null }
    this.pool[index] = drawable
    drawable.key = instance === null ? null : this.sprites.keyOf(instance)
    drawable.groupOrder = groupOrder
    drawable.renderOrder = object.renderOrder
    drawable.z = this.sortDepth(object)
    drawable.id = object.id
    drawable.object = object
    drawable.instance = instance
    this.drawables.push(drawable)
  }

  /** The clip-space z three sorts the object by. */
  private sortDepth(object: THREE.Object3D): number {
    if ((object as Partial<THREE.Sprite>).isSprite === true) {
      return this.point.setFromMatrixPosition(object.matrixWorld).applyMatrix4(this.projScreen).z
    }
    const center = sortCenter(object)
    // Vector4.copy of a Vector3, as three does it: w becomes 1.
    return this.point.set(center.x, center.y, center.z, 1).applyMatrix4(object.matrixWorld).applyMatrix4(this.projScreen).z
  }
}
