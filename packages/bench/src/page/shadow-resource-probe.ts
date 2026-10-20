import {
  Animator, Model, PointLight, StateMachine, Sun, THREE, loadScene,
  type Game, type RenderBackend, type RuntimeBridge, type SceneEntityJson, type SceneJson,
} from '@waica/engine'
import rigUrl from '../../../engine/fixtures/rig.glb?url'
import { syncGpu, type BenchRenderer } from '../draw-counter.ts'
import { ShadowResourceObserver } from '../shadow-resource-observer.ts'
import {
  assertStableShadowCheckpoint, isShadowResourceReport, SHADOW_RESOURCE_PHASES,
  type ShadowResourceCheckpoint, type ShadowResourceReport,
} from '../shadow-resources.ts'

/** Small, private fixture: resource coverage, not the timed CA-19 workload. */
export function shadowResourceFixture(): SceneJson {
  const lights: SceneEntityJson[] = [
    { name: 'Resource-Sun', components: [{ type: 'Sun', props: { direction: [-1, -2, -1], castShadows: true } }] },
    ...Array.from({ length: 4 }, (_, index): SceneEntityJson => ({
      name: `Resource-Point-${index}`, position: [index % 2 ? 3 : -3, 4, index < 2 ? -3 : 3],
      components: [{ type: 'PointLight', props: { intensity: 15, distance: 20, castShadows: true } }],
    })),
  ]
  const casters: SceneEntityJson[] = Array.from({ length: 4 }, (_, index) => ({
    name: `Resource-Box-${index}`, position: [index % 2 ? 2 : -2, 1, index < 2 ? -2 : 2],
    components: [{ type: 'Model', props: { shape: 'box', castShadows: true, receiveShadows: true } }],
  }))
  return {
    waicaScene: 3,
    render: { space: '3d', shadows: { quality: 'low', maxDistance: 40 } },
    camera: { kind: 'perspective', position: [9, 8, 14], target: [0, 1, 0], fov: 50 },
    entities: [
      ...lights, ...casters,
      { name: 'Resource-Floor', position: [0, -0.5, 0], scale: [16, 1, 16], components: [{ type: 'Model', props: { shape: 'box' } }] },
      { name: 'Resource-Rig', components: [{ type: 'Model', props: { src: rigUrl } }, { type: 'Animator', props: { initialClip: 'walk' } }] },
    ],
  }
}

const REGISTRY = { components: { Model, Sun, PointLight, Animator, StateMachine } }

interface ProbeOptions {
  readonly game: Game
  readonly renderer: BenchRenderer
  readonly bridge: RuntimeBridge
}

type NativeShadowLight = THREE.DirectionalLight | THREE.PointLight

/** Owns one bounded probe, never a replacement Game, renderer or shadow target. */
class ProbeSession {
  readonly observer: ShadowResourceObserver
  private readonly backendObject: object

  constructor(readonly options: ProbeOptions, readonly backend: RenderBackend) {
    this.observer = new ShadowResourceObserver(options.renderer)
    this.backendObject = options.renderer.backend
  }

  private lights(): NativeShadowLight[] {
    const lights: NativeShadowLight[] = []
    this.options.game.scene.traverse((object) => {
      if (object instanceof THREE.DirectionalLight || object instanceof THREE.PointLight) lights.push(object)
    })
    return lights
  }

  private async load(scene: SceneJson): Promise<void> {
    loadScene(this.options.game, scene, REGISTRY)
    await this.options.game.ready()
    await this.options.game.assets.ready()
  }

  private async capture(phase: string, cycle: number): Promise<ShadowResourceCheckpoint> {
    const { game, renderer, bridge } = this.options
    const before = bridge.metadata()
    if (before.mode !== 'paused') throw new Error('bench: shadow resource probe requires a paused Runtime Bridge')
    game.start()
    await syncGpu(renderer, this.backend)
    const after = bridge.metadata()
    if (before.frame !== after.frame || before.simulationTime !== after.simulationTime) {
      throw new Error('bench: resource-only render advanced the simulation')
    }
    if (renderer.backend !== this.backendObject || game.backend !== this.backend) throw new Error('bench: resource probe backend changed')
    for (const light of this.lights().filter((light) => light.castShadow)) {
      const target = light.shadow.map
      if (!target?.depthTexture) throw new Error(`bench: ${light.type} has no rendered depth shadow map`)
      const cube = target.texture instanceof THREE.CubeTexture
      if (cube !== (light instanceof THREE.PointLight)) throw new Error('bench: wrong native shadow map kind')
      this.observer.observe(light.uuid, target)
    }
    return this.observer.checkpoint(phase, cycle)
  }

  private editWithoutAllocation(): void {
    const { game } = this.options
    game.cameraRig.camera.position.x += 0.25
    const caster = game.find('Resource-Box-0')
    if (!caster) throw new Error('bench: resource caster missing')
    caster.position.x += 0.25
    for (const entity of game.entities) {
      const light = entity.get(Sun) ?? entity.get(PointLight)
      if (!light) continue
      light.shadowBias = 0
      light.shadowNormalBias = 0.01
      light.shadowRadius = 2
      if (light instanceof Sun) light.direction = [-1, -2, 1]
      else light.offsetX = 0.25
    }
  }

  private setMapOverrides(resized: boolean): void {
    for (const entity of this.options.game.entities) {
      const light = entity.get(Sun) ?? entity.get(PointLight)
      if (light) light.shadowMapSize = resized ? (light instanceof Sun ? 512 : 256) : null
    }
  }

  private retired(lights: readonly NativeShadowLight[]): void {
    for (const light of lights) this.observer.assertRetired(light.uuid)
  }

  async cycle(cycle: number): Promise<ShadowResourceCheckpoint[]> {
    const { game } = this.options
    await this.load(shadowResourceFixture())
    const lights = this.lights()
    const checkpoints = [await this.capture('low', cycle)]
    this.editWithoutAllocation()
    const edited = await this.capture('low-edited', cycle)
    assertNoShadowAllocation(checkpoints[0], edited)
    checkpoints.push(edited)
    for (const quality of ['medium', 'high'] as const) {
      game.shadows.quality = quality
      checkpoints.push(await this.capture(quality, cycle))
    }
    this.setMapOverrides(true)
    checkpoints.push(await this.capture('resized', cycle))
    game.shadows.quality = 'off'
    checkpoints.push(await this.capture('off', cycle))
    this.retired(lights)
    this.setMapOverrides(false)
    game.shadows.quality = 'medium'
    checkpoints.push(await this.capture('reactivated', cycle))
    checkpoints.push(...await this.finishCycle(cycle, lights))
    return checkpoints
  }

  private async finishCycle(cycle: number, lights: readonly NativeShadowLight[]): Promise<ShadowResourceCheckpoint[]> {
    const { game } = this.options
    const lamp = game.find('Resource-Point-0')
    const native = lamp?.get(PointLight)?.light
    if (!lamp || !native) throw new Error('bench: resource PointLight missing')
    lamp.destroy()
    const destroyed = await this.capture('light-destroyed', cycle)
    this.observer.assertRetired(native.uuid)
    await this.load({ waicaScene: 3, render: { space: '2d' }, entities: [] })
    const scene2d = await this.capture('scene-2d', cycle)
    this.retired(lights)
    await this.load(shadowResourceFixture())
    game.shadows.quality = 'medium'
    const incoming = this.lights()
    const scene3d = await this.capture('scene-3d', cycle)
    await this.load({ waicaScene: 3, render: { space: '3d' }, entities: [] })
    const empty = await this.capture('empty', cycle)
    this.retired(incoming)
    return [destroyed, scene2d, scene3d, empty]
  }
}

function assertNoShadowAllocation(before: ShadowResourceCheckpoint | undefined, after: ShadowResourceCheckpoint): void {
  if (!before) throw new Error('bench: no low-profile reference')
  for (const key of ['createdTextures', 'destroyedTextures', 'initializedTargets', 'targetDisposals'] as const) {
    if (before.shadow[key] !== after.shadow[key]) throw new Error(`bench: bias/radius/movement changed ${key}`)
  }
}

function assertMeasuredCycle(reference: readonly ShadowResourceCheckpoint[], measured: readonly ShadowResourceCheckpoint[]): void {
  for (const [index, checkpoint] of measured.entries()) {
    const expected = reference[index]
    if (!expected) throw new Error('bench: resource phase missing from warmup')
    assertStableShadowCheckpoint(expected, checkpoint)
  }
}

/**
 * Run AFTER the timing loop and BEFORE game.dispose(). Reuses that exact Game
 * and renderer. Three fixed complete warmups cover shader/material variants;
 * only the third is retained as cycle 0. A leak fails, never extends warmup.
 * Leaves an empty live 3D scene; the caller still owns Game disposal.
 */
export async function runShadowResourceProbe(options: ProbeOptions): Promise<ShadowResourceReport> {
  const backend = options.game.backend
  if (!backend) throw new Error('bench: resource probe requires a ready Render Backend')
  options.bridge.control({ operation: 'pause' })
  await options.game.assets.preload([rigUrl])
  const probe = new ProbeSession(options, backend)
  try {
    let reference: ShadowResourceCheckpoint[] = []
    for (let warmup = 0; warmup < 3; warmup++) reference = await probe.cycle(0)
    const checkpoints = [...reference]
    for (let cycle = 1; cycle <= 10; cycle++) {
      const measured = await probe.cycle(cycle)
      assertMeasuredCycle(reference, measured)
      checkpoints.push(...measured)
    }
    const report: ShadowResourceReport = {
      backend, phases: [...SHADOW_RESOURCE_PHASES], checkpoints,
      cycles: 10, warmupCycles: 3, passed: true, measuredBeforeDispose: true,
    }
    if (!isShadowResourceReport(report)) throw new Error('bench: shadow GPU resource evidence is incomplete/unbalanced')
    return report
  } finally {
    probe.observer.uninstall()
  }
}
