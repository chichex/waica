// @vitest-environment happy-dom
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  new URL('../../../engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../../engine/src/test-renderer.js')).withFakeRenderer(await importOriginal<Record<string, unknown>>()),
)

import { Animator, Model, PointLight, Sun, THREE, loadScene, type Game } from '@waica/engine'
import { GltfModelBackend } from '../../../engine/src/assets/model-backend.js'
import { meshesUnder, ready3dGame, runtimeBridgeOf, use3dTestEnvironment } from '../../../engine/src/test-game-3d.js'
import { renderFrame, type AnyMesh } from '../../../engine/src/test-sprite-batches.js'
import { defined } from '../../../engine/src/test-support.js'
import type { ShadowWorkloadInfo } from '../shadow-workload.ts'
import { shadowScene } from './shadow-scenes.ts'

use3dTestEnvironment()

beforeEach(async () => {
  const bytes = new Uint8Array(await readFile(resolve(dirname(fileURLToPath(import.meta.url)), '../../../engine/fixtures/rig.glb')))
  vi.stubGlobal('fetch', (request: RequestInfo | URL) => {
    const url = request instanceof Request ? request.url : String(request)
    return Promise.resolve(url.endsWith('/rig.glb') ? new Response(bytes) : new Response('not found', { status: 404 }))
  })
})

async function readyWorkload(composition: ShadowWorkloadInfo['composition'], n: number, enabled: boolean) {
  const plan = shadowScene(n, composition, enabled)
  const { game } = await ready3dGame(undefined, undefined, { models: new GltfModelBackend() })
  await game.assets.preload(plan.preload)
  loadScene(game, plan.scene, plan.registry)
  await game.assets.ready()
  expect(game.assets.status.failed).toBe(0)
  const bridge = runtimeBridgeOf(game)
  for (let frame = 0; frame < (plan.warmupFrames ?? 0); frame++) renderFrame(game)
  expect(bridge.inspect().simulationTime).toBe(0)
  return { game, bridge }
}

function casterMeshes(game: Game): AnyMesh[] {
  return game.entities.flatMap((entity) => {
    const model = entity.get(Model)
    return model?.castShadows && model.root ? meshesUnder(model.root) : []
  })
}

function corners(bounds: THREE.Box3): THREE.Vector3[] {
  return [bounds.min.x, bounds.max.x].flatMap((x) =>
    [bounds.min.y, bounds.max.y].flatMap((y) => [bounds.min.z, bounds.max.z].map((z) => new THREE.Vector3(x, y, z))),
  )
}

/** Exact animated vertex bounds, not only entity centres or bind-pose bounds. */
function casterBounds(game: Game): THREE.Box3[] {
  game.scene.updateMatrixWorld(true)
  return casterMeshes(game).map((mesh) => {
    if (mesh instanceof THREE.SkinnedMesh) mesh.skeleton.update()
    return new THREE.Box3().setFromObject(mesh, true)
  })
}

function assertCovered(game: Game, bounds: readonly THREE.Box3[]): void {
  const camera = game.camera
  if (!(camera instanceof THREE.PerspectiveCamera)) throw new Error('expected the perspective workload camera')
  camera.updateMatrixWorld(true)
  const projection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  const frustum = new THREE.Frustum().setFromProjectionMatrix(projection, camera.coordinateSystem, camera.reversedDepth)
  const points = game.entities.flatMap((entity) => {
    const light = entity.get(PointLight)?.light
    return light ? [light.getWorldPosition(new THREE.Vector3())] : []
  })
  const suns = game.entities.flatMap((entity) => {
    const light = entity.get(Sun)?.light
    if (!light) return []
    const shadow = light.shadow.camera
    return [new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(shadow.projectionMatrix, shadow.matrixWorldInverse))]
  })
  // Evaluate every original condition at every measured frame, but avoid a
  // matcher and a world-matrix traversal for each vertex/light combination.
  const violations: string[] = []
  const require = (condition: boolean, detail: string): void => { if (!condition) violations.push(detail) }
  for (const light of points) require(frustum.containsPoint(light), 'light outside view')
  for (const [index, box] of bounds.entries()) {
    for (const point of corners(box)) {
      require(frustum.containsPoint(point), `caster ${index} outside view`)
      require(-point.clone().applyMatrix4(camera.matrixWorldInverse).z < 40, `caster ${index} beyond depth 40`)
      for (const sun of suns) require(sun.containsPoint(point), `caster ${index} outside Sun coverage`)
      for (const light of points) require(point.distanceTo(light) < 30, `caster ${index} outside PointLight coverage`)
    }
  }
  expect(violations).toEqual([])
}

function assertSeparated(bounds: readonly THREE.Box3[]): void {
  const violations: string[] = []
  for (let index = 0; index < bounds.length; index++) {
    const a = defined(bounds[index])
    if (!(a.min.x > -10 && a.max.x < 10 && a.min.z > -7 && a.max.z < 7)) violations.push(`caster ${index} outside receiver`)
    for (let next = index + 1; next < bounds.length; next++) {
      if (a.intersectsBox(defined(bounds[next]))) violations.push(`casters ${index}/${next} overlap`)
    }
  }
  expect(violations).toEqual([])
}

function logicalPose(game: Game) {
  return game.entities.map((entity) => ({
    name: entity.name,
    position: entity.position.toArray(),
    rotation: entity.node.quaternion.toArray(),
    scale: entity.scale.toArray(),
    clip: entity.get(Animator)?.current,
    bones: meshesUnder(entity.get(Model)?.root ?? entity.node).flatMap((mesh) =>
      mesh instanceof THREE.SkinnedMesh ? mesh.skeleton.bones.map((bone) => bone.quaternion.toArray()) : [],
    ),
  }))
}

describe('real glb shadow workload CPU invariants (no GPU)', () => {
  it.each([
    ['sun', 50], ['sun', 200], ['point', 50], ['point', 200], ['four-point', 50], ['four-point', 200],
  ] as const)('keeps all %s/%i casters visible, covered and pose-identical through the measured frames', async (composition, n) => {
    const off = await readyWorkload(composition, n, false)
    const on = await readyWorkload(composition, n, true)
    try {
      expect(casterMeshes(on.game)).toHaveLength(n)
      expect(casterMeshes(on.game).filter((mesh) => mesh instanceof THREE.SkinnedMesh)).toHaveLength(1)
      expect(casterMeshes(on.game).every((mesh) => mesh.castShadow && mesh.visible)).toBe(true)
      for (const mesh of casterMeshes(on.game)) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        expect(materials.every((material) => !material.transparent && material.opacity === 1)).toBe(true)
      }
      expect(logicalPose(on.game)).toEqual(logicalPose(off.game))
      const initial = defined(logicalPose(on.game).find((entity) => entity.name === 'Caster-0')).bones
      for (let frame = 1; frame <= 60; frame++) {
        off.bridge.control({ operation: 'step' })
        on.bridge.control({ operation: 'step' })
        expect(logicalPose(on.game)).toEqual(logicalPose(off.game))
        const bounds = casterBounds(on.game)
        assertCovered(on.game, bounds)
        assertSeparated(bounds)
      }
      const walker = defined(on.game.find('Caster-0'))
      expect(defined(walker.get(Animator)).current).toBe('walk')
      const skin = casterMeshes(on.game).find((mesh) => mesh instanceof THREE.SkinnedMesh)
      expect(defined(skin).skeleton.bones.map((bone) => bone.quaternion.toArray())).not.toEqual(initial)
      expect(on.bridge.inspect().simulationTime).toBe(1)
      expect(off.bridge.inspect().simulationTime).toBe(1)
      const lights = on.game.entities.flatMap((entity) => entity.get(Sun)?.light ?? entity.get(PointLight)?.light ?? [])
      expect(lights).toHaveLength(composition === 'four-point' ? 4 : 1)
      expect(lights.every((light) => light.visible && light.castShadow && light.intensity > 0)).toBe(true)
    } finally {
      off.game.dispose()
      on.game.dispose()
    }
  })
})

it('rejects geometry outside the camera/receiver and overlapping casters', async () => {
  const { game } = await readyWorkload('point', 50, true)
  try {
    defined(game.find('Caster-0')).position.x = 100
    renderFrame(game)
    expect(() => assertCovered(game, casterBounds(game))).toThrow()
    expect(() => assertSeparated(casterBounds(game))).toThrow()
    const first = defined(game.find('Caster-1'))
    defined(game.find('Caster-0')).position.copy(first.position)
    defined(game.find('Caster-2')).position.copy(first.position)
    renderFrame(game)
    expect(() => assertSeparated(casterBounds(game))).toThrow()
  } finally { game.dispose() }
})
