import type { SceneJson } from '@waica/engine'

const CAMERA = {
  position: [0, -8] as [number, number],
  zoom: 18,
  limits: { minX: -16, maxX: 16, minY: -16, maxY: 0 },
}

/** A logical 16x16 meadow projected into a 2:1 diamond at render time. */
export const ISOMETRIC_SCENE: SceneJson = {
  waicaScene: 3,
  render: { sort: 'y', projection: 'isometric' },
  camera: {
    ...CAMERA,
    follow: 'Player',
    lookaheadY: 1,
  },
  entities: [
    { name: 'Ground', prefab: 'tiles/ground', position: [0, 0] },
    { name: 'Player', prefab: 'characters/player', position: [8, 8] },
    {
      name: 'Villager',
      prefab: 'characters/villager',
      position: [6, 9],
      overrides: { Interactable: { line: 'The water sparkles, but it blocks the trail.' } },
    },
    {
      name: 'Orc',
      prefab: 'characters/orc',
      position: [10, 10],
      overrides: { Patrol: { axis: 'horizontal', distance: 2.5, speed: 1.5 } },
    },
    { name: 'Crate-1', prefab: 'objects/crate', position: [5, 6] },
    { name: 'Crate-2', prefab: 'objects/crate', position: [10, 4] },
    { name: 'Crate-3', prefab: 'objects/crate', position: [12, 10] },
    { name: 'Tree-1', prefab: 'objects/tree', position: [4, 10] },
    { name: 'Tree-2', prefab: 'objects/tree', position: [10, 12] },
    { name: 'Tree-3', prefab: 'objects/tree', position: [12, 3] },
    { name: 'Rock-1', prefab: 'objects/rock', position: [5, 11] },
    { name: 'Rock-2', prefab: 'objects/rock', position: [9, 4] },
  ],
  ui: ['crate-counter'],
}

/** Blank projects retain the diamond grid and full-map framing. */
export const ISOMETRIC_BLANK_SCENE: SceneJson = {
  waicaScene: 3,
  render: { sort: 'y', projection: 'isometric' },
  camera: { ...CAMERA },
  entities: [],
}
