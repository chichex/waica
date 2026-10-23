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
import { SHADOW_RESOURCE_SCENARIO } from '../shadow-workload.ts'
import { activeWebglRenderer, describeRenderer } from './renderer-probe.ts'
import { planFor, type ScenarioPlan } from './scenarios.ts'
import { runShadowResourceProbe } from './shadow-resource-probe.ts'

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
    if (Reflect.get(globalThis, RUNTIME_BRIDGE_SYMBOL) !== activation) throw new Error('bench: Runtime Bridge activation is unavailable')
    if (!captured) throw new Error('bench: the Game did not register a Runtime Bridge')
    return captured
  }
}

function gameCanvas(): HTMLCanvasElement {
  const canvas = document.getElementById('game')
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('bench: #game canvas missing')
  return canvas
}

/** Captures the Game's renderer without leaving the prototype patched on setup failure. */
function createScenarioGame(): { game: Game; renderer: BenchRenderer } {
  const capture = captureRenderer(THREE.WebGPURenderer.prototype)
  let game: Game | undefined
  try {
    game = new Game({ canvas: gameCanvas() })
    const renderer = capture.current
    if (!renderer) throw new Error('bench: the Game built no WebGPURenderer')
    return { game, renderer }
  } catch (error) {
    game?.dispose()
    throw error
  } finally {
    capture.uninstall()
  }
}

/** Waits for the Render Backend (ADR 0025), then loads the scene with Assets Ready. */
async function prepareScenarioGame(game: Game, plan: ScenarioPlan): Promise<void> {
  await game.ready()
  await game.assets.preload(plan.preload)
  let step = 0
  game.onUpdate(() => plan.perStep?.(game, ++step))
  loadScene(game, plan.scene, plan.registry)
  await game.assets.ready()
}

/** Runs one scenario to completion and reports its counters and per-frame wall times. */
export async function runScenario(name: ScenarioName): Promise<PageScenarioReport> {
  const bridge = captureRuntimeBridge()
  let game: Game | undefined
  let release: (() => void) | undefined
  try {
    const plan = planFor(name)
    const created = createScenarioGame()
    game = created.game
    const renderer = created.renderer
    await prepareScenarioGame(game, plan)
    release = holdRendererCounters(renderer)
    game.start()
    const report = await measureScenario({ name, game, renderer, plan, bridge })
    if (name === SHADOW_RESOURCE_SCENARIO) report.resources = await runShadowResourceProbe({ game, renderer, bridge: bridge() })
    return report
  } finally {
    try {
      release?.()
    } finally {
      try { game?.dispose() } finally { Reflect.deleteProperty(globalThis, RUNTIME_BRIDGE_SYMBOL) }
    }
  }
}

function renderWarmup(game: Game, bridge: () => RuntimeBridge): void {
  const before = bridge().metadata()
  if (before.mode !== 'paused') throw new Error('bench: warmup requires a paused Runtime Bridge')
  game.start()
  const after = bridge().metadata()
  if (after.mode !== 'paused' || after.frame !== before.frame || after.simulationTime !== before.simulationTime) {
    throw new Error('bench: warmup render changed Runtime Bridge state')
  }
}

async function measureScenario({ name, game, renderer, plan, bridge }: {
  name: ScenarioName; game: Game; renderer: BenchRenderer; plan: ScenarioPlan; bridge: () => RuntimeBridge
}): Promise<PageScenarioReport> {
  // Non-null after the ready() prepareScenarioGame awaited (ADR 0025).
  const backend = game.backend
  if (!backend) throw new Error('bench: the Game reports no Render Backend after ready()')
  const runtime = bridge()
  const tracker = new CreationTracker()
  // Weak, so destroyed entities stay garbage — the harness must not keep
  // alive what the GC numbers measure. Like CreationTracker, it sees an
  // entity only if it is alive at the end of some step.
  const seen = new WeakSet<Entity>()
  let spawned = 0
  const { frameMs, drawCalls } = await measureWindow({
    warmupFrames: plan.warmupFrames ?? 0, steps: plan.steps,
    render: () => renderWarmup(game, bridge),
    step: () => countDraws(renderer, () => runtime.control({ operation: 'step' })),
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
