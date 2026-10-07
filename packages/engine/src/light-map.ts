import * as THREE from 'three/webgpu'
import type { Light } from './components/light.js'
import { lightFootprint, type OccluderGrid, type Rgb } from './light-field.js'
import {
  createLightMapUniforms,
  createLightMaterial,
  createMultiplyMaterial,
  setLightDraw,
  type LightDraw,
  type LightMapUniforms,
} from './light-map-material.js'
import { projectIsometric } from './projection.js'

/** What one frame's light-map is drawn from. */
export interface LightMapFrame {
  width: number
  height: number
  /** The Ambient Light the target is cleared to, as multipliers. */
  ambient: Rgb
  lights: readonly Light[]
  projection: 'isometric' | null
  /** Bumps whenever the solid tiles change; the grid is rebuilt only then. */
  occluderRevision: number
  occluders: () => OccluderGrid | null
}

/** A placed light: its mesh and the values its material reads. */
interface LightMesh {
  mesh: THREE.Mesh
  draw: LightDraw
}

function emptyOccluders(): THREE.DataTexture {
  const texture = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType)
  texture.needsUpdate = true
  return texture
}

/**
 * The scene's light-map (issue #78, ADR 0026): an 8-bit target (inference
 * 16) the size of the internal resolution — or of the drawing buffer — with
 * nearest upscale, cleared to the Ambient Light, onto which each live Light
 * adds its term through one mesh over its footprint. Then multiplied over
 * the frame by one quad.
 */
export class LightMap {
  readonly target = new THREE.RenderTarget(1, 1, {
    type: THREE.UnsignedByteType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
  })
  private readonly scene = new THREE.Scene()
  private readonly geometry = new THREE.PlaneGeometry(1, 1)
  private readonly empty = emptyOccluders()
  private readonly uniforms: LightMapUniforms = createLightMapUniforms(this.empty)
  private readonly material = createLightMaterial(this.uniforms)
  private readonly meshes = new Map<Light, LightMesh>()
  private readonly multiplyMaterials = {
    canvas: createMultiplyMaterial(this.target.texture, false),
    linear: createMultiplyMaterial(this.target.texture, true),
  }
  private readonly multiply = {
    canvas: new THREE.QuadMesh(this.multiplyMaterials.canvas),
    linear: new THREE.QuadMesh(this.multiplyMaterials.linear),
  }
  private occluderTexture: THREE.DataTexture | null = null
  private builtRevision = -1
  private readonly clear = new THREE.Color()
  private readonly savedClear = new THREE.Color()

  /** Draws this frame's light-map into its target and leaves the renderer bound to `previous`. */
  render(renderer: THREE.WebGPURenderer, camera: THREE.Camera, frame: LightMapFrame): void {
    if (this.target.width !== frame.width || this.target.height !== frame.height) {
      this.target.setSize(frame.width, frame.height)
    }
    this.syncOccluders(frame)
    this.syncLights(frame)
    const previous = renderer.getRenderTarget()
    const alpha = renderer.getClearAlpha()
    renderer.getClearColor(this.savedClear)
    this.clear.setRGB(frame.ambient[0], frame.ambient[1], frame.ambient[2], THREE.LinearSRGBColorSpace)
    renderer.setClearColor(this.clear, 1)
    renderer.setRenderTarget(this.target)
    renderer.render(this.scene, camera)
    renderer.setRenderTarget(previous)
    renderer.setClearColor(this.savedClear, alpha)
  }

  /** Multiplies the light-map over what is bound now; `linear` when that is a Post Effect's target. */
  multiplyOver(renderer: THREE.WebGPURenderer, linear: boolean): void {
    ;(linear ? this.multiply.linear : this.multiply.canvas).render(renderer)
  }

  dispose(): void {
    this.target.dispose()
    this.geometry.dispose()
    this.material.dispose()
    this.multiplyMaterials.canvas.dispose()
    this.multiplyMaterials.linear.dispose()
    this.empty.dispose()
    this.occluderTexture?.dispose()
    this.meshes.clear()
  }

  private syncOccluders(frame: LightMapFrame): void {
    if (frame.occluderRevision === this.builtRevision) return
    this.builtRevision = frame.occluderRevision
    this.occluderTexture?.dispose()
    this.occluderTexture = null
    const grid = frame.occluders()
    if (!grid) {
      this.uniforms.occluders.value = this.empty
      this.uniforms.grid.value.set(0, 0, 1, 0)
      this.uniforms.gridSize.value.set(1, 1)
      return
    }
    const bytes = grid.solid.map((value) => (value === 1 ? 255 : 0))
    const texture = new THREE.DataTexture(bytes, grid.columns, grid.rows, THREE.RedFormat, THREE.UnsignedByteType)
    texture.needsUpdate = true
    this.occluderTexture = texture
    this.uniforms.occluders.value = texture
    this.uniforms.grid.value.set(grid.originX, grid.originY, grid.cellSize, 1)
    this.uniforms.gridSize.value.set(grid.columns, grid.rows)
  }

  /** One mesh per live Light, placed over its footprint; a destroyed Light's mesh leaves now. */
  private syncLights(frame: LightMapFrame): void {
    this.uniforms.isometric.value = frame.projection === 'isometric' ? 1 : 0
    const live = new Set(frame.lights)
    for (const [light, entry] of this.meshes) {
      if (live.has(light)) continue
      entry.mesh.removeFromParent()
      this.meshes.delete(light)
    }
    for (const light of frame.lights) this.place(light, frame.projection)
  }

  private place(light: Light, projection: 'isometric' | null): void {
    const entry = this.meshes.get(light) ?? this.createMesh(light)
    const field = light.field()
    entry.draw.position.set(field.x, field.y)
    entry.draw.color.set(field.color[0], field.color[1], field.color[2]).multiplyScalar(field.intensity)
    entry.draw.radius = field.radius
    entry.draw.bands = field.bands
    entry.draw.softness = field.softness
    entry.draw.castShadows = field.castShadows ? 1 : 0
    const center = projection === 'isometric' ? projectIsometric(field.x, field.y) : { x: field.x, y: field.y }
    const footprint = lightFootprint(field.radius, projection)
    entry.mesh.position.set(center.x, center.y, 0)
    entry.mesh.scale.set(Math.max(footprint.width, 1e-6), Math.max(footprint.height, 1e-6), 1)
    entry.mesh.visible = field.radius > 0 && field.intensity > 0
  }

  private createMesh(light: Light): LightMesh {
    const mesh = new THREE.Mesh(this.geometry, this.material)
    mesh.frustumCulled = false
    const draw: LightDraw = {
      position: new THREE.Vector2(),
      color: new THREE.Vector3(),
      radius: 0,
      bands: 0,
      softness: 0,
      castShadows: 1,
    }
    setLightDraw(mesh, draw)
    this.scene.add(mesh)
    const entry = { mesh, draw }
    this.meshes.set(light, entry)
    return entry
  }
}
