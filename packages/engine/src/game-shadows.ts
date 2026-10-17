import * as THREE from 'three/webgpu'
import { PointLight } from './components/point-light.js'
import { Sun } from './components/sun.js'
import type { ShadowLight } from './components/shadow-light.js'
import type { Game } from './game.js'
import { assertShadowMapCapacity, resolveLightShadow, resolveSceneShadows, type LightShadowOverrides, type ResolvedLightShadow, type ResolvedSceneShadows, type ShadowQuality } from './scene-shadows.js'
import { advanceRendererFrame, shadowTextureLimit } from './shadow-renderer.js'
import { createRangedPointShadow, type RangedPointShadow } from './point-shadow.js'
import { fitSunShadow } from './sun-shadow-camera.js'

/** The live scene's shadow policy; resolving settings never allocates a shadow map. */
export class GameShadows {
  private state = resolveSceneShadows(undefined)
  private renderer: THREE.WebGPURenderer | null = null
  private readonly pointShadows = new Map<PointLight, RangedPointShadow>()
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

  /** A failing request leaves both the authored live value and its active map unchanged. */
  validateChange(component: ShadowLight, change: LightShadowOverrides): void {
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
    const settings = resolveLightShadow(light instanceof Sun ? 'sun' : 'point', this.state, light)
    return this.withCoverage(light, settings)
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
    this.validate()
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
    if ((light.castShadow || light.shadow.map) && (!settings.enabled || light.shadow.mapSize.x !== settings.mapSize)) {
      this.remove(component)
    }
    light.castShadow = settings.enabled
    light.shadow.mapSize.set(settings.mapSize, settings.mapSize)
    light.shadow.bias = settings.bias
    light.shadow.normalBias = settings.normalBias
    light.shadow.radius = settings.radius
    if (component instanceof Sun) this.fitSun(component, settings)
    if (component instanceof PointLight && settings.enabled) this.syncPoint(component, settings)
  }

  /** Prepare host overlays from the same current fit, without allocating or rendering. */
  prepareSunCamera(component: Sun): THREE.OrthographicCamera | null {
    const light = component.light
    if (!light) return null
    this.game.scene.updateWorldMatrix(true, false)
    this.game.camera.updateWorldMatrix(true, false)
    return this.fitSun(component, this.resolve(component)) ? light.shadow.camera : null
  }

  private fitSun(component: Sun, settings: ResolvedLightShadow): boolean {
    const camera = this.game.camera
    if (!component.light || !(camera instanceof THREE.PerspectiveCamera)) return false
    return fitSunShadow({ light: component.light, camera, settings, direction: component.direction })
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
    let enabled = this.game.space === '3d' && settings.enabled
    if (enabled && light instanceof Sun) {
      const camera = this.game.camera
      enabled = camera instanceof THREE.PerspectiveCamera && Number.isFinite(camera.near) && camera.near > 0
        && Math.min(camera.far, settings.maxDistance) > camera.near
    }
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
