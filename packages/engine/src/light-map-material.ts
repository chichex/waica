import {
  abs,
  Break,
  ceil,
  clamp,
  cos,
  float,
  floor,
  Fn,
  If,
  int,
  ivec2,
  length,
  Loop,
  max,
  min,
  mix,
  positionWorld,
  select,
  sin,
  sign,
  texture,
  uniform,
  uv,
  vec2,
  vec4,
} from 'three/tsl'
import * as THREE from 'three/webgpu'
import { SOFT_SHADOW_RING, SOFT_SHADOW_SPREAD } from './light-field.js'

/** What one light-map mesh draws: its light, in logical units, with its look. */
export interface LightDraw {
  readonly position: THREE.Vector2
  /** color × intensity, the term the light adds at its centre. */
  readonly color: THREE.Vector3
  radius: number
  bands: number
  softness: number
  /** 1 casts shadows, 0 does not. */
  castShadows: number
}

const draws = new WeakMap<THREE.Object3D, LightDraw>()

/** Registers what a light-map mesh draws; the shared material reads it per object. */
export function setLightDraw(mesh: THREE.Object3D, draw: LightDraw): void {
  draws.set(mesh, draw)
}

function drawOf(object: THREE.Object3D | null): LightDraw | undefined {
  return object ? draws.get(object) : undefined
}

/** The light-map's per-frame inputs every light reads: the projection and the occluder grid. */
export interface LightMapUniforms {
  /** 1 for an isometric scene: render space is unprojected to logical space per texel. */
  readonly isometric: THREE.UniformNode<'float', number>
  /** originX, originY, cellSize and 1 when a grid exists (0 casts no shadow at all). */
  readonly grid: THREE.UniformNode<'vec4', THREE.Vector4>
  /** The grid's columns and rows. */
  readonly gridSize: THREE.UniformNode<'vec2', THREE.Vector2>
  /** One byte per cell, row 0 first: 255 solid, 0 open. */
  readonly occluders: THREE.TextureNode
}

/** The light-map's shared uniforms, with an empty occluder grid. */
export function createLightMapUniforms(empty: THREE.Texture): LightMapUniforms {
  return {
    isometric: uniform(0),
    grid: uniform(new THREE.Vector4(0, 0, 1, 0)),
    gridSize: uniform(new THREE.Vector2(1, 1)),
    occluders: texture(empty),
  }
}

type Vec2 = THREE.Node<'vec2'>
type Float = THREE.Node<'float'>

/** 1 when the grid cell holds a solid tile, 0 when it is open or outside the grid. */
function solidAtNode(uniforms: LightMapUniforms, cell: Vec2): Float {
  const size = uniforms.gridSize
  const inside = cell.x.greaterThanEqual(0).and(cell.y.greaterThanEqual(0))
    .and(cell.x.lessThan(size.x)).and(cell.y.lessThan(size.y))
  const clamped = clamp(cell, vec2(0, 0), size.sub(1))
  // load() follows the uniform's texture, so a rebuilt grid reaches the shader.
  const value = uniforms.occluders.load(ivec2(int(clamped.x), int(clamped.y))).r
  return select(inside, value, float(0))
}

/** light-field.ts `axisCrossing`: the first boundary's ray parameter and its growth per cell. */
function axisCrossingNode(start: Float, delta: Float, cell: Float): { next: Float; step: Float } {
  const flat = abs(delta).lessThan(1e-9)
  const step = select(flat, float(1e30), float(1).div(max(abs(delta), 1e-9)))
  const toBoundary = select(delta.greaterThan(0), cell.add(1).sub(start), start.sub(cell))
  return { next: select(flat, float(1e30), toBoundary.mul(step)), step }
}

/**
 * `segmentClear` of light-field.ts in TSL: walks the grid cells from the
 * texel's to the light's (Amanatides–Woo) and returns 0 at the first solid
 * one, never testing the texel's own cell — the lit face of a wall.
 */
function segmentClearNode(uniforms: LightMapUniforms): (from: Vec2, to: Vec2) => Float {
  const walk = Fn(([from, to]: [Vec2, Vec2]) => {
    const grid = uniforms.grid
    const a = from.sub(grid.xy).div(grid.z).toVar()
    const b = to.sub(grid.xy).div(grid.z).toVar()
    const cell = floor(a).toVar()
    const end = floor(b)
    const delta = b.sub(a).toVar()
    const x = axisCrossingNode(a.x, delta.x, cell.x)
    const y = axisCrossingNode(a.y, delta.y, cell.y)
    const nextX = x.next.toVar()
    const nextY = y.next.toVar()
    const cells = min(abs(end.x.sub(cell.x)).add(abs(end.y.sub(cell.y))), 4096)
    const clear = float(1).toVar()
    Loop({ start: int(0), end: int(cells), type: 'int', condition: '<' }, () => {
      If(nextX.lessThan(nextY), () => {
        cell.x.addAssign(sign(delta.x))
        nextX.addAssign(x.step)
      }).Else(() => {
        cell.y.addAssign(sign(delta.y))
        nextY.addAssign(y.step)
      })
      If(solidAtNode(uniforms, cell).greaterThan(0.5), () => {
        clear.assign(0)
        Break()
      })
    })
    return clear
  })
  return (from, to) => walk(from, to)
}

/** One light's per-object uniforms. */
interface LightUniforms {
  position: THREE.UniformNode<'vec2', THREE.Vector2>
  color: THREE.UniformNode<'vec3', THREE.Vector3>
  radius: THREE.UniformNode<'float', number>
  bands: THREE.UniformNode<'float', number>
  softness: THREE.UniformNode<'float', number>
  castShadows: THREE.UniformNode<'float', number>
}

/** One light's per-object uniforms, read from the mesh being drawn. */
function lightUniforms(): LightUniforms {
  return {
    position: uniform(new THREE.Vector2()).onObjectUpdate(({ object }) => drawOf(object)?.position),
    color: uniform(new THREE.Vector3()).onObjectUpdate(({ object }) => drawOf(object)?.color),
    radius: uniform(1).onObjectUpdate(({ object }) => drawOf(object)?.radius),
    bands: uniform(0).onObjectUpdate(({ object }) => drawOf(object)?.bands),
    softness: uniform(0).onObjectUpdate(({ object }) => drawOf(object)?.softness),
    castShadows: uniform(1).onObjectUpdate(({ object }) => drawOf(object)?.castShadows),
  }
}

/** The texel's logical position: render space as is, or unprojected from the 2:1 lattice (ADR 0009). */
function logicalPositionNode(isometric: Float): Vec2 {
  const world = positionWorld.xy
  const unprojected = vec2(world.x.div(2).sub(world.y), world.x.div(2).negate().sub(world.y))
  return mix(world, unprojected, isometric)
}

/** light-field.ts `lightFalloff` at `t` = d / radius: smooth, or the top of its band. */
function falloffNode(t: Float, bands: Float): Float {
  const c = clamp(t, 0, 1)
  const smooth = float(1).sub(c.mul(c).mul(float(3).sub(c.mul(2))))
  const banded = ceil(smooth.mul(bands)).div(max(bands, 1))
  return select(t.lessThan(1), select(bands.greaterThan(0.5), banded, smooth), float(0))
}

/** light-field.ts `lightVisibility`: the centre ray, plus the soft ring when softness > 0. */
function visibilityNode(uniforms: LightMapUniforms, light: LightUniforms, logical: Vec2): Float {
  const segmentClear = segmentClearNode(uniforms)
  const visibility = float(1).toVar()
  If(light.castShadows.greaterThan(0.5).and(uniforms.grid.w.greaterThan(0.5)), () => {
    const seen = segmentClear(logical, light.position).toVar()
    If(light.softness.greaterThan(0), () => {
      const spread = light.softness.mul(light.radius).mul(SOFT_SHADOW_SPREAD)
      Loop(SOFT_SHADOW_RING, ({ i }) => {
        const angle = float(i).mul((2 * Math.PI) / SOFT_SHADOW_RING)
        seen.addAssign(segmentClear(logical, light.position.add(vec2(cos(angle), sin(angle)).mul(spread))))
      })
      visibility.assign(seen.div(SOFT_SHADOW_RING + 1))
    }).Else(() => {
      visibility.assign(seen)
    })
  })
  return visibility
}

/** Adds the light onto the cleared target: ONE + ONE, which the 8-bit target clamps at 1. */
function addOnto(material: THREE.MeshBasicNodeMaterial): void {
  material.transparent = true
  material.depthTest = false
  material.depthWrite = false
  material.blending = THREE.CustomBlending
  material.blendEquation = THREE.AddEquation
  material.blendSrc = THREE.OneFactor
  material.blendDst = THREE.OneFactor
  material.blendSrcAlpha = THREE.OneFactor
  material.blendDstAlpha = THREE.OneFactor
}

/**
 * The material every light-map mesh shares (issue #78 CA-5..CA-7): per texel,
 * `color × intensity × falloff(d / radius) × visibility` with `d` measured in
 * logical space (ADR 0009), added onto the Ambient Light the target was
 * cleared to. light-field.ts is its specification.
 */
export function createLightMaterial(uniforms: LightMapUniforms): THREE.MeshBasicNodeMaterial {
  const light = lightUniforms()
  const material = new THREE.MeshBasicNodeMaterial()
  material.fragmentNode = Fn(() => {
    const logical = logicalPositionNode(uniforms.isometric).toVar()
    const reach = falloffNode(length(logical.sub(light.position)).div(max(light.radius, 1e-6)), light.bands).toVar()
    const visibility = float(0).toVar()
    If(reach.greaterThan(0), () => {
      visibility.assign(visibilityNode(uniforms, light, logical))
    })
    return vec4(light.color.mul(reach).mul(visibility), 1)
  })()
  addOnto(material)
  return material
}

/**
 * The quad that multiplies the light-map over the frame already drawn
 * (ADR 0026): `frame × light`, alpha kept, on the sRGB values as stored —
 * on the canvas, or in a Post Effect's target, which stores them alike.
 */
export function createMultiplyMaterial(light: THREE.Texture): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial()
  material.fragmentNode = vec4(texture(light, uv()).rgb, 1)
  material.transparent = true
  material.depthTest = false
  material.depthWrite = false
  material.blending = THREE.CustomBlending
  material.blendEquation = THREE.AddEquation
  material.blendSrc = THREE.ZeroFactor
  material.blendDst = THREE.SrcColorFactor
  material.blendSrcAlpha = THREE.ZeroFactor
  material.blendDstAlpha = THREE.OneFactor
  return material
}
