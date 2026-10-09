import type { Entity } from './entity.js'
import type { Game } from './game.js'
import type { BodyKind } from './physics-3d/body-sync.js'
import type { PhysicsState } from './physics-3d/physics-host.js'
import type { ProjectionIssue } from './runtime-inspection.js'
import type { Vec3Json } from './scene-camera-3d.js'

/** One live body of a 3D scene (issue #159 CA-17): its entity's name and snapshot id, its Rapier type, velocity and whether it stands on something. */
export interface RuntimeSnapshotBody {
  entity: string
  id: string
  type: BodyKind
  velocity: Vec3Json
  grounded: boolean
}

/**
 * `game.physics` of a 3D scene (issue #159 CA-17), beside `lighting`: the
 * world's state (`loading` until the Rapier module arrives), its gravity and
 * every body in spawn order, rounded to 1e-6. Never filtered by entity or
 * component filters; a 2D scene's snapshot has no `physics` key.
 */
export interface RuntimeSnapshotPhysics {
  state: PhysicsState
  gravity: Vec3Json
  bodies: RuntimeSnapshotBody[]
}

const rounded = (value: number): number => Math.round(value * 1e6) / 1e6 || 0

const roundedVector = (x: number, y: number, z: number): Vec3Json => [rounded(x), rounded(y), rounded(z)]

/** The `physics` section of a 3D scene's snapshot, as the spread that adds it; nothing in a 2D scene. */
export function physicsSection(game: Game, idFor: (entity: Entity) => string): { physics?: RuntimeSnapshotPhysics } {
  if (game.space !== '3d') return {}
  const world = game.physics.world
  const [gx, gy, gz] = game.physics.sceneGravity
  const bodies = (world?.bodiesOf(game.entities) ?? []).map((record): RuntimeSnapshotBody => {
    const { x, y, z } = record.body.linvel()
    return {
      entity: record.entity.name,
      id: idFor(record.entity),
      type: record.kind,
      velocity: roundedVector(x, y, z),
      grounded: record.grounded,
    }
  })
  return { physics: { state: game.physics.state, gravity: roundedVector(gx, gy, gz), bodies } }
}

/** What capping the bodies needs from a snapshot: its physics section and its projection issues. */
interface BodiesCappable {
  physics?: RuntimeSnapshotPhysics
  projectionIssues: ProjectionIssue[]
}

/**
 * The global cap's stage for bodies, beside the lights' (`capLights`): drops
 * bodies from the end until the snapshot fits, recording how many went with a
 * `truncated` marker at `physics.bodies[n]`.
 */
export function capBodies<T extends BodiesCappable>(snapshot: T, fits: (candidate: T) => boolean): T {
  const physics = snapshot.physics
  if (!physics || fits(snapshot)) return snapshot
  let capped = snapshot
  const retained = [...physics.bodies]
  while (retained.length > 0) {
    retained.pop()
    const omitted = physics.bodies.length - retained.length
    capped = {
      ...snapshot,
      physics: { ...physics, bodies: [...retained] },
      projectionIssues: [...snapshot.projectionIssues, { path: `physics.bodies[${retained.length}]`, marker: 'truncated', omitted }],
    }
    if (fits(capped)) return capped
  }
  return capped
}
