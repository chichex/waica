import { Collider } from '../components/collider.js'
import { RigidBody } from '../components/rigid-body.js'
import type { Entity } from '../entity.js'
import { SIMULATION_STEP } from '../fixed-step.js'
import type { Vec3Json } from '../scene-camera-3d.js'
import { colliderProblem, createBody, rigidBodyProblem, syncBodyPose, type BodyRecord } from './body-sync.js'
import { CharacterMotion } from './character-controller.js'
import type { RapierModule, RapierWorld } from './rapier-module.js'

/**
 * One Rapier world and the bodies of the live 3D scene (ADR 0028): created
 * with the scene, stepped once per Simulation Step, freed with the scene. It
 * owns every Rapier handle; components only hold plain params and ask the
 * Game's `physics` for velocity, impulses and the like by entity.
 */
export class PhysicsWorld {
  /** The Rapier world itself, for the modules that query it; nothing outside `physics-3d/` and its tests should touch it. */
  readonly raw: RapierWorld
  private readonly records = new Map<Entity, BodyRecord>()
  private readonly byCollider = new Map<number, BodyRecord>()
  /** Entities with a RigidBody and, so far, no Collider: warned about at the first step if it stays so. */
  private readonly orphans = new Set<Entity>()
  /** The last warning each entity got, so the same problem seen from both of its components is said once. */
  private readonly warned = new WeakMap<Entity, string>()
  private sensors = 0
  /** Bodies came or went since Rapier last updated the structure its queries read. */
  private queriesStale = false
  private readonly characters: CharacterMotion

  constructor(
    /** The Rapier module the world was made with, for the shapes and rays its queries build. */
    readonly R: RapierModule,
    gravity: Vec3Json,
  ) {
    this.raw = new R.World({ x: gravity[0], y: gravity[1], z: gravity[2] })
    this.raw.timestep = SIMULATION_STEP
    this.characters = new CharacterMotion(R, this.raw)
  }

  /** Whether any body has a sensor Collider, so the sensor dispatch can be skipped when none does. */
  get hasSensors(): boolean {
    return this.sensors > 0
  }

  get gravity(): Vec3Json {
    const { x, y, z } = this.raw.gravity
    return [x, y, z]
  }

  set gravity(value: Vec3Json) {
    this.raw.gravity = { x: value[0], y: value[1], z: value[2] }
  }

  /** The record of an entity's body, if it has one. */
  recordOf(entity: Entity): BodyRecord | undefined {
    return this.records.get(entity)
  }

  /** The record that owns a Rapier collider handle. */
  recordOfCollider(handle: number): BodyRecord | undefined {
    return this.byCollider.get(handle)
  }

  /** The bodies of the given entities, in their order. */
  bodiesOf(entities: readonly Entity[]): BodyRecord[] {
    return entities.flatMap((entity) => {
      const record = this.records.get(entity)
      return record ? [record] : []
    })
  }

  /**
   * Builds (or rebuilds) the entity's body from the Collider and RigidBody it
   * has now. Called from each component's `onReady`, so either order of the
   * two works: the later one replaces the earlier one's body.
   */
  attach(entity: Entity): void {
    const collider = entity.get(Collider)
    const rigid = entity.get(RigidBody) ?? null
    if (!collider) {
      if (rigid) this.orphans.add(entity)
      return
    }
    this.detach(entity)
    const problem = colliderProblem(collider)
    const bodyProblem = problem === null && rigid ? rigidBodyProblem(rigid) : null
    if (problem !== null) return this.warnOnce(entity, `Collider on "${entity.name}" creates no body: ${problem}.`)
    if (bodyProblem !== null) return this.warnOnce(entity, `RigidBody on "${entity.name}" creates no body: ${bodyProblem}.`)
    const record = createBody(this.R, this.raw, { entity, collider, rigid })
    this.records.set(entity, record)
    this.queriesStale = true
    this.byCollider.set(record.shape.handle, record)
    if (record.sensor) this.sensors += 1
  }

  /** Removes the entity's body and collider; a no-op for an entity without one. */
  detach(entity: Entity): void {
    this.orphans.delete(entity)
    const record = this.records.get(entity)
    if (!record) return
    this.records.delete(entity)
    this.byCollider.delete(record.shape.handle)
    if (record.sensor) this.sensors -= 1
    this.raw.removeRigidBody(record.body)
    this.queriesStale = true
  }

  /**
   * One Simulation Step of physics: every kinematic body is moved through the
   * character controller, Rapier steps, then moving bodies write their pose to
   * their entities.
   */
  step(): void {
    this.warnOrphans()
    this.characters.follow(this.records.values())
    for (const record of this.records.values()) {
      if (record.kind !== 'kinematic') continue
      this.refreshQueries()
      this.characters.move(record)
    }
    this.raw.step()
    this.queriesStale = false
    for (const record of this.records.values()) syncBodyPose(record)
  }

  /**
   * Makes ray casts, shape queries and the character controller see the bodies
   * created or removed since the last step: Rapier only updates the structure
   * they read inside `step()`, so a body spawned this frame would be invisible
   * (a character would fall through a floor spawned with it). A step of zero
   * seconds updates it and moves nothing.
   */
  refreshQueries(): void {
    if (!this.queriesStale) return
    this.queriesStale = false
    const timestep = this.raw.timestep
    this.raw.timestep = 0
    this.raw.step()
    this.raw.timestep = timestep
  }

  /** Frees the Rapier world and forgets every body. The entities are destroyed (and detached) before this. */
  free(): void {
    this.records.clear()
    this.byCollider.clear()
    this.orphans.clear()
    this.sensors = 0
    this.characters.free()
    this.raw.free()
  }

  private warnOrphans(): void {
    for (const entity of this.orphans) {
      this.orphans.delete(entity)
      if (!entity.alive || entity.has(Collider)) continue
      this.warnOnce(entity, `RigidBody on "${entity.name}" needs a Collider on the same entity; no body was created.`)
    }
  }

  private warnOnce(entity: Entity, message: string): void {
    if (this.warned.get(entity) === message) return
    this.warned.set(entity, message)
    console.warn(`[waica] ${message}`)
  }
}
