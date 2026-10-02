import { AnimatedSprite, Sprite, type Entity, type Game, type SceneEntityJson, type SceneJson, type SceneRegistry } from '@waica/engine'
import { SWEEP, cellSize, gridShape, type ScenarioKind, type ScenarioName } from '../sweep.ts'
import { bulletHell } from './bullet-hell.ts'
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

const STILL_STEPS = 60
const CHURN_LIFETIME_STEPS = 30
const CHURN_STEPS = 600

/** Slot `index` of `count` cells laid out row-major inside the default 10-unit-high view. */
export function gridPosition(index: number, count: number): [number, number] {
  const { cols, rows } = gridShape(count)
  const col = index % cols
  const row = Math.floor(index / cols)
  const x = -8 + (16 * (col + 0.5)) / cols
  const y = 4.5 - (9 * (row + 0.5)) / rows
  return [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]
}

function spriteProps(texture: string, count: number): Record<string, unknown> {
  const size = cellSize(count)
  return { texture, width: size, height: size }
}

const REGISTRY_COMPONENTS: SceneRegistry['components'] = { Sprite, AnimatedSprite }

function staticSprites(n: number): ScenarioPlan {
  const texture = squareTexture()
  const props = spriteProps(texture, n)
  const entities: SceneEntityJson[] = Array.from({ length: n }, (_, i) => ({
    name: `Sprite-${i}`,
    position: gridPosition(i, n),
    components: [{ type: 'Sprite', props }],
  }))
  return {
    scene: { waicaScene: 3, entities },
    registry: { components: REGISTRY_COMPONENTS },
    textures: [texture],
    steps: STILL_STEPS,
  }
}

/** `perStep` spawns per Simulation Step, each destroyed CHURN_LIFETIME_STEPS later. */
function spawnChurn(perStepCount: number): ScenarioPlan {
  const texture = squareTexture()
  const slots = perStepCount * CHURN_LIFETIME_STEPS
  const live = new Map<number, Entity[]>()
  const perStep = (game: Game, step: number): void => {
    for (const entity of live.get(step - CHURN_LIFETIME_STEPS) ?? []) entity.destroy()
    live.delete(step - CHURN_LIFETIME_STEPS)
    const spawned: Entity[] = []
    for (let i = 0; i < perStepCount; i++) {
      const slot = (step * perStepCount + i) % slots
      const entity = game.spawnPrefab('bench/bullet', { position: gridPosition(slot, slots) })
      if (entity) spawned.push(entity)
    }
    live.set(step, spawned)
  }
  const registry: SceneRegistry = {
    components: REGISTRY_COMPONENTS,
    prefabs: {
      'bench/bullet': { waicaPrefab: 1, type: 'object', components: [{ type: 'Sprite', props: spriteProps(texture, slots) }] },
    },
  }
  return { scene: { waicaScene: 3, entities: [] }, registry, textures: [texture], steps: CHURN_STEPS, perStep }
}

function animatedSprites(n: number): ScenarioPlan {
  const texture = sheetTexture()
  const props = {
    ...spriteProps(texture, n),
    cols: SHEET_FRAMES,
    rows: 1,
    clips: { run: { frames: [0, 1, 2, 3], fps: 8 } },
    initialClip: 'run',
  }
  const entities: SceneEntityJson[] = Array.from({ length: n }, (_, i) => ({
    name: `Animated-${i}`,
    position: gridPosition(i, n),
    components: [{ type: 'AnimatedSprite', props }],
  }))
  return {
    scene: { waicaScene: 3, entities },
    registry: { components: REGISTRY_COMPONENTS },
    textures: [texture],
    steps: STILL_STEPS,
  }
}

export const PLAN_BY_KIND: Record<ScenarioKind, (n: number) => ScenarioPlan> = {
  'static-sprites': staticSprites,
  'spawn-churn': spawnChurn,
  'animated-sprites': animatedSprites,
  'bullet-hell': (n) => bulletHell(n, squareTexture(), REGISTRY_COMPONENTS),
}

/** Builds the plan of one sweep entry; art is generated here, in the page. */
export function planFor(name: ScenarioName): ScenarioPlan {
  const { kind, n } = SWEEP[name]
  return PLAN_BY_KIND[kind](n)
}
