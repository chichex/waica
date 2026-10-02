import * as THREE from 'three'
import type { TextureOutcome } from './assets/asset-loader.js'

export type SpriteBatchShape = 'rectangle' | 'circle'

/**
 * What decides whether two sprites can share one draw: the art, its
 * filtering and the quad's shape. `texture` null is the untextured entry of
 * a shape; '' is an AnimatedSprite sheet with no url yet (a bare texture).
 */
export interface SpriteBatchKey {
  texture: string | null
  pixelArt: boolean
  shape: SpriteBatchShape
}

/** The first capacity of a batch's instance buffers; it doubles when full. */
export const INITIAL_SPRITE_BATCH_CAPACITY = 16

/** Where a batch gets its key's texture: `game.assets` (ADR 0019). */
export interface SpriteBatchTextures {
  texture(url: string): { texture: THREE.Texture; settled: Promise<TextureOutcome> }
}

/** The key's canonical string: equal keys share one batch. */
export function spriteBatchKeyId(key: SpriteBatchKey): string {
  const texture = key.texture === null ? 'none' : `url:${key.texture}`
  return `${texture}|${key.texture === null ? false : key.pixelArt}|${key.shape}`
}

/** The unit quad every sprite of a shape draws, exactly as the per-sprite path builds it. */
export function spriteGeometry(shape: SpriteBatchShape): THREE.BufferGeometry {
  return shape === 'circle' ? new THREE.CircleGeometry(0.5, 32) : new THREE.PlaneGeometry(1, 1)
}

/** The per-instance UV transform a run carries: repeat (x, y) and offset (z, w). */
const INSTANCE_UV = 'instanceUv'

/**
 * Shader hook shared by every batch material. The instance matrix already
 * holds view × world (three's own `modelViewMatrix` for that sprite, computed
 * the same way on the CPU), so the vertex shader skips `modelViewMatrix`; the
 * map's UV transform comes from the instance instead of `mapTransform`.
 */
function useInstanceTransforms(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\nattribute vec4 ${INSTANCE_UV};`)
    .replace(
      '#include <uv_vertex>',
      [
        '#ifdef USE_MAP',
        `  vMapUv = ( mat3( ${INSTANCE_UV}.x, 0.0, 0.0, 0.0, ${INSTANCE_UV}.y, 0.0, ${INSTANCE_UV}.z, ${INSTANCE_UV}.w, 1.0 ) * vec3( MAP_UV, 1 ) ).xy;`,
        '#endif',
      ].join('\n'),
    )
    .replace(
      '#include <project_vertex>',
      ['vec4 mvPosition = instanceMatrix * vec4( transformed, 1.0 );', 'gl_Position = projectionMatrix * mvPosition;'].join('\n'),
    )
}

function createMaterial(key: SpriteBatchKey, textures: SpriteBatchTextures): {
  material: THREE.MeshBasicMaterial
  settled: Promise<TextureOutcome> | null
} {
  // Double-sided: a flipped sprite mirrors through a negative x scale in its
  // matrix, exactly like its own mesh; per instance there is no winding flip.
  const material = new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide })
  material.forceSinglePass = true
  material.onBeforeCompile = useInstanceTransforms
  if (key.texture === null) return { material, settled: null }
  const { texture, settled } = key.texture
    ? textures.texture(key.texture)
    : { texture: new THREE.Texture(), settled: null }
  // One clone per key holds the filters, so pixelArt never leaks across keys.
  if (key.pixelArt) {
    texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.NearestFilter
  }
  material.map = texture
  return { material, settled }
}

/** One draw of a run: an instanced quad sized to the batch's capacity. */
function createRunMesh(
  base: THREE.BufferGeometry,
  material: THREE.MeshBasicMaterial,
  capacity: number,
): THREE.InstancedMesh {
  // Its own copy of the quad's attributes, so disposing one run never frees
  // buffers another geometry still binds.
  const geometry = base.clone()
  const uv = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4)
  geometry.setAttribute(INSTANCE_UV, uv.setUsage(THREE.DynamicDrawUsage))
  const mesh = new THREE.InstancedMesh(geometry, material, capacity)
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3)
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)
  // Drawn in an explicit renderOrder; its instances are already in view space.
  mesh.frustumCulled = false
  mesh.matrixAutoUpdate = false
  mesh.boundingSphere = new THREE.Sphere()
  return mesh
}

/** Marks the first `count` items of an instance attribute for upload. */
function upload(attribute: THREE.InstancedBufferAttribute, count: number): void {
  attribute.clearUpdateRanges()
  attribute.addUpdateRange(0, count * attribute.itemSize)
  attribute.needsUpdate = true
}

/** What a run writes per sprite. */
export interface SpriteBatchInstance {
  /** View × world of the sprite's quad. */
  readonly modelView: THREE.Matrix4
  /** Linear RGB tint. */
  readonly color: THREE.Color
  /** The map's repeat and offset (identity for an untransformed map). */
  readonly uvRepeat: THREE.Vector2
  readonly uvOffset: THREE.Vector2
}

/**
 * A Sprite Batch's resources for one key (CONTEXT.md, ADR 0024): the shared
 * material, a slot per member, and the instanced meshes its runs draw
 * through. Instance buffers start at 16 slots, double when full, reuse freed
 * slots and never shrink during the scene (ADR 0011: released at unload).
 */
export class SpriteBatch {
  readonly material: THREE.MeshBasicMaterial
  /** When the key's texture settled; null for untextured and bare entries. */
  readonly settled: Promise<TextureOutcome> | null
  private readonly slots: boolean[] = []
  private readonly freeSlots: number[] = []
  private _capacity = INITIAL_SPRITE_BATCH_CAPACITY
  private readonly runMeshes: THREE.InstancedMesh[] = []

  constructor(
    key: SpriteBatchKey,
    textures: SpriteBatchTextures,
    private readonly geometry: THREE.BufferGeometry,
  ) {
    const { material, settled } = createMaterial(key, textures)
    this.material = material
    this.settled = settled
  }

  /** Slots the instance buffers hold; a run never draws more. */
  get capacity(): number {
    return this._capacity
  }

  /** Live members. */
  get size(): number {
    return this.slots.length - this.freeSlots.length
  }

  /** Takes a freed slot first, growing the capacity geometrically only when none is left. */
  join(): number {
    const reused = this.freeSlots.pop()
    if (reused !== undefined) {
      this.slots[reused] = true
      return reused
    }
    this.slots.push(true)
    while (this.slots.length > this._capacity) this._capacity *= 2
    return this.slots.length - 1
  }

  /** Frees a member's slot for the next join, the same step. */
  leave(slot: number): void {
    if (this.slots[slot] !== true) return
    this.slots[slot] = false
    this.freeSlots.push(slot)
  }

  /**
   * The mesh drawing this frame's `runIndex`-th run of the key, written with
   * `instances` in draw order. Meshes are pooled across frames and rebuilt
   * only when the capacity grew past theirs.
   */
  drawRun(runIndex: number, instances: readonly SpriteBatchInstance[]): THREE.InstancedMesh {
    const mesh = this.runMesh(runIndex)
    const matrices = mesh.instanceMatrix
    const colors = mesh.instanceColor ?? matrices
    const uvs = mesh.geometry.getAttribute(INSTANCE_UV) as THREE.InstancedBufferAttribute
    for (const [index, instance] of instances.entries()) {
      instance.modelView.toArray(matrices.array, index * 16)
      instance.color.toArray(colors.array, index * 3)
      uvs.array[index * 4] = instance.uvRepeat.x
      uvs.array[index * 4 + 1] = instance.uvRepeat.y
      uvs.array[index * 4 + 2] = instance.uvOffset.x
      uvs.array[index * 4 + 3] = instance.uvOffset.y
    }
    mesh.count = instances.length
    for (const attribute of [matrices, colors, uvs]) upload(attribute, instances.length)
    return mesh
  }

  /** Every pooled run mesh, drawn this frame or not. */
  get meshes(): readonly THREE.InstancedMesh[] {
    return this.runMeshes
  }

  /** Releases every GPU-side object this batch created; its texture clone included. */
  dispose(): void {
    for (const mesh of this.runMeshes) this.disposeRunMesh(mesh)
    this.runMeshes.length = 0
    this.material.map?.dispose()
    this.material.dispose()
  }

  private runMesh(runIndex: number): THREE.InstancedMesh {
    const pooled = this.runMeshes[runIndex]
    if (pooled && pooled.instanceMatrix.count >= this._capacity) return pooled
    const mesh = createRunMesh(this.geometry, this.material, this._capacity)
    if (pooled) {
      pooled.parent?.add(mesh)
      this.disposeRunMesh(pooled)
    }
    this.runMeshes[runIndex] = mesh
    return mesh
  }

  private disposeRunMesh(mesh: THREE.InstancedMesh): void {
    mesh.removeFromParent()
    mesh.geometry.dispose()
    mesh.dispose()
  }
}
