import * as THREE from 'three'
import { aabbOverlap } from './aabb'
import { resolveSceneCamera, stepSceneCamera, type ResolvedSceneCamera, type SceneCameraJson } from './camera'
import type { Component, ComponentClass } from './component'
import { Hitbox } from './components/hitbox'
import { Entity } from './entity'
import { Emitter } from './events'
import { Input, type InputBindings } from './input'
import { Stats, type StatValue } from './stats'
import { GameUi } from './ui'

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

/** Persisted overrides: entity → componentName → prop → value. */
export type ParamOverrides = Record<string, Record<string, Record<string, number | boolean>>>

/**
 * Engine core: loop, unified 2D/3D three scene, orthographic camera,
 * entities with components, and input. See DESIGN.md.
 */
export class Game {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.OrthographicCamera
  readonly input: Input
  readonly entities: Entity[] = []
  readonly events = new Emitter()
  readonly stats: Stats
  /** The HTML UI layer: presentation-only pieces toggled from code. */
  readonly ui: GameUi
  paramOverrides: ParamOverrides = {}
  /**
   * With false, the loop keeps rendering but runs no component updates
   * or collisions — the editor's edit mode.
   */
  simulate = true

  // TODO(H1): migrate to WebGPURenderer (three/webgpu) with automatic WebGL2 fallback.
  private readonly renderer: THREE.WebGLRenderer
  private readonly updateFns = new Set<UpdateFn>()
  private readonly resolution: GameResolution | null
  private viewHeight: number
  private sceneCamera: ResolvedSceneCamera | null = null
  private lastTime = 0

  constructor(options: GameOptions) {
    const { canvas, background = 0x1a1a2e, viewHeight = 10 } = options
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
    this.resize()
    new ResizeObserver(() => this.resize()).observe(canvas)
  }

  /** Creates a live entity in the scene. */
  spawn(name: string): Entity {
    const entity = new Entity(this, name)
    this.entities.push(entity)
    this.scene.add(entity.node)
    return entity
  }

  /** Finds an entity by name. */
  find(name: string): Entity | undefined {
    return this.entities.find((e) => e.name === name)
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
    const [x, y] = followed
      ? [followed.position.x, followed.position.y]
      : this.sceneCamera.position
    this.camera.position.x = x
    this.camera.position.y = y
    this.setViewHeight(this.sceneCamera.zoom)
  }

  start(): void {
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
    this.input.dispose()
    this.ui.dispose()
    for (const entity of [...this.entities]) entity.destroy()
    this.renderer.dispose()
  }

  private tick(time: number): void {
    // Clamp dt: switching tabs or pausing doesn't fast-forward the simulation.
    const dt = Math.min((time - this.lastTime) / 1000, 0.1)
    this.lastTime = time
    if (this.simulate) {
      for (const entity of [...this.entities]) {
        for (const component of [...entity.components]) component.onUpdate?.(dt)
      }
      this.dispatchCollisions()
      this.updateSceneCamera(dt)
    }
    // The UI must react to the pause itself (hide until resumed).
    this.ui.setActive(this.simulate)
    for (const fn of this.updateFns) fn(dt)
    this.input.endFrame()
    if (this.resolution) {
      // Letterbox bars: clear the whole canvas, then render inside the scissor.
      this.renderer.setScissorTest(false)
      this.renderer.setClearColor(0x000000, 1)
      this.renderer.clear(true, false, false)
      this.renderer.setScissorTest(true)
    }
    this.renderer.render(this.scene, this.camera)
  }

  private updateSceneCamera(dt: number): void {
    const cam = this.sceneCamera
    if (!cam) return
    const followed = cam.follow ? this.find(cam.follow) : undefined
    const mover = followed?.components.find(
      (c) => typeof (c as unknown as { vx?: unknown }).vx === 'number',
    ) as unknown as { vx: number } | undefined
    const next = stepSceneCamera(cam, {
      x: this.camera.position.x,
      y: this.camera.position.y,
      halfW: (this.camera.right - this.camera.left) / 2,
      halfH: this.viewHeight / 2,
      target: followed ? { x: followed.position.x, y: followed.position.y } : null,
      vx: mover?.vx ?? 0,
      dt,
    })
    this.camera.position.x = next.x
    this.camera.position.y = next.y
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
        const hit = aabbOverlap(
          a.position.x, a.position.y, ha.width, ha.height,
          b.position.x, b.position.y, hb.width, hb.height,
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
