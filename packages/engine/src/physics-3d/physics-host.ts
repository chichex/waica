import type { Entity } from '../entity.js'
import type { Game } from '../game.js'
import { activeRuntimeBridgeHook } from '../runtime-bridge.js'
import type { Vec3Json } from '../scene-camera-3d.js'
import { DEFAULT_GRAVITY, type ResolvedSceneSimulation } from '../scene-simulation.js'
import type { SceneSpace } from '../scene-space.js'
import type { BodyRecord } from './body-sync.js'
import { loadRapier, RAPIER_PACKAGE, type PhysicsBackend, type RapierModule } from './rapier-module.js'
import { PhysicsWorld } from './physics-world.js'

/** `loading` until the Rapier module arrives, `ready` once the live 3D scene has its world, `failed` for good if the load failed. */
export type PhysicsState = 'loading' | 'ready' | 'failed'

/**
 * The Game's physics (ADR 0028): loads Rapier the first time a 3D scene loads
 * and counts that load as a pending asset, so Assets Ready, `game.ready()` and
 * the Run Session's wait all cover it; keeps one `PhysicsWorld` per live 3D
 * scene; and answers the components' questions by entity. A 2D scene never
 * triggers the load.
 */
export class PhysicsHost {
  private module: RapierModule | null = null
  private loading: Promise<void> | null = null
  private failure: Error | null = null
  private gravity: Vec3Json = [...DEFAULT_GRAVITY]
  private live: PhysicsWorld | null = null
  private disposed = false

  constructor(
    private readonly game: Game,
    private readonly backend?: PhysicsBackend,
  ) {}

  /** The live 3D scene's world; null for a 2D scene, while the module loads and after it failed. */
  get world(): PhysicsWorld | null {
    return this.live
  }

  /** The state a 3D scene reports; for a 2D scene it is meaningless and callers do not ask. */
  get state(): PhysicsState {
    if (this.failure) return 'failed'
    return this.live ? 'ready' : 'loading'
  }

  /** The gravity the live scene runs with: its world's, or the declared one while the world does not exist yet. */
  get sceneGravity(): Vec3Json {
    return this.live ? this.live.gravity : [...this.gravity]
  }

  /** Adopts a scene's space (called by `setSceneRender`): a 3D scene starts the load, or gets its world at once when the module is here. */
  enterScene(space: SceneSpace): void {
    if (space !== '3d' || this.disposed) return
    if (this.module) this.createWorld(this.module)
    else this.begin()
  }

  /** Adopts a scene's gravity (called by `setSceneSimulation`). */
  setSimulation(simulation: ResolvedSceneSimulation): void {
    this.gravity = simulation.gravity
    if (this.live) this.live.gravity = simulation.gravity
  }

  /** Frees the world after the scene's entities are destroyed; the module stays. */
  unloadScene(): void {
    this.live?.free()
    this.live = null
    this.gravity = [...DEFAULT_GRAVITY]
  }

  dispose(): void {
    this.disposed = true
    this.unloadScene()
  }

  /**
   * `game.ready()`: the renderer's promise, and for a Game whose live scene is
   * 3D also the Rapier load (which rejects, naming the package, when it fails).
   */
  whenReady(rendering: Promise<void>): Promise<void> {
    const loading = this.game.space === '3d' ? this.loading : null
    return loading ? Promise.all([rendering, loading]).then(() => undefined) : rendering
  }

  /** One Simulation Step of the world, when there is one. */
  step(): void {
    this.live?.step()
  }

  attach(entity: Entity): void {
    this.live?.attach(entity)
  }

  detach(entity: Entity): void {
    this.live?.detach(entity)
  }

  recordOf(entity: Entity): BodyRecord | undefined {
    return this.live?.recordOf(entity)
  }

  velocityOf(entity: Entity): { x: number; y: number; z: number } | null {
    const record = this.recordOf(entity)
    if (!record) return null
    const { x, y, z } = record.body.linvel()
    return { x, y, z }
  }

  setVelocityOf(entity: Entity, velocity: { x: number; y: number; z: number }): void {
    this.recordOf(entity)?.body.setLinvel(velocity, true)
  }

  groundedOf(entity: Entity): boolean {
    return this.recordOf(entity)?.grounded ?? false
  }

  applyImpulseTo(entity: Entity, impulse: { x: number; y: number; z: number }): void {
    const record = this.recordOf(entity)
    if (record?.kind === 'dynamic') record.body.applyImpulse(impulse, true)
  }

  private begin(): void {
    if (this.loading) return
    const work = (this.backend ?? loadRapier)().then(
      (module) => this.arrive(module),
      (cause: unknown) => this.fail(cause),
    )
    this.loading = work
    // The asset loader counts it: pending now, loaded or failed when it settles, and Assets Ready waits for it.
    this.game.assets.track(work, RAPIER_PACKAGE)
    // Observed here: `whenReady` hands every caller its own derived promise.
    work.catch(() => undefined)
  }

  private arrive(module: RapierModule): void {
    this.module = module
    if (this.disposed || this.game.space !== '3d') return
    this.createWorld(module)
  }

  private fail(cause: unknown): never {
    const reason = cause instanceof Error ? cause.message : String(cause)
    const error = new Error(`Physics failed to load: could not import ${RAPIER_PACKAGE} (${reason})`, { cause })
    this.failure = error
    if (!this.disposed) activeRuntimeBridgeHook()?.fail?.({ code: 'physics-backend-failed', message: error.message })
    throw error
  }

  /** The world of the live 3D scene, with a body for every Collider already spawned (a load that finished late). */
  private createWorld(module: RapierModule): void {
    if (this.live || this.disposed) return
    this.live = new PhysicsWorld(module, this.gravity)
    for (const entity of this.game.entities) this.live.attach(entity)
  }
}
