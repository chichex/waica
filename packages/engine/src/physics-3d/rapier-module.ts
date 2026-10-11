// The one module of the engine that names @dimforge/rapier3d-deterministic-compat (ADR 0028).
// Every other file takes the types from here and the module itself through
// `PhysicsBackend`, so a 2D project never pays the ~2 MB of wasm: the package
// is a dynamic import() that only a 3D scene triggers.
import type * as Rapier from '@dimforge/rapier3d-deterministic-compat'

/** The initialized Rapier module: the `RAPIER` namespace the package documents. */
export type RapierModule = typeof Rapier

export type {
  Collider as RapierCollider,
  ColliderDesc as RapierColliderDesc,
  KinematicCharacterController as RapierCharacterController,
  RigidBody as RapierBody,
  TempContactManifold as RapierManifold,
  World as RapierWorld,
} from '@dimforge/rapier3d-deterministic-compat'

/** The package name, for the messages that name it. */
export const RAPIER_PACKAGE = '@dimforge/rapier3d-deterministic-compat'

/**
 * Where a Game gets Rapier (ADR 0013's seam, applied to physics): resolves to
 * the initialized module. Defaults to `loadRapier`; a project's own tests pass
 * the real module they initialized once, or a rejecting stub for the failure path.
 */
export type PhysicsBackend = () => Promise<RapierModule>

let shared: Promise<RapierModule> | null = null

/**
 * Imports and initializes Rapier, once per page: every Game that asks shares
 * the same module. A failed load is forgotten, so a later Game may retry.
 */
export function loadRapier(): Promise<RapierModule> {
  shared ??= import('@dimforge/rapier3d-deterministic-compat')
    .then(async (module) => {
      await module.init()
      return module
    })
    .catch((error: unknown) => {
      shared = null
      throw error
    })
  return shared
}
