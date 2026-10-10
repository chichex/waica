import * as THREE from 'three/webgpu'
import { Component, type ComponentSpace, type ParamSpec } from '../component.js'

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
  } satisfies Record<string, ParamSpec>
  static override transient = ['root']

  /** What this Model draws, under the entity's node; null until it is ready. The Pointer ray-casts against it. */
  root: THREE.Group | null = null

  private _src = ''
  private _shape: ModelShape = 'box'
  private _color = 0xffffff
  private _size = 1
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
    if (this._src) this.root.add(this.game.assets.model(this._src).root)
    else this.buildPrimitive(this.root)
  }

  private buildPrimitive(root: THREE.Group): void {
    const material = new THREE.MeshStandardNodeMaterial({ color: this._color })
    const mesh = new THREE.Mesh(primitiveGeometry(this._shape), material)
    mesh.scale.setScalar(this._size)
    root.add(mesh)
    this._primitive = { mesh }
  }

  private rebuild(): void {
    if (!this.root) return
    this.clear()
    this.build()
  }

  /** Empties the root and disposes the primitive this Model created; a glTF's clone only leaves the graph. */
  private clear(): void {
    this.root?.clear()
    if (!this._primitive) return
    this._primitive.mesh.geometry.dispose()
    this._primitive.mesh.material.dispose()
    this._primitive = null
  }
}
