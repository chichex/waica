import * as THREE from 'three'
import { collisionOverlap } from './collision-shape.js'
import {
  isCameraVelocityProvider,
  resolveSceneCamera,
  stepSceneCamera,
  type CameraVelocityProvider,
  type ResolvedSceneCamera,
  type SceneCameraJson,
} from './camera.js'
import type { Component, ComponentClass } from './component.js'
import { resolveComponentUpdateSchedule } from './component-update-schedule.js'
import { Hitbox } from './components/hitbox.js'
import { Entity } from './entity.js'
import { Emitter } from './events.js'
import { Input, type InputBindings } from './input.js'
import { Pointer } from './pointer.js'
import {
  activeRuntimeBridgeHook,
  EngineRuntimeBridge,
} from './runtime-bridge.js'
import { RuntimeInspector } from './runtime-inspection.js'
import { projectIsometric } from './projection.js'
import { isYSortParticipant, ySortZ, type YSortEntry, type YSortParticipant } from './render-sort.js'
import {
  loadScene,
  registryEntry,
  spawnFromJson,
  type SceneJson,
  type SceneRegistry,
  type SceneRenderJson,
} from './scene.js'
import { Stats, type StatValue } from './stats.js'
import { GameUi } from './ui.js'

/** Fixed game resolution: the view keeps this aspect, letterboxed. */
export interface GameResolution {
  width: number
  height: number
}

export interface GameOptions {
  /** Canvas the game draws into. */
  canvas: HTMLCanvasElement
  /** Scene background color. */
  background?: THREE.ColorRepresentation
  /** Visible world height in units; the 2D camera frames this. */
  viewHeight?: number
  /** Fixed resolution (from the project's game.json); absent = fill the canvas. */
  resolution?: GameResolution
  /** Control overrides (action → key codes) on top of the defaults. */
  bindings?: InputBindings
  /** Initial stat values (points, lives…) from the project's stats.json. */
  stats?: Record<string, StatValue>
}

export type UpdateFn = (dt: number) => void

export interface SpawnPrefabOptions {
  name?: string
  position?: [number, number]
}

/** The Project's scenes by name (a file's stem), plus the registry shared by all of them. */
export interface SceneCatalog {
  scenes: Record<string, SceneJson>
  registry: SceneRegistry
}

/** Persisted overrides: entity → componentName → prop → value. */
export type ParamOverrides = Record<string, Record<string, Record<string, number | boolean | string>>>

/**
 * Engine core: loop, unified 2D/3D three scene, orthographic camera,
 * entities with components, and input. See DESIGN.md.
 */
export class Game {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.OrthographicCamera
  readonly input: Input
  readonly pointer: Pointer
  readonly entities: Entity[] = []
  readonly events = new Emitter()
  readonly stats: Stats
  /** The HTML UI layer: presentation-only pieces toggled from code. */
  readonly ui: GameUi
  /** Registry retained by loadScene for runtime prefab spawning. */
  registry: SceneRegistry | null = null
  paramOverrides: ParamOverrides = {}
  /**
   * With false, the loop keeps rendering but runs no component updates
   * or collisions — the editor's edit mode.
   */
  simulate = true

  // TODO(H1): migrate to WebGPURenderer (three/webgpu) with automatic WebGL2 fallback.
  private readonly renderer: THREE.WebGLRenderer
  private readonly resizeObserver: ResizeObserver
  private readonly updateFns = new Set<UpdateFn>()
  private readonly invalidUpdateCompositions = new WeakMap<Entity, string>()
  private readonly resolution: GameResolution | null
  /** The constructor's viewHeight — unloadScene() restores it. */
  private readonly baseViewHeight: number
  private viewHeight: number
  private sceneCamera: ResolvedSceneCamera | null = null
  private renderSort: 'y' | null = null
  private sceneProjection: 'isometric' | null = null
  private lastTime = 0
  private runtimeBridge: EngineRuntimeBridge | null = null
  /** Host-registered scenes by name, resolved by loadSceneByName. Session-scoped. */
  private sceneCatalog: SceneCatalog | null = null
  /** The live scene's name (its catalog key), or null with no scene loaded. */
  private liveSceneName: string | null = null
  /** True for the whole extent of a runFrame() call, incl. its tail. */
  private insideFrame = false
  /** A loadSceneByName() enqueued while insideFrame; applied at the next runFrame's start. */
  private pendingSceneLoad: (() => void) | null = null

  constructor(options: GameOptions) {
    const { canvas, background = 0x1a1a2e, viewHeight = 10 } = options
    this.baseViewHeight = viewHeight
    this.viewHeight = viewHeight
    this.resolution = options.resolution ?? null
    this.input = new Input(options.bindings)
    this.stats = new Stats(options.stats)
    this.ui = new GameUi(this.stats, () => canvas.parentElement ?? document.body)
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.scene.background = new THREE.Color(background)
    this.camera = new THREE.OrthographicCamera()
    this.camera.position.z = 10
    this.pointer = new Pointer(canvas, {
      camera: this.camera,
      resolution: this.resolution,
      projection: () => this.sceneProjection,
      entities: this.entities,
    })
    this.resize()
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas)
  }

  /** Creates a live entity in the scene. */
  spawn(name: string): Entity {
    const entity = new Entity(this, name)
    entity.setProjected(this.sceneProjection === 'isometric')
    this.entities.push(entity)
    this.scene.add(entity.node)
    return entity
  }

  /** Instantiates a registered prefab after a scene has supplied the registry. */
  spawnPrefab(prefab: string, options: SpawnPrefabOptions = {}): Entity | null {
    const registry = this.registry
    if (!registry) {
      console.warn(`[waica] cannot spawn prefab before loadScene: "${prefab}"`)
      return null
    }
    if (!registryEntry(registry.prefabs, prefab)) {
      console.warn(`[waica] unknown runtime prefab: "${prefab}"`)
      return null
    }
    const base = prefab.slice(prefab.lastIndexOf('/') + 1) || 'Entity'
    const name = options.name ?? base.charAt(0).toUpperCase() + base.slice(1)
    return spawnFromJson(
      this,
      { name, prefab, ...(options.position ? { position: options.position } : {}) },
      registry,
    )
  }

  /** Finds an entity by name. */
  find(name: string): Entity | undefined {
    return this.entities.find((e) => e.name === name)
  }

  /**
   * Destroys the live scene — every entity (Entity.destroy(), so onDestroy
   * cascades and GPU resources release) and its scene-scoped UI — and
   * leaves the Game as newly constructed: no registry, no scene camera, no
   * render sort or projection, viewHeight back to the constructor's.
   * Session-scoped state (stats, paramOverrides, subscriptions, the scene
   * catalog) is untouched. See ADR 0011. Public: the seam `loadScene` calls
   * to replace a scene, and how a host leaves the Game with none loaded.
   */
  unloadScene(): void {
    this.ui.unloadScene()
    // Entity.destroy() splices itself out of `this.entities` in place — the
    // Pointer holds that array by reference, so it must never be reassigned.
    for (const entity of [...this.entities]) entity.destroy()
    this.registry = null
    this.renderSort = null
    this.sceneProjection = null
    this.sceneCamera = null
    this.liveSceneName = null
    this.setViewHeight(this.baseViewHeight)
  }

  /** Registers the Project's scenes by name, resolved by loadSceneByName. */
  registerSceneCatalog(catalog: SceneCatalog): void {
    this.sceneCatalog = catalog
  }

  /** The live scene's name (its catalog key), or null with no scene loaded. */
  get sceneName(): string | null {
    return this.liveSceneName
  }

  /** Names registered via registerSceneCatalog, in registration order. */
  get availableScenes(): string[] {
    return this.sceneCatalog ? Object.keys(this.sceneCatalog.scenes) : []
  }

  /**
   * Resolves `name` through the registered catalog and loads it, replacing
   * the live scene. An unknown name warns and leaves the live scene
   * untouched. Triggered mid-frame (e.g. from a SceneTransition's
   * onCollide/onInteract) the swap is deferred to the very start of the
   * next runFrame — dispatchCollisions finishes its double loop over the
   * outgoing scene, and the incoming scene's entities are present only
   * from the next frame. Called from outside a frame (boot, or the Runtime
   * Bridge's `scene` control operation) it applies synchronously. Returns
   * whether `name` resolved.
   */
  loadSceneByName(name: string): boolean {
    const catalog = this.sceneCatalog
    const json = catalog ? registryEntry(catalog.scenes, name) : undefined
    if (!catalog || !json) {
      console.warn(`[waica] unknown scene: "${name}"`)
      return false
    }
    const apply = (): void => {
      loadScene(this, json, catalog.registry)
      this.liveSceneName = name
    }
    if (this.insideFrame) this.pendingSceneLoad = apply
    else apply()
    return true
  }

  /** Loads persisted parameter overrides (waica.params.json). */
  async loadParams(url: string): Promise<void> {
    try {
      const res = await fetch(url)
      if (res.ok) this.paramOverrides = (await res.json()) as ParamOverrides
    } catch {
      // no params file: the archetype defaults apply
    }
  }

  /** Applies persisted overrides to a freshly added component. */
  applyParamOverrides(entity: Entity, component: Component): void {
    const Class = component.constructor as unknown as ComponentClass
    const override = this.paramOverrides[entity.name]?.[Class.componentName]
    if (override) Object.assign(component, override)
  }

  /** Registers a function that runs once per frame. Returns the unsubscribe. */
  onUpdate(fn: UpdateFn): () => void {
    this.updateFns.add(fn)
    return () => this.updateFns.delete(fn)
  }

  /**
   * Adopts a scene's render block. Called by loadScene; without a block the
   * draw order stays layer-banded with spawn-order ties.
   */
  setSceneRender(json?: SceneRenderJson): void {
    this.renderSort = json?.sort === 'y' ? 'y' : null
    const projection = json?.projection === 'isometric' ? 'isometric' : null
    if (projection === this.sceneProjection) return
    this.sceneProjection = projection
    for (const entity of this.entities) {
      entity.setProjected(projection === 'isometric')
      for (const component of entity.components) component.onProjectionChange?.(projection)
    }
  }

  /**
   * Adopts a scene's camera block: jumps to its framing and, while
   * simulating, follows/clamps per its settings. Called by loadScene.
   */
  setSceneCamera(json?: SceneCameraJson): void {
    // No camera block: leave the camera to the host (constructor viewHeight).
    if (!json) {
      this.sceneCamera = null
      return
    }
    this.sceneCamera = resolveSceneCamera(json)
    // With a follow target the declared position is moot: start centered on
    // the target so play begins framed like the editor shows it.
    const followed = this.sceneCamera.follow ? this.find(this.sceneCamera.follow) : undefined
    const center = followed
      ? this.renderPoint(followed.position.x, followed.position.y)
      : { x: this.sceneCamera.position[0], y: this.sceneCamera.position[1] }
    this.camera.position.x = center.x
    this.camera.position.y = center.y
    this.setViewHeight(this.sceneCamera.zoom)
  }

  start(): void {
    const activation = activeRuntimeBridgeHook()
    if (activation) {
      if (!this.runtimeBridge) {
        const inspector = new RuntimeInspector(this)
        this.runtimeBridge = new EngineRuntimeBridge(this.renderer.domElement, activation, {
          step: (dt) => this.runFrame(dt),
          resume: (frame) => this.resumeRuntime(frame),
          pause: () => this.stop(),
          injectAction: (action, operation) => this.input.injectAction(action, operation),
          availableActions: () => this.input.availableActions(),
          heldActions: () => this.input.heldActions(),
          inspect: (metadata, filters) => inspector.snapshot(metadata, filters),
          click: (x, y) => {
            this.pointer.injectClick(x, y)
          },
          loadScene: (name) => this.loadSceneByName(name),
          availableScenes: () => this.availableScenes,
        })
        activation.register(this.runtimeBridge)
        window.addEventListener('pagehide', this.unregisterRuntimeBridge)
      }
      this.renderSurface()
      return
    }
    this.renderer.setAnimationLoop((time) => this.tick(time))
  }

  stop(): void {
    this.renderer.setAnimationLoop(null)
  }

  /** Internal: called by Entity.destroy(). */
  removeEntity(entity: Entity): void {
    const i = this.entities.indexOf(entity)
    if (i !== -1) this.entities.splice(i, 1)
  }

  /** The scene's render projection; null keeps logical and render space identical. */
  get projection(): 'isometric' | null {
    return this.sceneProjection
  }

  /** Visible world height (2D camera zoom). */
  get view(): number {
    return this.viewHeight
  }

  setViewHeight(value: number): void {
    this.viewHeight = Math.min(Math.max(value, 2), 80)
    this.resize()
  }

  /** Shuts the game down completely (loop, input, GPU). */
  dispose(): void {
    this.stop()
    this.unregisterRuntimeBridge()
    this.input.dispose()
    this.pointer.dispose()
    this.resizeObserver.disconnect()
    this.ui.dispose()
    for (const entity of [...this.entities]) entity.destroy()
    this.renderer.dispose()
  }

  private resumeRuntime(frame: (dt: number) => void): void {
    let previousTime: number | null = null
    this.renderer.setAnimationLoop((time) => {
      const dt = previousTime === null ? 0 : Math.min((time - previousTime) / 1000, 0.1)
      previousTime = time
      frame(dt)
    })
  }

  private tick(time: number): void {
    // Clamp dt: switching tabs or pausing doesn't fast-forward the simulation.
    const dt = Math.min((time - this.lastTime) / 1000, 0.1)
    this.lastTime = time
    this.runFrame(dt)
  }

  private runFrame(dt: number): void {
    this.insideFrame = true
    try {
      // Flushes a scene swap enqueued mid-frame last time (CA-7): applied
      // before this frame's own simulation, so the incoming scene's
      // entities are present only from this next frame onward.
      this.flushPendingSceneLoad()
      if (this.simulate) {
        for (const entity of [...this.entities]) {
          const schedule = this.componentUpdateSchedule(entity)
          if (!schedule) continue
          for (const component of schedule) component.onUpdate?.(dt)
        }
        this.dispatchCollisions()
        this.updateSceneCamera(dt)
      }
      // The UI must react to the pause itself (hide until resumed).
      this.ui.setActive(this.simulate)
      for (const fn of this.updateFns) fn(dt)
      this.input.endFrame()
      this.renderSurface()
    } finally {
      this.insideFrame = false
    }
  }

  private flushPendingSceneLoad(): void {
    const pending = this.pendingSceneLoad
    if (!pending) return
    this.pendingSceneLoad = null
    pending()
  }

  private unregisterRuntimeBridge = (): void => {
    window.removeEventListener('pagehide', this.unregisterRuntimeBridge)
    this.runtimeBridge?.unregister()
    this.runtimeBridge = null
  }

  /** Under y-sort, re-derives every participant's z from layer band + entity Y. */
  private applyYSort(): void {
    const participants: YSortParticipant[] = []
    const entries: YSortEntry[] = []
    for (const entity of this.entities) {
      for (const component of entity.components) {
        if (isYSortParticipant(component)) {
          participants.push(component)
          entries.push({ layer: component.layer, y: entity.node.position.y })
        }
      }
    }
    const z = ySortZ(entries)
    for (const [index, participant] of participants.entries()) participant.setSortZ(z[index]!)
  }

  private renderSurface(): void {
    if (this.sceneProjection === 'isometric') {
      for (const entity of this.entities) {
        const projected = projectIsometric(entity.position.x, entity.position.y)
        entity.node.position.x = projected.x
        entity.node.position.y = projected.y
      }
    }
    if (this.renderSort === 'y') this.applyYSort()
    this.ui.setActive(this.simulate)
    if (this.resolution) {
      // Letterbox bars: clear the whole canvas, then render inside the scissor.
      this.renderer.setScissorTest(false)
      this.renderer.setClearColor(0x000000, 1)
      this.renderer.clear(true, false, false)
      this.renderer.setScissorTest(true)
    }
    this.renderer.render(this.scene, this.camera)
  }

  private componentUpdateSchedule(entity: Entity): Component[] | null {
    const components = [...entity.components]
    const registry: Record<string, ComponentClass> = {
      ...(this.registry?.components ?? {}),
    }
    const byName = new Map<string, Component>()
    const names: string[] = []
    const signatureParts: string[] = []
    for (const component of components) {
      const Class = component.constructor as unknown as ComponentClass
      const name = Class.componentName
      registry[name] = Class
      names.push(name)
      byName.set(name, component)
      signatureParts.push(
        `${name}:${typeof Class.prototype.onUpdate === 'function' ? 'updates' : 'passive'}:` +
          [...new Set(Class.updateAfter ?? [])].sort().join(','),
      )
    }
    const result = resolveComponentUpdateSchedule(names, registry)
    if (!result.ok) {
      const signature = signatureParts.sort().join('|')
      if (this.invalidUpdateCompositions.get(entity) !== signature) {
        this.invalidUpdateCompositions.set(entity, signature)
        console.error(
          `[waica] invalid component update schedule for "${entity.name}": ` +
            result.issues.map((issue) => issue.cause).join(' '),
        )
      }
      return null
    }
    this.invalidUpdateCompositions.delete(entity)
    return result.order.map((name) => byName.get(name)!)
  }

  private updateSceneCamera(dt: number): void {
    const cam = this.sceneCamera
    if (!cam) return
    const followed = cam.follow ? this.find(cam.follow) : undefined
    const provider = followed?.components.find(
      (c): c is Component & CameraVelocityProvider => isCameraVelocityProvider(c),
    )
    const velocity = provider?.getCameraVelocity()
    const target = followed
      ? this.renderPoint(followed.position.x, followed.position.y)
      : null
    const renderVelocity = velocity
      ? this.renderPoint(velocity.vx, velocity.vy)
      : { x: 0, y: 0 }
    const next = stepSceneCamera(cam, {
      x: this.camera.position.x,
      y: this.camera.position.y,
      halfW: (this.camera.right - this.camera.left) / 2,
      halfH: this.viewHeight / 2,
      target,
      vx: renderVelocity.x,
      vy: renderVelocity.y,
      dt,
    })
    this.camera.position.x = next.x
    this.camera.position.y = next.y
  }

  private renderPoint(x: number, y: number): { x: number; y: number } {
    return this.sceneProjection === 'isometric' ? projectIsometric(x, y) : { x, y }
  }

  private dispatchCollisions(): void {
    const boxed = this.entities.filter((e) => e.has(Hitbox))
    for (let i = 0; i < boxed.length; i++) {
      for (let j = i + 1; j < boxed.length; j++) {
        const a = boxed[i]
        const b = boxed[j]
        if (!a?.alive || !b?.alive) continue
        const ha = a.get(Hitbox)
        const hb = b.get(Hitbox)
        if (!ha || !hb) continue
        const hit = collisionOverlap(
          {
            x: a.position.x + ha.offsetX,
            y: a.position.y + ha.offsetY,
            width: ha.width,
            height: ha.height,
            shape: ha.shape,
            points: ha.points,
          },
          {
            x: b.position.x + hb.offsetX,
            y: b.position.y + hb.offsetY,
            width: hb.width,
            height: hb.height,
            shape: hb.shape,
            points: hb.points,
          },
        )
        if (!hit) continue
        for (const c of [...a.components]) c.onCollide?.(b)
        if (!a.alive || !b.alive) continue
        for (const c of [...b.components]) c.onCollide?.(a)
      }
    }
  }

  private resize(): void {
    const canvas = this.renderer.domElement
    const { clientWidth: w, clientHeight: h } = canvas
    if (w === 0 || h === 0) return
    this.renderer.setSize(w, h, false)
    let aspect = w / h
    if (this.resolution) {
      // Fixed resolution: the largest rect with its aspect, centered (letterbox).
      aspect = this.resolution.width / this.resolution.height
      const vw = Math.min(w, h * aspect)
      const vh = vw / aspect
      const vx = (w - vw) / 2
      const vy = (h - vh) / 2
      this.renderer.setViewport(vx, vy, vw, vh)
      this.renderer.setScissor(vx, vy, vw, vh)
    }
    const halfH = this.viewHeight / 2
    const halfW = halfH * aspect
    this.camera.left = -halfW
    this.camera.right = halfW
    this.camera.top = halfH
    this.camera.bottom = -halfH
    this.camera.updateProjectionMatrix()
  }
}
