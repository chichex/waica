// Test support for the 3D physics tests, excluded from builds: a Game over the
// real deterministic Rapier (through the GameOptions.physics seam), a scene
// of Colliders and RigidBodies loaded and paused behind a Runtime Bridge, and
// whole Simulation Steps taken through that bridge.
import { Collider } from './components/collider.js'
import { RigidBody } from './components/rigid-body.js'
import type { Game, GameOptions } from './game.js'
import type { PhysicsWorld } from './physics-3d/physics-world.js'
import type { RuntimeBridge } from './runtime-bridge.js'
import type { RuntimeSnapshot } from './runtime-inspection.js'
import { loadScene, type SceneEntityJson, type SceneRegistry } from './scene.js'
import type { SceneSimulationJson } from './scene-simulation.js'
import { ready3dGame, registryOf, runtimeBridgeOf, scene3d } from './test-game-3d.js'

export interface PhysicsFixture {
  game: Game
  bridge: RuntimeBridge
  registry: SceneRegistry
  /** Takes `frames` whole Simulation Steps (1/60 s each). */
  step: (frames: number) => void
  snapshot: () => RuntimeSnapshot
}

export interface PhysicsFixtureOptions {
  /** Components beyond Collider and RigidBody the scene may name. */
  components?: SceneRegistry['components']
  simulation?: SceneSimulationJson
  /** Overrides of the Game's options (a `physics` backend of the test's own, say). */
  game?: Partial<GameOptions>
  /** Wait for the Rapier module before returning (the default); false returns while it may still be loading. */
  settle?: boolean
}

/** A 3D scene with `entities` loaded in a paused Game, its physics world ready. */
export async function physicsFixture(
  entities: SceneEntityJson[],
  options: PhysicsFixtureOptions = {},
): Promise<PhysicsFixture> {
  const { game } = await ready3dGame(undefined, undefined, options.game)
  const registry = registryOf({ Collider, RigidBody, ...options.components })
  const bridge = runtimeBridgeOf(game)
  loadScene(game, { ...scene3d(entities), ...(options.simulation ? { simulation: options.simulation } : {}) }, registry)
  if (options.settle !== false) await game.assets.ready()
  return {
    game,
    bridge,
    registry,
    step: (frames) => {
      bridge.control({ operation: 'step', frames })
    },
    snapshot: () => bridge.inspect(),
  }
}

/** A static floor whose top face is the plane y = 0. */
export const FLOOR: SceneEntityJson = {
  name: 'Floor',
  position: [0, -0.5, 0],
  components: [{ type: 'Collider', props: { shape: 'box', size: [40, 1, 40] } }],
}

/** A unit dynamic box at height `y` (its centre). */
export function crate(name: string, y: number): SceneEntityJson {
  return { name, position: [0, y, 0], components: [{ type: 'Collider' }, { type: 'RigidBody' }] }
}

/** The live world of a Game, or a failure naming what the test expected. */
export function worldOf(game: Game): PhysicsWorld {
  const world = game.physics.world
  if (!world) throw new Error('expected the Game to have a physics world')
  return world
}
