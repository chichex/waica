import {
  Game,
  RUNTIME_BRIDGE_PROTOCOL_VERSION,
  RUNTIME_BRIDGE_SYMBOL,
  loadScene,
  type Entity,
  type RuntimeBridge,
  type RuntimeBridgeActivation,
} from '@waica/engine'
import { CreationTracker, census } from '../census.ts'
import { installDrawCounter } from '../draw-counter.ts'
import type { PageScenarioReport, ScenarioName } from '../results.ts'
import { SCENARIO_PLANS } from './scenarios.ts'

/**
 * Installs the Runtime Bridge activation hook before the Game starts, so
 * the Game registers a paused bridge (ADR 0006) and every frame advances
 * exactly one Simulation Step on request — never by the wall clock.
 */
function captureRuntimeBridge(): () => RuntimeBridge {
  let captured: RuntimeBridge | null = null
  const activation: RuntimeBridgeActivation = {
    protocolVersion: RUNTIME_BRIDGE_PROTOCOL_VERSION,
    register: (bridge) => {
      captured = bridge
    },
    unregister: () => {
      captured = null
    },
  }
  ;(globalThis as Record<PropertyKey, unknown>)[RUNTIME_BRIDGE_SYMBOL] = activation
  return () => {
    if (!captured) throw new Error('bench: the Game did not register a Runtime Bridge')
    return captured
  }
}

function gameCanvas(): HTMLCanvasElement {
  const canvas = document.getElementById('game')
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('bench: #game canvas missing')
  return canvas
}

/** Builds the scenario's Game, waits for Assets Ready and starts it paused. */
async function startScenarioGame(name: ScenarioName): Promise<{ game: Game; steps: number }> {
  const plan = SCENARIO_PLANS[name]()
  const game = new Game({ canvas: gameCanvas() })
  await game.assets.preload(plan.textures)
  let step = 0
  game.onUpdate(() => plan.perStep?.(game, ++step))
  loadScene(game, plan.scene, plan.registry)
  await game.assets.ready()
  return { game, steps: plan.steps }
}

/** Runs one scenario to completion and reports its counters and per-frame wall times. */
export async function runScenario(name: ScenarioName): Promise<PageScenarioReport> {
  const draws = installDrawCounter([WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype])
  const bridge = captureRuntimeBridge()
  const { game, steps } = await startScenarioGame(name)
  game.start()
  const tracker = new CreationTracker()
  const seen = new Set<Entity>()
  const frameMs: number[] = []
  for (let i = 0; i < steps; i++) {
    draws.reset()
    const started = performance.now()
    bridge().control({ operation: 'step' })
    frameMs.push(performance.now() - started)
    tracker.observe(game.scene)
    for (const entity of game.entities) seen.add(entity)
  }
  const counters = {
    drawCalls: draws.calls,
    ...census(game.scene),
    entitiesSpawned: seen.size,
    entitiesDestroyed: [...seen].filter((entity) => !entity.alive).length,
    ...tracker.totals,
  }
  game.dispose()
  draws.uninstall()
  return { scenario: name, counters, frameMs }
}
