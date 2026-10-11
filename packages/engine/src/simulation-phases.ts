import { dispatchCollisions as dispatchHitboxCollisions } from './collision-dispatch.js'
import type { Game } from './game.js'
import { dispatchBodyContacts } from './physics-3d/body-contacts.js'
import { dispatchSensorCollisions } from './physics-3d/sensor-dispatch.js'

/**
 * What a Simulation Step does after every component's `onUpdate` (issue #159
 * CA-10), in this order: the 3D physics step (one `world.step()` of the live
 * scene's Rapier world, a no-op in a 2D scene or while the module loads), the
 * solid contacts it produced, the 2D Hitbox triggers, and the 3D sensor
 * triggers. Kept out of `game.ts`, which is at the file-size tier.
 */
export function runSimulationPhases(game: Game): void {
  const world = game.physics.world
  world?.step()
  if (world) dispatchBodyContacts(game, world)
  dispatchHitboxCollisions(game)
  if (world && game.physics.world === world) dispatchSensorCollisions(game, world)
}
