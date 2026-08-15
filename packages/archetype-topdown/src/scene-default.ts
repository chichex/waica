import type { SceneJson } from '@waica/engine'

/**
 * Clips matching the top-down animation contract, applied to the hero
 * sheet: 3×3 grid, one row per facing (s/n/e), columns idle/walk-A/walk-B.
 * West clips come from mirroring east at runtime (the contract's fallback).
 * Cells sit 1px apart — transparent gutters keep frame-edge sampling
 * (MSAA extrapolation, linear filtering) from bleeding a neighbour in.
 */
export const HERO_SPRITE = {
  texture: 'waica:hero',
  cols: 3,
  rows: 3,
  spacingX: 1,
  spacingY: 1,
  width: 1.2,
  height: 1.2,
  clips: {
    'idle-s': { frames: [0], fps: 2 },
    'idle-n': { frames: [3], fps: 2 },
    'idle-e': { frames: [6], fps: 2 },
    'walk-s': { frames: [1, 0, 2, 0], fps: 8 },
    'walk-n': { frames: [4, 3, 5, 3], fps: 8 },
    'walk-e': { frames: [7, 6, 8, 6], fps: 8 },
  },
  initialClip: 'idle-s',
}

/**
 * The top-down archetype's starting scene: a village clearing that
 * exercises everything the genre adds — y-sorted occlusion (walk behind
 * and in front of the trees), the two-axis camera (vertical lookahead),
 * an NPC to interact with, a patrolling enemy and potions to collect.
 */
export const TOPDOWN_SCENE: SceneJson = {
  waicaScene: 3,
  render: { sort: 'y' },
  camera: {
    position: [0, 0],
    zoom: 12,
    follow: 'Player',
    lookaheadY: 1,
    // Clamped to the meadow: 22×14 world units centered on the origin.
    limits: { minX: -11, maxX: 11, minY: -7, maxY: 7 },
  },
  entities: [
    { name: 'Player', prefab: 'characters/player', position: [0, -2] },
    {
      name: 'Meadow',
      prefab: 'tiles/meadow',
      position: [0, 0],
      overrides: { Sprite: { width: 22, height: 14 } },
    },
    { name: 'Path-1', prefab: 'tiles/path', position: [-2, 0] },
    { name: 'Path-2', prefab: 'tiles/path', position: [-1, 0] },
    { name: 'Path-3', prefab: 'tiles/path', position: [0, 0] },
    { name: 'Path-4', prefab: 'tiles/path', position: [1, 0] },
    { name: 'Path-5', prefab: 'tiles/path', position: [2, 0] },
    { name: 'Path-6', prefab: 'tiles/path', position: [0, -1] },
    { name: 'Path-7', prefab: 'tiles/path', position: [0, 1] },
    { name: 'Grass-1', prefab: 'tiles/grass', position: [-4, 1] },
    { name: 'Grass-2', prefab: 'tiles/grass', position: [1, 2] },
    { name: 'Grass-3', prefab: 'tiles/grass', position: [5, -2] },
    { name: 'Grass-4', prefab: 'tiles/grass', position: [-8, 3] },
    { name: 'Grass-5', prefab: 'tiles/grass', position: [8, -3] },
    { name: 'Grass-6', prefab: 'tiles/grass', position: [-1, -4] },
    { name: 'Water-1', prefab: 'tiles/water', position: [-7, -2] },
    { name: 'Water-2', prefab: 'tiles/water', position: [-6, -2] },
    { name: 'Water-3', prefab: 'tiles/water', position: [-5, -2] },
    { name: 'Water-4', prefab: 'tiles/water', position: [-7, -3] },
    { name: 'Water-5', prefab: 'tiles/water', position: [-6, -3] },
    { name: 'Water-6', prefab: 'tiles/water', position: [-5, -3] },
    // Trees sit in open ground so walking above/below them flips the
    // draw order — the y-sort showcase.
    { name: 'Tree-1', prefab: 'tiles/tree', position: [-6, 3] },
    { name: 'Tree-2', prefab: 'tiles/tree', position: [-2, 3.5] },
    { name: 'Tree-3', prefab: 'tiles/tree', position: [2, 4] },
    { name: 'Tree-4', prefab: 'tiles/tree', position: [6, 3] },
    { name: 'Tree-5', prefab: 'tiles/tree', position: [4, -1] },
    { name: 'Tree-6', prefab: 'tiles/tree', position: [-4, -3] },
    { name: 'Fence-1', prefab: 'tiles/fence', position: [5, -4] },
    { name: 'Fence-2', prefab: 'tiles/fence', position: [6, -4] },
    { name: 'Fence-3', prefab: 'tiles/fence', position: [7, -4] },
    {
      name: 'Villager',
      prefab: 'characters/villager',
      position: [3, 1],
      overrides: { Interactable: { line: 'Lovely day in Waica Village!' } },
    },
    {
      name: 'Blob',
      prefab: 'characters/blob',
      position: [-2, -4],
      overrides: { Patrol: { distance: 2.5, speed: 1.5 } },
    },
    { name: 'Potion-1', prefab: 'objects/potion', position: [-3, 2] },
    { name: 'Potion-2', prefab: 'objects/potion', position: [7, 1] },
    { name: 'Potion-3', prefab: 'objects/potion', position: [-6, 1] },
    { name: 'Potion-4', prefab: 'objects/potion', position: [2, -4] },
  ],
  ui: ['potion-counter'],
}

/**
 * The blank-start variant: same framing and y-sorted rendering, zero
 * entities. No `follow` because there is no Player yet — the editor's
 * palette places the first one.
 */
export const TOPDOWN_BLANK_SCENE: SceneJson = {
  waicaScene: 3,
  render: { sort: 'y' },
  camera: { position: [0, 0], zoom: 12 },
  entities: [],
}
