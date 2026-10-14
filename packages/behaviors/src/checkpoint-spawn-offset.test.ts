import { expect, it } from 'vitest'
import { Entity, StateMachine, type Game } from '@waica/engine'
import { Checkpoint } from './checkpoint.js'
import { Respawnable } from './respawnable.js'

// Checkpoint.spawnOffset: in 3D it turns and scales with the entity, like a
// Collider's offset; in 2D it is in world units, like a Hitbox's or a
// Solid's offset, whatever the node's scale or rotation.

/** A bare game of a space: enough for entities to hold components and for Checkpoint to see its siblings. */
function gameOf(space: '2d' | '3d'): Game {
  const entities: Entity[] = []
  return { space, entities, applyParamOverrides: () => undefined } as unknown as Game
}

/** A checkpoint at (3, 1, 0) scaled 2 and turned a quarter (about y in 3D, z in 2D), with `spawnOffset`. */
function turnedCheckpoint(game: Game, spawnOffset: [number, number, number]): Checkpoint {
  const entity = new Entity(game, 'Banner')
  entity.position.set(3, 1, 0)
  entity.scale.set(2, 2, 2)
  if (game.space === '3d') entity.node.rotation.y = Math.PI / 2
  else entity.node.rotation.z = Math.PI / 2
  game.entities.push(entity)
  return entity.add(Checkpoint, { spawnOffset })
}

/** A player at the origin with a Respawnable: the role is what makes it the player. */
function playerOf(game: Game): Entity {
  const player = new Entity(game, 'Player')
  const machine = new StateMachine()
  machine.role = 'player'
  player.components.push(machine)
  player.add(Respawnable)
  game.entities.push(player)
  return player
}

/** Where the player comes back after touching the checkpoint. */
function respawnedAt(game: Game, spawnOffset: [number, number, number]): [number, number, number] {
  const checkpoint = turnedCheckpoint(game, spawnOffset)
  const player = playerOf(game)
  checkpoint.onCollide(player)
  player.position.set(-5, -5, -5)
  player.get(Respawnable)?.respawn()
  return [player.position.x, player.position.y, player.position.z]
}

const close = ([x, y, z]: [number, number, number]): number[] => [x, y, z].map((value) => Math.round(value * 1e6) / 1e6 || 0)

it('turns and scales the spawnOffset with a 3D checkpoint: local +z of a quarter turn is world +x, twice as far', () => {
  expect(close(respawnedAt(gameOf('3d'), [0, 0, 1.5]))).toEqual([6, 1, 0])
  expect(close(respawnedAt(gameOf('3d'), [0, 0.5, 0]))).toEqual([3, 2, 0])
})

it('adds the spawnOffset in world units in 2D, like a Hitbox offset: the node’s scale and rotation leave it alone', () => {
  expect(close(respawnedAt(gameOf('2d'), [0, 1, 0]))).toEqual([3, 2, 0])
  expect(close(respawnedAt(gameOf('2d'), [1.5, 0, 0]))).toEqual([4.5, 1, 0])
})

it('respawns at the checkpoint itself with the default spawnOffset, in both spaces', () => {
  expect(close(respawnedAt(gameOf('3d'), [0, 0, 0]))).toEqual([3, 1, 0])
  expect(close(respawnedAt(gameOf('2d'), [0, 0, 0]))).toEqual([3, 1, 0])
})
