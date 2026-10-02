import { Component, Hitbox, type Game, type SceneEntityJson, type SceneRegistry } from '@waica/engine'
import type { ScenarioPlan } from './scenarios.ts'

export const BULLET_LIFETIME_STEPS = 90
const BULLET_SPEED = 5
const BULLET_SIZE = 0.12
const BULLET_HELL_STEPS = 600

/** Four emitters spread over the view, like enemies firing rings. */
export const EMITTERS: ReadonlyArray<readonly [number, number]> = [
  [-5, 2],
  [5, 2],
  [-5, -2],
  [5, -2],
]

/**
 * Velocity of bullet `index` of the `perStep` spawned at `step`: rings
 * spread evenly over the emitters, each ring rotated a little per step
 * (a spiral), so the pattern is deterministic and covers the view.
 */
export function bulletVelocity(step: number, index: number, perStep: number): [number, number] {
  const angle = (2 * Math.PI * index) / perStep + step * 0.13
  return [Math.cos(angle) * BULLET_SPEED, Math.sin(angle) * BULLET_SPEED]
}

/** Moves in a straight line and destroys itself after its lifetime, like a bullet. */
export class BenchBullet extends Component {
  static override componentName = 'BenchBullet'
  vx = 0
  vy = 0
  age = 0
  hits = 0

  override onUpdate(dt: number): void {
    if (!this.entity.alive) return
    this.entity.position.x += this.vx * dt
    this.entity.position.y += this.vy * dt
    if (++this.age >= BULLET_LIFETIME_STEPS) this.entity.destroy()
  }

  override onCollide(): void {
    this.hits++
  }
}

interface Category {
  layer: string
  collidesWith: string[]
}

function target(name: string, position: readonly [number, number], category: Category): SceneEntityJson {
  return {
    name,
    position: [position[0], position[1]],
    components: [{ type: 'Hitbox', props: { ...category, width: 0.6, height: 0.6 } }],
  }
}

/**
 * `perStep` bullets per Simulation Step, each with a Sprite, a Hitbox that
 * reports overlaps with the player, and a moving component; steady state is
 * perStep × BULLET_LIFETIME_STEPS live bullets. Bullet-to-bullet pairs still
 * go through the broadphase (masks filter them before the narrowphase).
 */
export function bulletHell(perStep: number, texture: string, components: SceneRegistry['components']): ScenarioPlan {
  const perStepFn = (game: Game, step: number): void => {
    for (let i = 0; i < perStep; i++) {
      const emitter = EMITTERS[i % EMITTERS.length]
      if (!emitter) continue
      const entity = game.spawnPrefab('bench/hell-bullet', { position: [emitter[0], emitter[1]] })
      const bullet = entity?.get(BenchBullet)
      if (!bullet) continue
      ;[bullet.vx, bullet.vy] = bulletVelocity(step, i, perStep)
    }
  }
  const registry: SceneRegistry = {
    components: { ...components, Hitbox, BenchBullet },
    prefabs: {
      'bench/hell-bullet': {
        waicaPrefab: 1,
        type: 'object',
        components: [
          { type: 'Sprite', props: { texture, width: BULLET_SIZE, height: BULLET_SIZE } },
          { type: 'Hitbox', props: { layer: 'bullet', collidesWith: ['player'], width: BULLET_SIZE, height: BULLET_SIZE } },
          { type: 'BenchBullet', props: {} },
        ],
      },
    },
  }
  const entities: SceneEntityJson[] = [
    target('Player', [0, -3], { layer: 'player', collidesWith: ['bullet'] }),
    ...EMITTERS.map((position, i) => target(`Enemy-${i}`, position, { layer: 'enemy', collidesWith: [] })),
  ]
  return {
    scene: { waicaScene: 3, entities },
    registry,
    textures: [texture],
    steps: BULLET_HELL_STEPS,
    perStep: perStepFn,
  }
}
