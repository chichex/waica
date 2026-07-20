import type { SceneJson } from '@waica/engine'

/** Clips from the platformer animation contract, applied to the placeholder dog. */
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

/**
 * The platformer archetype's starting scene, as data: prefab refs plus the
 * per-entity overrides that differ from the prefab. This is what the wizard
 * copies into `src/scenes/main.scene.json` and what the editor edits.
 */
export const PLATFORMER_SCENE: SceneJson = {
  waicaScene: 2,
  entities: [
    { name: 'Player', prefab: 'characters/player', position: [0, -1] },
    {
      name: 'Ground-A',
      prefab: 'tiles/platform',
      position: [-6, -5],
      overrides: { Sprite: { width: 16, height: 2 }, Solid: { width: 16, height: 2 } },
    },
    {
      name: 'Ground-B',
      prefab: 'tiles/platform',
      position: [16, -5],
      overrides: { Sprite: { width: 16, height: 2 }, Solid: { width: 16, height: 2 } },
    },
    {
      name: 'Platform-1',
      prefab: 'tiles/platform',
      position: [5, -2.5],
      overrides: { Sprite: { width: 4 }, Solid: { width: 4 } },
    },
    { name: 'Platform-2', prefab: 'tiles/platform', position: [9.5, -0.5] },
    { name: 'Platform-3', prefab: 'tiles/platform', position: [-5.5, -1.5] },
    {
      name: 'Platform-4',
      prefab: 'tiles/block',
      position: [14, 1.5],
      overrides: { Sprite: { width: 3, height: 0.5 }, Solid: { width: 3, height: 0.5 } },
    },
    {
      name: 'Wall-Left',
      prefab: 'tiles/block',
      position: [-15.5, 0],
      overrides: { Sprite: { height: 12 }, Solid: { height: 12 } },
    },
    {
      name: 'Wall-Right',
      prefab: 'tiles/block',
      position: [25.5, 0],
      overrides: { Sprite: { height: 12 }, Solid: { height: 12 } },
    },
    { name: 'Coin-1', prefab: 'objects/coin', position: [-5.5, -0.5] },
    { name: 'Coin-2', prefab: 'objects/coin', position: [-2, -3.2] },
    { name: 'Coin-3', prefab: 'objects/coin', position: [5, -1.7] },
    { name: 'Coin-4', prefab: 'objects/coin', position: [9.5, 0.3] },
    { name: 'Coin-5', prefab: 'objects/coin', position: [14, 2.3] },
    { name: 'Coin-6', prefab: 'objects/coin', position: [19, -3.2] },
    {
      name: 'Slime-1',
      prefab: 'characters/slime',
      position: [-9, -3.55],
      overrides: { Patrol: { speed: 1.5 } },
    },
    {
      name: 'Slime-2',
      prefab: 'characters/slime',
      position: [17, -3.55],
      overrides: { Patrol: { distance: 2.5, speed: 2.5 } },
    },
  ],
  ui: ['coin-counter'],
}
