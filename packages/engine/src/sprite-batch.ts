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
 * One pooled draw of a run: an instanced quad and its three typed instance
 * attributes (view × world, tint, map UV transform), sized by the longest
 * run it has drawn — 16 instances at first, doubling when a longer run
 * needs it, never shrinking during the scene.
 */
export class SpriteRunMesh {
  readonly mesh: THREE.InstancedMesh
  private readonly colors: THREE.InstancedBufferAttribute
  private readonly uvs: THREE.InstancedBufferAttribute

  constructor(base: THREE.BufferGeometry, material: THREE.MeshBasicMaterial, capacity: number) {
    // Its own copy of the quad's attributes, so disposing one run never frees
    // buffers another geometry still binds.
    const geometry = base.clone()
    this.uvs = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute(INSTANCE_UV, this.uvs)
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.colors = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage)
    this.mesh.instanceColor = this.colors
    // Drawn in an explicit renderOrder; its instances are already in view space.
    this.mesh.frustumCulled = false
    this.mesh.matrixAutoUpdate = false
    this.mesh.boundingSphere = new THREE.Sphere()
  }

  get capacity(): number {
    return this.mesh.instanceMatrix.count
  }

  /** Writes the sprite drawn `index`-th in this run. */
  write(index: number, instance: SpriteBatchInstance): void {
    instance.modelView.toArray(this.mesh.instanceMatrix.array, index * 16)
    instance.color.toArray(this.colors.array, index * 3)
    const uv = this.uvs.array
    uv[index * 4] = instance.uvRepeat.x
    uv[index * 4 + 1] = instance.uvRepeat.y
    uv[index * 4 + 2] = instance.uvOffset.x
    uv[index * 4 + 3] = instance.uvOffset.y
  }

  /** Draws the first `count` written instances and uploads only those. */
  commit(count: number): void {
    this.mesh.count = count
    for (const attribute of [this.mesh.instanceMatrix, this.colors, this.uvs]) upload(attribute, count)
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    this.mesh.dispose()
  }
}

/**
 * A Sprite Batch's resources for one key (CONTEXT.md, ADR 0024): the shared
 * material, a slot per member, and the pooled run meshes its runs draw
 * through — one per run of the key in a frame, each sized by its own run, so
 * instance memory stays proportional to the sprites drawn. Released at
 * unload (ADR 0011).
 */
export class SpriteBatch {
  readonly material: THREE.MeshBasicMaterial
  /** When the key's texture settled; null for untextured and bare entries. */
  readonly settled: Promise<TextureOutcome> | null
  // A slot reserves room in the key's capacity; it is not a position in any
  // instance buffer, which a frame rewrites in draw order (CA-4 deviation).
  private readonly slots: boolean[] = []
  private readonly freeSlots: number[] = []
  private _capacity = INITIAL_SPRITE_BATCH_CAPACITY
  private readonly runs: SpriteRunMesh[] = []
  private runsDrawn = 0

  constructor(
    key: SpriteBatchKey,
    textures: SpriteBatchTextures,
    private readonly geometry: THREE.BufferGeometry,
  ) {
    const { material, settled } = createMaterial(key, textures)
    this.material = material
    this.settled = settled
  }

  /** The most members the key has held at once, rounded up to 16 × 2^n: no run is ever longer. */
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

  /** Starts a frame: no run of the key drawn yet. */
  beginFrame(): void {
    this.runsDrawn = 0
  }

  /**
   * The pooled mesh for the key's next run this frame, holding at least
   * `length` instances. A pooled mesh is rebuilt only when this run is longer
   * than any it drew before, doubling from its size (16 at first).
   */
  nextRun(length: number): SpriteRunMesh {
    const index = this.runsDrawn
    this.runsDrawn += 1
    const pooled = this.runs[index]
    if (pooled && pooled.capacity >= length) return pooled
    let capacity = pooled?.capacity ?? INITIAL_SPRITE_BATCH_CAPACITY
    while (capacity < length) capacity *= 2
    // Never past the key's reservation: a run cannot outnumber the members.
    const run = new SpriteRunMesh(this.geometry, this.material, Math.min(capacity, Math.max(this._capacity, length)))
    if (pooled) {
      pooled.mesh.parent?.add(run.mesh)
      pooled.dispose()
    }
    this.runs[index] = run
    return run
  }

  /** Takes the pooled meshes no run used this frame out of the scene. */
  detachUndrawn(): void {
    for (let index = this.runsDrawn; index < this.runs.length; index += 1) this.runs[index]?.mesh.removeFromParent()
  }

  /** Releases every GPU-side object this batch created; its texture clone included. */
  dispose(): void {
    for (const run of this.runs) run.dispose()
    this.runs.length = 0
    this.material.map?.dispose()
    this.material.dispose()
  }
}
