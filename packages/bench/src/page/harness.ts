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
import { installDrawCounter, syncGpu } from '../draw-counter.ts'
import type { PageScenarioReport, ScenarioName } from '../results.ts'
import { LOOP_END_MARK, LOOP_START_MARK } from '../timings.ts'
import { webglRenderer } from './renderer-probe.ts'
import { planFor } from './scenarios.ts'

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
  const plan = planFor(name)
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
  // Weak, so destroyed entities stay garbage — the harness must not keep
  // alive what the GC numbers measure. Like CreationTracker, it sees an
  // entity only if it is alive at the end of some step.
  const seen = new WeakSet<Entity>()
  let spawned = 0
  const frameMs: number[] = []
  performance.mark(LOOP_START_MARK)
  for (let i = 0; i < steps; i++) {
    draws.reset()
    const started = performance.now()
    bridge().control({ operation: 'step' })
    syncGpu(draws.lastContext)
    frameMs.push(performance.now() - started)
    tracker.observe(game.scene)
    for (const entity of game.entities) {
      if (seen.has(entity)) continue
      seen.add(entity)
      spawned++
    }
  }
  performance.mark(LOOP_END_MARK)
  const counters = {
    drawCalls: draws.calls,
    ...census(game.scene),
    entitiesSpawned: spawned,
    // Every entity seen and no longer live was destroyed.
    entitiesDestroyed: spawned - game.entities.length,
    ...tracker.totals,
  }
  game.dispose()
  draws.uninstall()
  return { scenario: name, renderer: webglRenderer(), counters, frameMs }
}
