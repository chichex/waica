import type { PrefabJson } from '@waica/engine'
import {
  ISO_PLAYER_STATE_GRAPH,
  NPC_STATE_GRAPH,
  PATROLLER_STATE_GRAPH,
} from '@waica/behaviors'

const SHIPPED_DIRECTIONS = ['n', 'ne', 'e', 'se', 's'] as const

function directionalClips(includePlain: boolean): Record<string, { frames: number[]; fps: number }> {
  const clips: Record<string, { frames: number[]; fps: number }> = {}
  SHIPPED_DIRECTIONS.forEach((direction, row) => {
    const first = row * 4
    clips[`idle-${direction}`] = { frames: [first], fps: 2 }
    clips[`walk-${direction}`] = {
      frames: [first + 1, first + 2, first + 3, first + 2],
      fps: 8,
    }
  })
  if (includePlain) {
    clips['idle'] = { frames: [16], fps: 2 }
    clips['walk'] = { frames: [17, 18, 19, 18], fps: 8 }
  }
  return clips
}

function characterSprite(texture: string, includePlain = false) {
  return {
    texture,
    cols: 4,
    rows: 5,
    spacingX: 1,
    spacingY: 1,
    pixelArt: true,
    width: 2,
    height: 2,
    anchorY: 0,
    clips: directionalClips(includePlain),
    initialClip: includePlain ? 'idle' : 'idle-s',
  }
}

export const ISOMETRIC_HERO_SPRITE = characterSprite('waica:iso-hero')

const MAP_WIDTH = 16
const MAP_HEIGHT = 16
const GRASS = 0
const DIRT = 1
const PATH = 2
const WATER = 3
const BORDER = 4

function tileAt(column: number, row: number): number {
  if (column === 0 || row === 0 || column === MAP_WIDTH - 1 || row === MAP_HEIGHT - 1) {
    return BORDER
  }
  if (column >= 11 && column <= 12 && row >= 5 && row <= 6) return WATER
  if (column === 7 || row === 7) return PATH
  if (column >= 2 && column <= 5 && row >= 2 && row <= 4) return DIRT
  return GRASS
}

const GROUND_CELLS = Array.from({ length: MAP_WIDTH * MAP_HEIGHT }, (_, index) =>
  tileAt(index % MAP_WIDTH, Math.floor(index / MAP_WIDTH)),
)

export const ISOMETRIC_PREFABS: Record<string, PrefabJson> = {
  'characters/player': {
    waicaPrefab: 1,
    type: 'character',
    components: [
      { type: 'AnimatedSprite', props: ISOMETRIC_HERO_SPRITE },
      { type: 'IsoMotor' },
      {
        type: 'StateMachine',
        props: {
          role: 'player',
          initial: ISO_PLAYER_STATE_GRAPH.initial,
          states: ISO_PLAYER_STATE_GRAPH.states,
        },
      },
      { type: 'Hitbox', props: { width: 0.8, height: 0.8 } },
      { type: 'Respawnable' },
      { type: 'Health', props: { max: 3, invulnerability: 1 } },
    ],
  },
  'characters/villager': {
    waicaPrefab: 1,
    type: 'character',
    components: [
      {
        type: 'AnimatedSprite',
        props: characterSprite('waica:iso-villager', true),
      },
      {
        type: 'StateMachine',
        props: {
          role: 'npc',
          initial: NPC_STATE_GRAPH.initial,
          states: NPC_STATE_GRAPH.states,
        },
      },
      { type: 'Interactable', props: { line: 'Welcome to Diamond Meadow!', radius: 1.5 } },
      { type: 'Solid', props: { width: 0.8, height: 0.6 } },
    ],
  },
  'characters/orc': {
    waicaPrefab: 1,
    type: 'character',
    components: [
      {
        type: 'AnimatedSprite',
        props: {
          ...characterSprite('waica:iso-orc', true),
          initialClip: 'walk',
        },
      },
      { type: 'Patrol', props: { axis: 'horizontal', distance: 2, speed: 2 } },
      {
        type: 'StateMachine',
        props: {
          role: 'patroller',
          initial: PATROLLER_STATE_GRAPH.initial,
          states: PATROLLER_STATE_GRAPH.states,
        },
      },
      { type: 'Hitbox', props: { width: 0.8, height: 0.7 } },
      { type: 'Hazard', props: { stompable: false, contactDamage: 1 } },
    ],
  },
  'objects/crate': {
    waicaPrefab: 1,
    type: 'object',
    components: [
      {
        type: 'Sprite',
        props: {
          texture: 'waica:iso-crate',
          pixelArt: true,
          width: 1,
          height: 1,
          anchorY: 0,
        },
      },
      { type: 'Hitbox', props: { width: 0.6, height: 0.6 } },
      { type: 'Collectible', props: { value: 1 } },
    ],
  },
  'objects/tree': {
    waicaPrefab: 1,
    type: 'object',
    components: [
      {
        type: 'Sprite',
        props: {
          texture: 'waica:iso-tree',
          pixelArt: true,
          width: 2,
          height: 47 / 16,
          anchorY: 0,
        },
      },
      { type: 'Solid', props: { width: 0.8, height: 0.6 } },
    ],
  },
  'objects/rock': {
    waicaPrefab: 1,
    type: 'object',
    components: [
      {
        type: 'Sprite',
        props: {
          texture: 'waica:iso-rock',
          pixelArt: true,
          width: 1,
          height: 1,
          anchorY: 0,
        },
      },
      { type: 'Solid', props: { width: 0.8, height: 0.6 } },
    ],
  },
  'tiles/ground': {
    waicaPrefab: 1,
    type: 'tile',
    components: [
      {
        type: 'Tilemap',
        props: {
          texture: 'waica:iso-ground',
          cols: 5,
          rows: 1,
          spacingX: 1,
          spacingY: 1,
          cellWidth: 64,
          cellHeight: 32,
          pixelArt: true,
          mapWidth: MAP_WIDTH,
          mapHeight: MAP_HEIGHT,
          cellSize: 1,
          cells: GROUND_CELLS,
          solidTiles: [WATER, BORDER],
          layer: -2,
        },
      },
    ],
  },
}
