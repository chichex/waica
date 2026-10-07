import type { PrefabJson, SceneJson } from '@waica/engine'

/** The dungeon's ground: tiles of `tiles/ground` (dirt floor, border walls), 10×10. */
export const ISOMETRIC_DUNGEON_MAP_WIDTH = 10
export const ISOMETRIC_DUNGEON_MAP_HEIGHT = 10
const DIRT = 1
const BORDER = 4
/** The wall between the torch-lit hall and the dark chamber, open at its far end. */
const WALL_COLUMN = 5
const WALL_GAP_ROW = 8

function dungeonTileAt(column: number, row: number): number {
  const width = ISOMETRIC_DUNGEON_MAP_WIDTH
  const height = ISOMETRIC_DUNGEON_MAP_HEIGHT
  if (column === 0 || row === 0 || column === width - 1 || row === height - 1) return BORDER
  if (column === WALL_COLUMN && row !== WALL_GAP_ROW) return BORDER
  return DIRT
}

export const ISOMETRIC_DUNGEON_GROUND_CELLS = Array.from(
  { length: ISOMETRIC_DUNGEON_MAP_WIDTH * ISOMETRIC_DUNGEON_MAP_HEIGHT },
  (_, index) =>
    dungeonTileAt(index % ISOMETRIC_DUNGEON_MAP_WIDTH, Math.floor(index / ISOMETRIC_DUNGEON_MAP_WIDTH)),
)

/**
 * A torch (issue #78): a warm Light that the walls stop, and an Emissive
 * flame that stays bright whatever the Ambient Light. No art of its own: the
 * flame is a flat circle.
 */
export const ISOMETRIC_TORCH_PREFAB: PrefabJson = {
  waicaPrefab: 1,
  type: 'object',
  components: [
    {
      type: 'Sprite',
      props: {
        shape: 'circle',
        color: 0xffa53a,
        width: 0.3,
        height: 0.45,
        anchorY: 0,
        offsetY: 0.3,
        emissive: true,
      },
    },
    {
      type: 'Light',
      props: { radius: 4.5, color: 0xffb366, intensity: 1, softness: 0.25 },
    },
  ],
}

/**
 * The third demo scene (issue #78 CA-14): a dark dungeon reached from the
 * cave. Two torches light the hall; the wall down its middle keeps the
 * chamber behind it dark, and a vignette closes the frame. A fixed camera
 * frames the whole room.
 */
export const ISOMETRIC_DUNGEON_SCENE: SceneJson = {
  waicaScene: 3,
  render: {
    sort: 'y',
    projection: 'isometric',
    lighting: { ambient: { color: '#5a6a9a', intensity: 0.3 } },
    post: { vignette: { intensity: 0.45, radius: 0.35 } },
  },
  camera: { position: [0, -5], zoom: 12 },
  entities: [
    {
      name: 'Ground',
      prefab: 'tiles/ground',
      position: [0, 0],
      overrides: {
        Tilemap: {
          mapWidth: ISOMETRIC_DUNGEON_MAP_WIDTH,
          mapHeight: ISOMETRIC_DUNGEON_MAP_HEIGHT,
          cells: ISOMETRIC_DUNGEON_GROUND_CELLS,
        },
      },
    },
    { name: 'Player', prefab: 'characters/player', position: [2, 8] },
    { name: 'Torch-1', prefab: 'objects/torch', position: [3.5, 2.5] },
    { name: 'Torch-2', prefab: 'objects/torch', position: [3.5, 6.5] },
    {
      name: 'Door',
      prefab: 'objects/door',
      position: [1.5, 1.5],
      overrides: { SceneTransition: { scene: 'cave' } },
    },
  ],
  ui: ['health'],
}
