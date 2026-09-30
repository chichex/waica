import type { PrefabJson } from '@waica/engine'
import { PLAYER_STATE_GRAPH } from '@waica/behaviors'
import { DOG_SPRITE } from './scene-default.js'

/** The dog's jump and landing dust: pale, sinking toward the feet, then spreading sideways. */
const GROUND_DUST = {
  rate: 0,
  lifetime: 0.45,
  positionSpread: [0.35, 0.05],
  velocity: [0, -2.2],
  velocitySpread: [2.8, 0.4],
  gravity: [0, 5],
  space: 'world',
  seed: 9,
  capacity: 48,
  width: 0.18,
  height: 0.18,
  startScale: 1,
  endScale: 2,
  startColor: 0xe6d2b0,
  endColor: 0xa08c70,
  startAlpha: 0.8,
  endAlpha: 0,
  layer: -1,
}

/**
 * The archetype's reusable entity templates, keyed by ref ('characters/slime').
 * Scenes reference these and override per-entity props; the palette derives
 * its pieces from this catalog.
 */
export const PLATFORMER_PREFABS: Record<string, PrefabJson> = {
  'characters/player': {
    waicaPrefab: 1,
    type: 'character',
    components: [
      { type: 'AnimatedSprite', props: DOG_SPRITE },
      { type: 'PlatformerMotor' },
      {
        type: 'StateMachine',
        props: {
          role: 'player',
          initial: PLAYER_STATE_GRAPH.initial,
          states: PLAYER_STATE_GRAPH.states,
        },
      },
      {
        type: 'Hitbox',
        props: { layer: 'player', collidesWith: ['*'], width: 0.9, height: 0.95 },
      },
      { type: 'Respawnable' },
      { type: 'Health', props: { max: 3, invulnerability: 1 } },
      { type: 'OutOfBounds', props: { minY: -8 } },
      // Dust at the ground: a burst-only emitter DustPuffs fires on a
      // ground takeoff and on every grounded landing. Layer -1 puts it
      // behind the dog and under the ground tiles, so the puff rises from
      // the floor instead of covering the body.
      { type: 'ParticleEmitter', props: GROUND_DUST },
      { type: 'DustPuffs', props: { jumpCount: 5, landCount: 12 } },
    ],
  },
  'characters/slime': {
    waicaPrefab: 1,
    type: 'character',
    components: [
      {
        type: 'AnimatedSprite',
        props: {
          texture: 'waica:slime',
          cols: 4,
          rows: 1,
          width: 1.1,
          height: 1.1,
          clips: { idle: { frames: [0, 1, 2, 3], fps: 6 } },
          initialClip: 'idle',
        },
      },
      { type: 'Patrol', props: { distance: 2, speed: 2 } },
      {
        type: 'StateMachine',
        props: {
          role: 'patroller',
          initial: 'walk',
          states: { walk: { clip: 'idle' } },
        },
      },
      {
        type: 'Hitbox',
        props: { layer: 'enemy', collidesWith: ['player'], width: 0.9, height: 0.6 },
      },
      { type: 'Hazard', props: { stompable: true, bounce: 10 } },
      // One point: a stomp still kills it in a single hit, the same as
      // before the damage model existed — now said out loud instead of
      // hardcoded into Hazard. A damage number rises where it was stomped
      // (issue #72); no health bar, which never shows at full health and a
      // one-point slime is never hurt without dying.
      { type: 'Health', props: { max: 1, damageNumber: 'damage-number' } },
    ],
  },
  'objects/coin': {
    waicaPrefab: 1,
    type: 'object',
    components: [
      {
        type: 'AnimatedSprite',
        props: {
          texture: 'waica:coin',
          cols: 4,
          rows: 1,
          width: 0.6,
          height: 0.6,
          clips: { spin: { frames: [0, 1, 2, 3], fps: 8 } },
          initialClip: 'spin',
        },
      },
      {
        type: 'Hitbox',
        props: { layer: 'collectible', collidesWith: ['player'], width: 0.5, height: 0.5 },
      },
      { type: 'Collectible', props: { value: 1 } },
    ],
  },
  'tiles/platform': {
    waicaPrefab: 1,
    type: 'tile',
    components: [
      { type: 'Sprite', props: { width: 3, height: 0.5, color: 0x2a9d8f } },
      { type: 'Solid', props: { width: 3, height: 0.5 } },
    ],
  },
  'tiles/block': {
    waicaPrefab: 1,
    type: 'tile',
    components: [
      { type: 'Sprite', props: { width: 2, height: 2, color: 0x264653 } },
      { type: 'Solid', props: { width: 2, height: 2 } },
    ],
  },
  'tiles/decor': {
    waicaPrefab: 1,
    type: 'tile',
    components: [{ type: 'Sprite', props: { width: 1, height: 1, color: 0x8ecae6 } }],
  },
}
