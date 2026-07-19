import type { PrefabJson } from '@waica/engine'
import { DOG_SPRITE } from './scene-default'

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
      { type: 'PlatformerMovement' },
      { type: 'PlatformerAnimator' },
      { type: 'Hitbox', props: { width: 0.9, height: 0.95 } },
      { type: 'Respawnable', props: { killY: -12 } },
      { type: 'CameraFollow' },
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
      { type: 'Hitbox', props: { width: 0.9, height: 0.6 } },
      { type: 'Patrol', props: { distance: 2, speed: 2 } },
      { type: 'Hazard', props: { stompable: true, bounce: 10 } },
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
      { type: 'Hitbox', props: { width: 0.5, height: 0.5 } },
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
  'ui/coin-counter': {
    waicaPrefab: 1,
    type: 'ui',
    components: [{ type: 'HudCounter', props: { icon: '🪙', anchor: 'top-left' } }],
  },
}
