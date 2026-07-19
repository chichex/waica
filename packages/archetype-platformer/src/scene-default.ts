import type { SceneEntityJson, SceneJson } from '@waica/engine'

/** Clips del contrato plataformero, aplicados a la perrita placeholder. */
export const DOG_SPRITE = {
  texture: 'waica:dog',
  cols: 4,
  rows: 4,
  width: 1.4,
  height: 1.4,
  clips: {
    idle: { frames: [0, 1, 2, 3], fps: 5 },
    run: { frames: [4, 5, 6, 7], fps: 10 },
    jump: { frames: [8, 9], fps: 8, loop: false },
    fall: { frames: [12, 13], fps: 8 },
  },
  initialClip: 'idle',
}

function block(name: string, x: number, y: number, w: number, h: number, color: number): SceneEntityJson {
  return {
    name,
    position: [x, y],
    components: [
      { type: 'Sprite', props: { width: w, height: h, color } },
      { type: 'Solid', props: { width: w, height: h } },
    ],
  }
}

function coin(index: number, x: number, y: number): SceneEntityJson {
  return {
    name: `Coin-${index}`,
    position: [x, y],
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
  }
}

function slime(index: number, x: number, y: number, distance: number, speed: number): SceneEntityJson {
  return {
    name: `Slime-${index}`,
    position: [x, y],
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
      { type: 'Patrol', props: { distance, speed } },
      { type: 'Hazard', props: { stompable: true, bounce: 10 } },
    ],
  }
}

/**
 * La escena inicial del arquetipo plataformero, como datos. Es lo que el
 * wizard copia a `src/scenes/main.scene.json` y lo que el editor edita.
 */
export const PLATFORMER_SCENE: SceneJson = {
  waicaScene: 1,
  entities: [
    {
      name: 'Player',
      position: [0, -1],
      components: [
        { type: 'AnimatedSprite', props: DOG_SPRITE },
        { type: 'PlatformerMovement' },
        { type: 'PlatformerAnimator' },
        { type: 'Hitbox', props: { width: 0.9, height: 0.95 } },
        { type: 'Respawnable', props: { killY: -12 } },
        { type: 'CameraFollow' },
      ],
    },
    block('Ground-A', -6, -5, 16, 2, 0x2a9d8f),
    block('Ground-B', 16, -5, 16, 2, 0x2a9d8f),
    block('Platform-1', 5, -2.5, 4, 0.5, 0x2a9d8f),
    block('Platform-2', 9.5, -0.5, 3, 0.5, 0x2a9d8f),
    block('Platform-3', -5.5, -1.5, 3, 0.5, 0x2a9d8f),
    block('Platform-4', 14, 1.5, 3, 0.5, 0x264653),
    block('Wall-Left', -15.5, 0, 2, 12, 0x264653),
    block('Wall-Right', 25.5, 0, 2, 12, 0x264653),
    coin(1, -5.5, -0.5),
    coin(2, -2, -3.2),
    coin(3, 5, -1.7),
    coin(4, 9.5, 0.3),
    coin(5, 14, 2.3),
    coin(6, 19, -3.2),
    slime(1, -9, -3.55, 2, 1.5),
    slime(2, 17, -3.55, 2.5, 2.5),
  ],
}
