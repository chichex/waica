import { AnimatedSprite, Sprite, type Entity, type Game, type SceneEntityJson, type SceneJson, type SceneRegistry } from '@waica/engine'
import type { ScenarioName } from '../results.ts'
import { SHEET_FRAMES, sheetTexture, squareTexture } from './fixture-art.ts'

/** One deterministic workload: a scene, how many Simulation Steps to run, and per-step work. */
export interface ScenarioPlan {
  scene: SceneJson
  registry: SceneRegistry
  /** Every texture the scenario draws, preloaded so no load lands mid-run. */
  textures: string[]
  steps: number
  /** Runs inside every Simulation Step (game.onUpdate), `step` counting from 1. */
  perStep?: (game: Game, step: number) => void
}

const STATIC_SPRITES = 1000
const ANIMATED_SPRITES = 500
const CHURN_PER_STEP = 10
const CHURN_LIFETIME_STEPS = 30
const CHURN_STEPS = 600
const CHURN_SLOTS = CHURN_PER_STEP * CHURN_LIFETIME_STEPS

/** Slot `index` of `count` cells laid out row-major inside the default 10-unit-high view. */
export function gridPosition(index: number, count: number): [number, number] {
  const cols = Math.ceil(Math.sqrt((count * 16) / 9))
  const rows = Math.ceil(count / cols)
  const col = index % cols
  const row = Math.floor(index / cols)
  const x = -8 + (16 * (col + 0.5)) / cols
  const y = 4.5 - (9 * (row + 0.5)) / rows
  return [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]
}

function spriteEntity(name: string, position: [number, number], texture: string): SceneEntityJson {
  return {
    name,
    position,
    components: [{ type: 'Sprite', props: { texture, width: 0.25, height: 0.25 } }],
  }
}

const REGISTRY_COMPONENTS: SceneRegistry['components'] = { Sprite, AnimatedSprite }

function staticSprites(): ScenarioPlan {
  const texture = squareTexture()
  const entities = Array.from({ length: STATIC_SPRITES }, (_, i) =>
    spriteEntity(`Sprite-${i}`, gridPosition(i, STATIC_SPRITES), texture),
  )
  return {
    scene: { waicaScene: 3, entities },
    registry: { components: REGISTRY_COMPONENTS },
    textures: [texture],
    steps: 60,
  }
}

function spawnChurn(): ScenarioPlan {
  const texture = squareTexture()
  const live = new Map<number, Entity[]>()
  const perStep = (game: Game, step: number): void => {
    for (const entity of live.get(step - CHURN_LIFETIME_STEPS) ?? []) entity.destroy()
    live.delete(step - CHURN_LIFETIME_STEPS)
    const spawned: Entity[] = []
    for (let i = 0; i < CHURN_PER_STEP; i++) {
      const slot = (step * CHURN_PER_STEP + i) % CHURN_SLOTS
      const entity = game.spawnPrefab('bench/bullet', { position: gridPosition(slot, CHURN_SLOTS) })
      if (entity) spawned.push(entity)
    }
    live.set(step, spawned)
  }
  const registry: SceneRegistry = {
    components: REGISTRY_COMPONENTS,
    prefabs: {
      'bench/bullet': {
        waicaPrefab: 1,
        type: 'object',
        components: [{ type: 'Sprite', props: { texture, width: 0.25, height: 0.25 } }],
      },
    },
  }
  return { scene: { waicaScene: 3, entities: [] }, registry, textures: [texture], steps: CHURN_STEPS, perStep }
}

function animatedSprites(): ScenarioPlan {
  const texture = sheetTexture()
  const props = {
    texture,
    cols: SHEET_FRAMES,
    rows: 1,
    width: 0.3,
    height: 0.3,
    clips: { run: { frames: [0, 1, 2, 3], fps: 8 } },
    initialClip: 'run',
  }
  const entities = Array.from({ length: ANIMATED_SPRITES }, (_, i) => ({
    name: `Animated-${i}`,
    position: gridPosition(i, ANIMATED_SPRITES),
    components: [{ type: 'AnimatedSprite', props }],
  }))
  return {
    scene: { waicaScene: 3, entities },
    registry: { components: REGISTRY_COMPONENTS },
    textures: [texture],
    steps: 60,
  }
}

export const SCENARIO_PLANS: Record<ScenarioName, () => ScenarioPlan> = {
  'static-sprites': staticSprites,
  'spawn-churn': spawnChurn,
  'animated-sprites': animatedSprites,
}
