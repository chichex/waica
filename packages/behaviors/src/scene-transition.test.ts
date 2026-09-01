import { describe, expect, it, vi } from 'vitest'
import { StateMachine, type Component, type Entity, type Game } from '@waica/engine'
import { Interactable } from './interactable'
import { SceneTransition } from './scene-transition'

interface StubEntity extends Entity {
  addStub(component: Component): void
}

function makeGame(): Game {
  return { loadSceneByName: vi.fn() } as unknown as Game
}

function makeEntity(game: Game, name: string): StubEntity {
  const components: Component[] = []
  const entity = {
    name,
    game,
    alive: true,
    get(Class: new () => Component) {
      return components.find((component) => component instanceof Class)
    },
    has(Class: new () => Component) {
      return components.some((component) => component instanceof Class)
    },
    addStub(component: Component) {
      component.entity = entity as unknown as Entity
      component.game = game
      components.push(component)
    },
  } as unknown as StubEntity
  return entity
}

function playerEntity(game: Game): Entity {
  const player = makeEntity(game, 'Player')
  const machine = new StateMachine()
  machine.role = 'player'
  player.addStub(machine)
  return player
}

describe('SceneTransition', () => {
  it('fires on overlap with the player by default (CA-10)', () => {
    const game = makeGame()
    const door = makeEntity(game, 'Door')
    const transition = new SceneTransition()
    transition.scene = 'cave'
    door.addStub(transition)

    transition.onCollide?.(playerEntity(game))

    expect(game.loadSceneByName).toHaveBeenCalledWith('cave')
  })

  it('ignores an overlap from a non-player entity', () => {
    const game = makeGame()
    const door = makeEntity(game, 'Door')
    const transition = new SceneTransition()
    transition.scene = 'cave'
    door.addStub(transition)

    transition.onCollide?.(makeEntity(game, 'Rock'))

    expect(game.loadSceneByName).not.toHaveBeenCalled()
  })

  it('does not fire on overlap when trigger is "interact"', () => {
    const game = makeGame()
    const door = makeEntity(game, 'Door')
    const transition = new SceneTransition()
    transition.scene = 'cave'
    transition.trigger = 'interact'
    door.addStub(new Interactable())
    door.addStub(transition)

    transition.onCollide?.(playerEntity(game))

    expect(game.loadSceneByName).not.toHaveBeenCalled()
  })

  it('fires from a sibling Interactable interaction when trigger is "interact" (CA-11)', () => {
    const game = makeGame()
    const door = makeEntity(game, 'Door')
    const transition = new SceneTransition()
    transition.scene = 'cave'
    transition.trigger = 'interact'
    door.addStub(new Interactable())
    door.addStub(transition)

    transition.onInteract?.(playerEntity(game))

    expect(game.loadSceneByName).toHaveBeenCalledWith('cave')
  })

  it('does not fire from an interaction when trigger is "overlap"', () => {
    const game = makeGame()
    const door = makeEntity(game, 'Door')
    const transition = new SceneTransition()
    transition.scene = 'cave'
    door.addStub(transition)

    transition.onInteract?.(playerEntity(game))

    expect(game.loadSceneByName).not.toHaveBeenCalled()
  })

  it('warns at ready time with trigger "interact" and no sibling Interactable (CA-11)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const game = makeGame()
    const door = makeEntity(game, 'Door')
    const transition = new SceneTransition()
    transition.trigger = 'interact'
    door.addStub(transition)

    transition.onReady?.()

    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toContain('Door')
    warn.mockRestore()
  })

  it('does not warn at ready time in overlap mode, or with the sibling present', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const game = makeGame()

    const doorA = makeEntity(game, 'DoorA')
    const overlapTransition = new SceneTransition()
    doorA.addStub(overlapTransition)
    overlapTransition.onReady?.()

    const doorB = makeEntity(game, 'DoorB')
    const interactTransition = new SceneTransition()
    interactTransition.trigger = 'interact'
    doorB.addStub(new Interactable())
    doorB.addStub(interactTransition)
    interactTransition.onReady?.()

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
