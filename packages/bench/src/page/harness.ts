import {
  Game,
  RUNTIME_BRIDGE_PROTOCOL_VERSION,
  RUNTIME_BRIDGE_SYMBOL,
  THREE,
  loadScene,
  type Entity,
  type RuntimeBridge,
  type RuntimeBridgeActivation,
} from '@waica/engine'
import { CreationTracker, census } from '../census.ts'
import { captureRenderer, countDraws, syncGpu, type BenchRenderer } from '../draw-counter.ts'
import type { PageScenarioReport, ScenarioName } from '../results.ts'
import { holdRendererCounters, measureWindow } from '../measurement-window.ts'
import { activeWebglRenderer, describeRenderer } from './renderer-probe.ts'
import { planFor, type ScenarioPlan } from './scenarios.ts'

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

/** Builds the scenario's Game and its renderer, ready to draw (ADR 0025), with Assets Ready. */
async function startScenarioGame(name: ScenarioName): Promise<{ game: Game; renderer: BenchRenderer; plan: ScenarioPlan }> {
  const plan = planFor(name)
  const capture = captureRenderer(THREE.WebGPURenderer.prototype)
  const game = new Game({ canvas: gameCanvas() })
  capture.uninstall()
  const renderer = capture.current
  if (!renderer) throw new Error('bench: the Game built no WebGPURenderer')
  await game.ready()
  await game.assets.preload(plan.preload)
  let step = 0
  game.onUpdate(() => plan.perStep?.(game, ++step))
  loadScene(game, plan.scene, plan.registry)
  await game.assets.ready()
  return { game, renderer, plan }
}

/** Runs one scenario to completion and reports its counters and per-frame wall times. */
export async function runScenario(name: ScenarioName): Promise<PageScenarioReport> {
  const bridge = captureRuntimeBridge()
  const { game, renderer, plan } = await startScenarioGame(name)
  const release = holdRendererCounters(renderer)
  try {
    game.start()
    return await measureScenario({ name, game, renderer, plan, bridge: bridge() })
  } finally {
    release()
    game.dispose()
    Reflect.deleteProperty(globalThis, RUNTIME_BRIDGE_SYMBOL)
  }
}

async function measureScenario({ name, game, renderer, plan, bridge }: {
  name: ScenarioName; game: Game; renderer: BenchRenderer; plan: ScenarioPlan; bridge: RuntimeBridge
}): Promise<PageScenarioReport> {
  // Non-null after the ready() startScenarioGame awaited (ADR 0025).
  const backend = game.backend
  if (!backend) throw new Error('bench: the Game reports no Render Backend after ready()')
  const tracker = new CreationTracker()
  // Weak, so destroyed entities stay garbage — the harness must not keep
  // alive what the GC numbers measure. Like CreationTracker, it sees an
  // entity only if it is alive at the end of some step.
  const seen = new WeakSet<Entity>()
  let spawned = 0
  const { frameMs, drawCalls } = await measureWindow({
    warmupFrames: plan.warmupFrames ?? 0, steps: plan.steps,
    render: () => game.start(),
    step: () => countDraws(renderer, () => bridge.control({ operation: 'step' })),
    sync: () => syncGpu(renderer, backend),
    observe: () => {
      tracker.observe(game.scene)
      for (const entity of game.entities) {
        if (seen.has(entity)) continue
        seen.add(entity)
        spawned++
      }
    },
  })
  const counters = {
    drawCalls,
    ...census(game.scene),
    entitiesSpawned: spawned,
    // Every entity seen and no longer live was destroyed.
    entitiesDestroyed: spawned - game.entities.length,
    ...tracker.totals,
  }
  const description = describeRenderer(backend, renderer, () => activeWebglRenderer(renderer.backend))
  return { scenario: name, backend, renderer: description, counters, frameMs, ...(plan.shadow ? { shadow: plan.shadow } : {}) }
}
