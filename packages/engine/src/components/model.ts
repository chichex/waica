import * as THREE from 'three/webgpu'
import type { ModelHandle } from '../assets/model-cache.js'
import { Component, type ComponentSpace, type ParamSpec } from '../component.js'
import { reportRejection } from '../report-rejection.js'

export type ModelShape = 'box' | 'sphere' | 'plane'

const SHAPES: readonly ModelShape[] = ['box', 'sphere', 'plane']

/** A primitive Model's mesh and the geometry and material this Model created for it (and so disposes). */
interface Primitive {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardNodeMaterial>
}

/** One unit of the shape: a box of side 1, a sphere of diameter 1, a plane of side 1 lying flat on the ground (normal up). */
function primitiveGeometry(shape: ModelShape): THREE.BufferGeometry {
  switch (shape) {
    case 'sphere':
      return new THREE.SphereGeometry(0.5, 32, 16)
    case 'plane':
      return new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
    case 'box':
      return new THREE.BoxGeometry(1, 1, 1)
  }
}

/**
 * A 3D thing an entity draws (3D scenes, ADR 0027): a glTF/glb from `src`
 * (a `waica:` uri or a project path, loaded once through `game.assets`) or a
 * primitive `shape` of a `color` and a uniform `size`. With both, `src` wins.
 * Its root hangs under the entity's node, so the entity's position, rotation
 * and scale place it; the glTF keeps the materials it ships with, a
 * primitive has a standard (lit) node material. `color` and `size` follow the
 * inspector live; a new `src` or `shape` rebuilds the content. Destroying it
 * removes the root and disposes only what it created — never the cached glTF.
 * In a 2D scene it creates nothing (`validate_project` reports it).
 */
export class Model extends Component {
  static override componentName = 'Model'
  static override space: ComponentSpace = '3d'
  static override params = {
    src: { label: 'Model file', kind: 'model' },
    shape: { label: 'Shape', options: [...SHAPES] },
    color: { label: 'Color', kind: 'color' },
    size: { label: 'Size', min: 0.01, step: 0.1 },
    castShadows: { label: 'Cast shadows' },
    receiveShadows: { label: 'Receive shadows' },
  } satisfies Record<string, ParamSpec>
  static override transient = ['root', 'handle']

  /** What this Model draws, under the entity's node; null until it is ready. The Pointer ray-casts against it. */
  root: THREE.Group | null = null
  /**
   * The handle of the glTF it draws (issue #166 CA-6): `handle.root` is the
   * child of `root`, `handle.animations` its clips once settled — what an
   * Animator beside it plays. Null for a primitive, in a 2D scene and before
   * the component is ready; replaced on every rebuild.
   */
  handle: ModelHandle | null = null

  private _src = ''
  private _shape: ModelShape = 'box'
  private _color = 0xffffff
  private _size = 1
  private _castShadows = true
  private _receiveShadows = true
  private _primitive: Primitive | null = null

  /** A `waica:` uri or project path to a `.glb` / `.gltf`; empty draws the primitive `shape`. */
  get src(): string {
    return this._src
  }
  set src(value: string) {
    this._src = value
    this.rebuild()
  }

  get shape(): ModelShape {
    return this._shape
  }
  set shape(value: ModelShape) {
    this._shape = SHAPES.includes(value) ? value : 'box'
    this.rebuild()
  }

  /** `0xrrggbb` of a primitive. */
  get color(): number {
    return this._color
  }
  set color(value: number) {
    this._color = value
    this._primitive?.mesh.material.color.setHex(value)
  }

  /** Uniform scale of a primitive: the box side, sphere diameter or plane side in world units. */
  get size(): number {
    return this._size
  }
  set size(value: number) {
    this._size = value
    this._primitive?.mesh.scale.setScalar(value)
  }

  /** Whether this Model's meshes cast shadows; only false opts out. */
  get castShadows(): boolean {
    return this._castShadows
  }
  set castShadows(value: boolean) {
    this._castShadows = value !== false
    this.applyShadowFlags()
  }

  /** Whether this Model's meshes receive shadows; only false opts out. */
  get receiveShadows(): boolean {
    return this._receiveShadows
  }
  set receiveShadows(value: boolean) {
    this._receiveShadows = value !== false
    this.applyShadowFlags()
  }

  override onReady(): void {
    // Draws only in a 3D scene, like Sun and PointLight: 2.5D is a later block, and a lit-less mesh would come out black.
    if (this.game.space !== '3d') return
    this.root = new THREE.Group()
    this.root.name = 'waica:model'
    this.entity.node.add(this.root)
    this.build()
  }

  override onDestroy(): void {
    this.clear()
    this.root?.removeFromParent()
  }

  private build(): void {
    if (!this.root) return
    if (this._src) {
      const handle = this.game.assets.model(this._src)
      this.handle = handle
      this.root.add(handle.root)
      // A cache hit inserts its clone one microtask before settled reactions;
      // apply on insertion so Assets Ready already exposes the latest flags.
      const applyFlags = (): void => {
        if (this.handle === handle) this.applyShadowFlags()
      }
      handle.root.addEventListener('childadded', applyFlags)
      reportRejection(
        handle.settled.finally(() => {
          handle.root.removeEventListener('childadded', applyFlags)
        }),
        'model shadows settle',
      )
    } else {
      this.buildPrimitive(this.root)
    }
  }

  private buildPrimitive(root: THREE.Group): void {
    const material = new THREE.MeshStandardNodeMaterial({ color: this._color })
    const mesh = new THREE.Mesh(primitiveGeometry(this._shape), material)
    mesh.scale.setScalar(this._size)
    mesh.castShadow = this.castShadows
    mesh.receiveShadow = this.receiveShadows
    root.add(mesh)
    this._primitive = { mesh }
  }

  private rebuild(): void {
    if (!this.root) return
    this.clear()
    this.build()
  }

  /** Participation belongs to this Model's meshes, never their shared glTF resources. */
  private applyShadowFlags(): void {
    this.root?.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.castShadow = this._castShadows
      object.receiveShadow = this._receiveShadows
    })
  }

  /** Empties the root and disposes the primitive this Model created; a glTF's clone only leaves the graph. */
  private clear(): void {
    this.root?.clear()
    this.handle = null
    if (!this._primitive) return
    this._primitive.mesh.geometry.dispose()
    this._primitive.mesh.material.dispose()
    this._primitive = null
  }
}
