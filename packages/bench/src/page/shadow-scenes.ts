import { Animator, Model, PointLight, StateMachine, Sun, type SceneEntityJson } from '@waica/engine'
import rigUrl from '../../../engine/fixtures/rig.glb?url'
import { SHADOW_MEASURED_FRAMES, SHADOW_WARMUP_FRAMES, type ShadowWorkloadInfo } from '../shadow-workload.ts'
import type { ScenarioPlan } from './scenarios.ts'

const COLUMNS = 20

/** A compact, separated ground grid inside the camera and finite shadow reach. */
function caster(index: number, count: number): SceneEntityJson {
  const rows = Math.ceil(count / COLUMNS)
  const x = -8 + (16 * (index % COLUMNS + 0.5)) / COLUMNS
  const z = -5 + (10 * (Math.floor(index / COLUMNS) + 0.5)) / rows
  const animated = index === 0
  return {
    name: `Caster-${index}`,
    position: [x, animated ? 0 : 0.5, z],
    scale: animated ? [1, 1, 1] : [0.6, 1, 0.6],
    components: animated
      ? [{ type: 'Model', props: { src: rigUrl, castShadows: true, receiveShadows: true } }, { type: 'Animator', props: { initialClip: 'walk' } }]
      : [{ type: 'Model', props: { shape: 'box', color: 0xc89b3c, castShadows: true, receiveShadows: true } }],
  }
}

function shadowLights(composition: ShadowWorkloadInfo['composition']): SceneEntityJson[] {
  if (composition === 'sun') return [{
    name: 'Daylight',
    components: [{ type: 'Sun', props: { direction: [-0.5, -1, -0.35], intensity: 3, castShadows: true } }],
  }]
  const positions: Array<[number, number, number]> = composition === 'point'
    ? [[0, 5, 0]]
    : [[-5, 5, -3], [5, 5, -3], [-5, 5, 3], [5, 5, 3]]
  return positions.map((position, index) => ({
    name: `Lamp-${index}`,
    position,
    components: [{ type: 'PointLight', props: { distance: 30, intensity: composition === 'point' ? 150 : 60, decay: 2, castShadows: true } }],
  }))
}

/** One source for the control and shadow scenes: only scene quality changes. */
export function shadowScene(n: number, composition: ShadowWorkloadInfo['composition'], enabled: boolean): ScenarioPlan {
  const casters = Array.from({ length: n }, (_, index) => caster(index, n))
  const lights = shadowLights(composition)
  const receiver: SceneEntityJson = {
    name: 'Receiver',
    scale: [20, 1, 14],
    components: [{ type: 'Model', props: { shape: 'plane', color: 0xaaaaaa, castShadows: false, receiveShadows: true } }],
  }
  const quality = enabled ? 'medium' : 'off'
  return {
    scene: {
      waicaScene: 3,
      render: { space: '3d', shadows: { quality, maxDistance: 40 }, lighting: { ambient: { intensity: 0.25 } } },
      camera: { kind: 'perspective', position: [0, 16, 24], target: [0, 1, 0], fov: 50 },
      entities: [receiver, ...lights, ...casters],
    },
    registry: { components: { Model, Animator, StateMachine, Sun, PointLight } },
    preload: [rigUrl],
    steps: SHADOW_MEASURED_FRAMES,
    warmupFrames: SHADOW_WARMUP_FRAMES,
    shadow: { composition, enabled, quality, casters: casters.length, lights: lights.length, warmupFrames: SHADOW_WARMUP_FRAMES, measuredFrames: SHADOW_MEASURED_FRAMES },
  }
}
