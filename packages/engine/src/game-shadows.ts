import * as THREE from 'three/webgpu'
import { PointLight } from './components/point-light.js'
import { Sun } from './components/sun.js'
import type { ShadowLight } from './components/shadow-light.js'
import type { ComponentClass } from './component.js'
import type { Game, ParamOverrides } from './game.js'
import { assertShadowMapCapacity, resolveLightShadow, resolveSceneShadows, type LightShadowOverrides, type ResolvedLightShadow, type ResolvedSceneShadows, type ShadowQuality } from './scene-shadows.js'
import { advanceRendererFrame, shadowTextureLimit } from './shadow-renderer.js'
import { createRangedPointShadow, type RangedPointShadow } from './point-shadow.js'
import { fitSunShadow, sunCoverageDepth } from './sun-shadow-camera.js'
import { registryEntry, resolveEntityComponents, resolveProps, sceneProps, type SceneJson, type SceneRegistry } from './scene.js'
import { resolvePerspectiveCamera } from './scene-camera-3d.js'

function isShadowClass(Class: ComponentClass | undefined): Class is ComponentClass<Sun | PointLight> {
  return Class !== undefined && (Class === Sun || Class === PointLight || Class.prototype instanceof Sun || Class.prototype instanceof PointLight)
}

function hasCoverage(light: Sun | PointLight, camera: Pick<THREE.PerspectiveCamera, 'near' | 'far'> | null, maxDistance: number): boolean {
  return !(light instanceof Sun) || (camera !== null && sunCoverageDepth(camera, maxDistance) !== null)
}

/** Detached lights compose normalized authored defaults/props/params without intermediate capacity checks. */
function* sceneLights(scene: SceneJson, registry: SceneRegistry, params: ParamOverrides): Generator<Sun | PointLight> {
  for (const entity of scene.entities) {
    for (const json of resolveEntityComponents(entity, registry.prefabs)) {
      const Class = registryEntry(registry.components, json.type)
      if (!isShadowClass(Class)) continue
      let light: Sun | PointLight
      try {
        light = new Class()
        Object.assign(light, sceneProps(resolveProps(json.props, registry), json.type, entity.name), params[entity.name]?.[Class.componentName])
      } catch {
        // Preserve spawnFromJson's isolation of throwing project-owned components.
        continue
      }
      yield light
    }
  }
}

/** The live scene's shadow policy; resolving settings never allocates a shadow map. */
export class GameShadows {
  private state = resolveSceneShadows(undefined)
  private renderer: THREE.WebGPURenderer | null = null
  private readonly pointShadows = new Map<PointLight, RangedPointShadow>()
  private readonly composing = new WeakSet<ShadowLight>()
  private readonly lastValid = new WeakMap<Sun | PointLight, ResolvedLightShadow>()
  private readonly capacityErrors = new WeakMap<Sun | PointLight, string>()
  private lastRendererFrame: number | null = null

  constructor(private readonly game: Game) {}

  connect(renderer: THREE.WebGPURenderer): void {
    this.renderer = renderer
  }

  get policy(): ResolvedSceneShadows {
    return { ...this.state }
  }

  get quality(): ShadowQuality {
    return this.state.quality
  }
  set quality(value: unknown) {
    this.adopt(resolveSceneShadows({ ...this.state, quality: value }))
  }

  get maxDistance(): number {
    return this.state.maxDistance
  }
  set maxDistance(value: unknown) {
    this.adopt(resolveSceneShadows({ ...this.state, maxDistance: value }))
  }

  loadScene(value: unknown): void {
    this.adopt(resolveSceneShadows(value))
    if (this.game.space !== '3d') for (const light of this.lights()) this.remove(light)
  }

  unloadScene(): void {
    this.state = resolveSceneShadows(undefined)
    if (this.renderer) this.renderer.shadowMap.enabled = false
  }

  /** Validate final composed props, before Entity.add publishes or readies a light. */
  validateAddition(component: ShadowLight): void {
    if (component instanceof Sun || component instanceof PointLight) this.assertCapacity(this.requested(component))
  }

  /** Check the ready device, even for authored 3D settings in a 2D preview. */
  assertCapacity(settings: ResolvedLightShadow): void {
    if (!this.renderer || !this.game.backend) return
    assertShadowMapCapacity(settings, shadowTextureLimit(this.renderer.backend))
  }

  /** Persisted params are one composed request, not a sequence of active setters. */
  applyParams(component: ShadowLight, props: Record<string, unknown>): void {
    this.validateChange(component, props)
    this.composing.add(component)
    try {
      Object.assign(component, props)
    } finally {
      this.composing.delete(component)
    }
  }

  /** Check an incoming scene before unloadScene destroys the last valid one. */
  validateScene(scene: SceneJson, registry: SceneRegistry): void {
    if (scene.render?.space !== '3d' || !this.game.backend) return
    const policy = resolveSceneShadows(scene.render.shadows)
    const camera = this.game.cameraRig.viewCamera ?? resolvePerspectiveCamera(scene.camera?.kind === 'perspective' ? scene.camera : undefined)
    for (const light of sceneLights(scene, registry, this.game.paramOverrides)) {
      const settings = resolveLightShadow(light instanceof Sun ? 'sun' : 'point', policy, light)
      settings.enabled = settings.enabled && hasCoverage(light, camera, settings.maxDistance)
      this.assertCapacity(settings)
    }
  }

  /** A failing request leaves both the authored live value and its active map unchanged. */
  validateChange(component: ShadowLight, change: LightShadowOverrides | Record<string, unknown>): void {
    if (this.composing.has(component)) return
    const light = this.lights().find((candidate) => candidate === component)
    if (!light || !this.renderer || !this.game.backend || this.game.space !== '3d') return
    const inputs = {
      castShadows: light.castShadows, shadowMapSize: light.shadowMapSize,
      shadowMaxDistance: light.shadowMaxDistance, shadowBias: light.shadowBias,
      shadowNormalBias: light.shadowNormalBias, shadowRadius: light.shadowRadius,
      distance: light instanceof PointLight ? light.distance : undefined,
      ...change,
    }
    const settings = this.withCoverage(light, resolveLightShadow(light instanceof Sun ? 'sun' : 'point', this.state, inputs))
    assertShadowMapCapacity(settings, shadowTextureLimit(this.renderer.backend))
  }

  validate(): void {
    this.validatePolicy(this.state)
  }

  resolve(light: Sun | PointLight): ResolvedLightShadow {
    const settings = this.effectiveSettings(light, this.requested(light))
    if (settings.enabled) this.lastValid.set(light, settings)
    return settings
  }

  private requested(light: Sun | PointLight): ResolvedLightShadow {
    const settings = resolveLightShadow(light instanceof Sun ? 'sun' : 'point', this.state, light)
    return this.withCoverage(light, settings)
  }

  private effectiveSettings(component: Sun | PointLight, requested: ResolvedLightShadow): ResolvedLightShadow {
    try {
      this.assertCapacity(requested)
      this.capacityErrors.delete(component)
      return requested
    } catch (error) {
      if (!(error instanceof RangeError)) throw error
      if (this.capacityErrors.get(component) !== error.message) {
        console.error(`[waica] shadow request rejected for "${component.entity.name}": ${error.message} Keeping the last supported shadow configuration, or no map if none exists.`)
        this.capacityErrors.set(component, error.message)
      }
      const previous = this.lastValid.get(component)
      return previous && this.renderer && previous.mapSize <= shadowTextureLimit(this.renderer.backend)
        ? this.withCoverage(component, previous)
        : { ...requested, enabled: false }
    }
  }

  /** Called at the render boundary, including paused and edit-mode frames. */
  sync(renderer: THREE.WebGPURenderer): void {
    if (this.game.space !== '3d') {
      renderer.shadowMap.enabled = false
      return
    }
    this.lastRendererFrame = advanceRendererFrame(renderer, this.lastRendererFrame)
    this.game.scene.updateWorldMatrix(true, false)
    this.game.camera.updateWorldMatrix(true, false)
    renderer.shadowMap.enabled = this.game.space === '3d' && this.state.quality !== 'off'
    renderer.shadowMap.type = THREE.PCFShadowMap
    const lights = this.lights()
    for (const component of this.pointShadows.keys()) {
      if (!lights.includes(component)) this.remove(component)
    }
    for (const component of lights) this.syncLight(component)
  }

  private syncLight(component: Sun | PointLight): void {
    const light = component.light
    if (!light) return
    const settings = this.resolve(component)
    if ((light.castShadow || light.shadow.map) && !settings.enabled) {
      this.remove(component)
    }
    light.castShadow = settings.enabled
    light.shadow.mapSize.set(settings.mapSize, settings.mapSize)
    // setSize retires GPU storage while preserving nodes held by cached materials.
    light.shadow.map?.setSize(settings.mapSize, settings.mapSize)
    light.shadow.bias = settings.bias
    light.shadow.normalBias = settings.normalBias
    light.shadow.radius = settings.radius
    if (component instanceof Sun) this.fitSun(component, settings)
    if (component instanceof PointLight && settings.enabled) this.syncPoint(component, settings)
  }

  private fitSun(component: Sun, settings: ResolvedLightShadow): void {
    const camera = this.game.camera
    if (!component.light || !(camera instanceof THREE.PerspectiveCamera)) return
    fitSunShadow({ light: component.light, camera, settings, direction: component.direction })
  }

  private syncPoint(component: PointLight, settings: ResolvedLightShadow): void {
    if (!component.light) return
    let adapter = this.pointShadows.get(component)
    if (!adapter) {
      adapter = createRangedPointShadow(component.light)
      this.pointShadows.set(component, adapter)
    }
    adapter.sync(settings.maxDistance)
  }

  private withCoverage(light: Sun | PointLight, settings: ResolvedLightShadow): ResolvedLightShadow {
    const camera = this.game.camera
    const enabled = this.game.space === '3d' && settings.enabled
      && hasCoverage(light, camera instanceof THREE.PerspectiveCamera ? camera : null, settings.maxDistance)
    return { ...settings, enabled }
  }

  /** Notify Three's analytic light node as well as disposing the exposed target. */
  remove(component: Sun | PointLight): void {
    if (component instanceof PointLight) {
      this.pointShadows.get(component)?.dispose()
      this.pointShadows.delete(component)
    }
    const light = component.light
    if (!light) return
    light.dispose()
    light.shadow.map = null
    light.castShadow = false
  }

  private adopt(policy: ResolvedSceneShadows): void {
    this.validatePolicy(policy)
    this.state = policy
  }

  private validatePolicy(policy: ResolvedSceneShadows): void {
    if (!this.renderer || !this.game.backend || this.game.space !== '3d') return
    const limit = shadowTextureLimit(this.renderer.backend)
    for (const light of this.lights()) {
      const settings = resolveLightShadow(light instanceof Sun ? 'sun' : 'point', policy, light)
      assertShadowMapCapacity(this.withCoverage(light, settings), limit)
    }
  }

  private lights(): Array<Sun | PointLight> {
    return this.game.entities.flatMap((entity) => entity.components.filter(
      (component): component is Sun | PointLight => component instanceof Sun || component instanceof PointLight,
    ))
  }
}
