// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import * as THREE from 'three/webgpu'
import type { SceneCameraJson } from './camera.js'
import { Animator } from './components/animator.js'
import { Model } from './components/model.js'
import type { Game, GameResolution } from './game.js'
import * as engine from './index.js'
import type { PointerPick } from './pointer.js'
import type { PickTarget, ViewportFraction } from './pointer-raycast.js'
import { loadScene, type SceneEntityJson } from './scene.js'
import { StateMachine } from './state/state-machine.js'
import { meshesUnder, ready3dGame, registryOf, scene3d, use3dTestEnvironment, type Game3d } from './test-game-3d.js'
import { rigEntity, rigGame, step } from './test-rig.js'
import { defined } from './test-support.js'

const { raycastPick } = engine

use3dTestEnvironment()

const CAMERA: SceneCameraJson = { kind: 'perspective', position: [0, 5, 10], target: [0, 0, 0], fov: 60 }

const box = (name: string, position: [number, number, number], size = 2): SceneEntityJson => ({
  name,
  position,
  components: [{ type: 'Model', props: { shape: 'box', size } }],
})

/** A Game whose camera sits at (0, 5, 10) looking at the origin, with the given entities. */
async function setup(entities: SceneEntityJson[], size?: { width: number; height: number }, resolution?: GameResolution): Promise<Game3d> {
  const built = await ready3dGame(size, resolution)
  loadScene(built.game, scene3d(entities, {}, CAMERA), registryOf({ Model }))
  return built
}

function canvasOf(): HTMLCanvasElement {
  return defined(document.querySelector('canvas'), 'the game canvas')
}

function clickAt(clientX: number, clientY: number): void {
  canvasOf().dispatchEvent(new PointerEvent('pointerdown', { clientX, clientY, button: 0 }))
}

/** A real pointerdown where a world point is drawn; the pending pick it queued. */
function pickAfterClick(game: Game, point: { x: number; y: number; z?: number }): PointerPick | null {
  const at = defined(game.worldToScreen(point), 'a visible point')
  clickAt(at.x, at.y)
  return game.pointer.takePending()
}

describe('raycast picking (CA-12)', () => {
  it('picks the entity under the click with the world-space hit point', async () => {
    const { game } = await setup([box('Crate', [2, 0, 0])])

    const pick = defined(pickAfterClick(game, { x: 2, y: 0.5, z: 1 }), 'a pick')

    expect(pick.entity?.name).toBe('Crate')
    expect(pick.point.x).toBeCloseTo(2, 4)
    expect(pick.point.y).toBeCloseTo(0.5, 4)
    expect(pick.point.z).toBeCloseTo(1, 4)
  })

  it('resolves the nearest hit when several models lie along the ray', async () => {
    // From the camera at (0, 5, 10) the far crate sits exactly behind the near one.
    const along = (t: number): [number, number, number] => [0, 5 * (1 - t), 10 * (1 - t)]
    const [x, y, z] = along(0.2)
    const { game } = await setup([box('Far', along(0.9), 1), box('Near', [x, y, z], 1)])

    const pick = defined(pickAfterClick(game, { x, y, z }), 'a pick')

    expect(pick.entity?.name).toBe('Near')
  })

  it('falls back to the ground plane y=0 with no entity when nothing is hit', async () => {
    const { game } = await setup([box('Crate', [2, 0, 0])])

    const pick = defined(pickAfterClick(game, { x: -4, y: 0, z: 2 }), 'a pick')

    expect(pick.entity).toBeNull()
    expect(pick.point.x).toBeCloseTo(-4, 4)
    expect(pick.point.y).toBeCloseTo(0, 4)
    expect(pick.point.z).toBeCloseTo(2, 4)
  })

  it('produces no pick for a ray that never meets the ground', async () => {
    const { game } = await setup([box('Crate', [2, 0, 0])])
    clickAt(320, 2)
    expect(game.pointer.takePending()).toBeNull()
  })

  it('ignores a click on a letterbox bar', async () => {
    const { game } = await setup([], { width: 800, height: 300 }, { width: 640, height: 360 })
    // vw = 300 * 16/9 = 533.3, so the bars are the 133.3 px at each side.
    clickAt(50, 150)
    expect(game.pointer.takePending()).toBeNull()
    clickAt(400, 250)
    expect(game.pointer.takePending()).not.toBeNull()
  })
})

describe('what a ray can hit (CA-12)', () => {
  it('skips a glTF that has not loaded, hits it once it has, and skips it again when it is destroyed', async () => {
    const { game, models } = await ready3dGame()
    models.hold('/slow.glb')
    const entities: SceneEntityJson[] = [
      { name: 'Slow', position: [0, 0, 0], components: [{ type: 'Model', props: { src: '/slow.glb' } }] },
      { name: 'Empty', position: [3, 0, 0] },
    ]
    loadScene(game, scene3d(entities, {}, CAMERA), registryOf({ Model }))
    expect(pickAfterClick(game, { x: 0, y: 0, z: 0 })?.entity).toBeNull()

    models.release('/slow.glb')
    await game.assets.ready()
    expect(pickAfterClick(game, { x: 0, y: 0, z: 0.4 })?.entity?.name).toBe('Slow')

    defined(game.find('Slow')).destroy()
    expect(pickAfterClick(game, { x: 0, y: 0, z: 0 })?.entity).toBeNull()
  })

  it('serves the bridge through injectClick with canvas pixels, exactly as a real click does', async () => {
    const { game } = await setup([box('Crate', [2, 0, 0])])
    const at = defined(game.worldToScreen({ x: 2, y: 0.5, z: 1 }))

    const injected = defined(game.pointer.injectClick(at.x, at.y), 'a pick')

    expect(injected.entity?.name).toBe('Crate')
    expect(game.pointer.takePending()).toBe(injected)
    expect(game.pointer.injectClick(320, 2)).toBeNull()
  })
})

/** The live perspective camera of a 3D Game. */
function lensOf(game: Game): THREE.PerspectiveCamera {
  const camera = game.camera
  if (!(camera instanceof THREE.PerspectiveCamera)) throw new Error('expected the perspective camera')
  return camera
}

/** Where `point` is drawn, as fractions of the 640×360 canvas. */
function fractionAt(game: Game, point: { x: number; y: number; z: number }): ViewportFraction {
  const at = defined(game.worldToScreen(point), 'a visible point')
  return { nx: at.x / 640, ny: at.y / 360 }
}

/** A constant-size billboard at `position`, like an editor icon. */
function icon(position: [number, number, number]): THREE.Sprite {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ sizeAttenuation: false }))
  sprite.scale.set(0.05, 0.05, 1)
  sprite.position.set(...position)
  sprite.updateMatrixWorld()
  return sprite
}

describe('raycastPick as public API (issue #173 CA-2)', () => {
  it('is exported by @waica/engine and picks a Model root as the Pointer does', async () => {
    const { game } = await setup([box('Crate', [2, 0, 0])])

    const pick = defined(engine.raycastPick(lensOf(game), fractionAt(game, { x: 2, y: 0.5, z: 1 }), game.entities), 'a pick')

    expect(pick.entity?.name).toBe('Crate')
    expect(pick.point.z).toBeCloseTo(1, 4)
  })
})

describe('raycastPick with extra targets (issue #173 CA-2)', () => {
  it('hits an extra target and answers with what it picks: an entity, or the camera', async () => {
    const { game } = await setup([box('Crate', [2, 0, 0])])
    const crate = defined(game.find('Crate'))
    const crateIcon = icon([-3, 1, 0])
    const cameraIcon = icon([3, 3, -2])
    const extra: PickTarget[] = [
      { object: crateIcon, entity: crate },
      { object: cameraIcon, entity: 'camera' },
    ]

    const onCrateIcon = defined(raycastPick(lensOf(game), fractionAt(game, { x: -3, y: 1, z: 0 }), game.entities, extra), 'a pick')
    const onCamera = defined(raycastPick(lensOf(game), fractionAt(game, { x: 3, y: 3, z: -2 }), game.entities, extra), 'a pick')

    expect(onCrateIcon.entity).toBe(crate)
    expect(onCamera.entity).toBe('camera')
  })

  it('takes the nearest hit across Model roots and extra targets', async () => {
    const { game } = await setup([box('Crate', [0, 0, 0], 2)])
    const lens = lensOf(game)
    const front = icon([0, 0.5, 3])
    const pickFront = defined(raycastPick(lens, fractionAt(game, { x: 0, y: 0.5, z: 3 }), game.entities, [{ object: front, entity: 'camera' }]), 'a pick')

    expect(pickFront.entity).toBe('camera')
  })

})

describe('raycastPick ordering and visibility of extra targets (issue #173 CA-2)', () => {
  it('does not pick an extra target hidden behind a Model on the same ray', async () => {
    const { game } = await setup([box('Crate', [0, 0, 0], 2)])
    const lens = lensOf(game)
    // Past the Crate's back face (z = -1), on the very ray that hits the Crate's front.
    const ray = new THREE.Ray(lens.position.clone(), new THREE.Vector3(0, 0.5, 1).sub(lens.position).normalize())
    const hidden = ray.at(lens.position.distanceTo(new THREE.Vector3(0, 0.5, 1)) * 1.6, new THREE.Vector3())
    const behind = icon([hidden.x, hidden.y, hidden.z])

    const pickBehind = defined(raycastPick(lens, fractionAt(game, { x: 0, y: 0.5, z: 1 }), game.entities, [{ object: behind, entity: 'camera' }]), 'a pick')
    const behindAlone = defined(raycastPick(lens, fractionAt(game, { x: 0, y: 0.5, z: 1 }), [], [{ object: behind, entity: 'camera' }]), 'a pick')

    expect(hidden.z).toBeLessThan(-1)
    expect(behindAlone.entity).toBe('camera')
    expect(pickBehind.entity).toBe(game.find('Crate'))
  })

  it('skips an extra target that is not drawn: hidden itself or under a hidden parent', async () => {
    const { game } = await setup([])
    const hiddenIcon = icon([1, 1, 0])
    hiddenIcon.visible = false
    const parent = new THREE.Group()
    const child = icon([-1, 1, 0])
    parent.add(child)
    parent.visible = false
    parent.updateMatrixWorld(true)
    const extra: PickTarget[] = [
      { object: hiddenIcon, entity: 'camera' },
      { object: parent, entity: 'camera' },
    ]

    const onHidden = defined(raycastPick(lensOf(game), fractionAt(game, { x: 1, y: 1, z: 0 }), game.entities, extra), 'a pick')
    const onChild = defined(raycastPick(lensOf(game), fractionAt(game, { x: -1, y: 1, z: 0 }), game.entities, extra), 'a pick')

    expect(onHidden.entity).toBeNull()
    expect(onChild.entity).toBeNull()
  })

  it('tests an extra target whatever its layers: an editor overlay lives on the Emissive layer', async () => {
    const { game } = await setup([])
    const overlay = icon([1, 1, 0])
    overlay.layers.set(1)

    const pick = defined(raycastPick(lensOf(game), fractionAt(game, { x: 1, y: 1, z: 0 }), game.entities, [{ object: overlay, entity: 'camera' }]), 'a pick')

    expect(pick.entity).toBe('camera')
  })
})

describe('raycastPick on a glTF (issue #173 CA-2)', () => {
  /** A camera straight in front of the rig's right leg, at hip-to-knee height, looking down -z. */
  const FRONT_OF_RIGHT_LEG: SceneCameraJson = { kind: 'perspective', position: [-0.175, 0.2, 10], target: [-0.175, 0.2, 0], fov: 30 }
  const CENTER: ViewportFraction = { nx: 0.5, ny: 0.5 }

  it('resolves a hit on a nested child mesh to the entity owning the glTF', async () => {
    const game = await rigGame()
    loadScene(game, scene3d([rigEntity('Walker')], {}, FRONT_OF_RIGHT_LEG), registryOf({ Model, Animator, StateMachine }))
    await game.assets.ready()
    const camera = game.camera
    if (!(camera instanceof THREE.PerspectiveCamera)) throw new Error('expected the perspective camera')
    const root = defined(defined(game.find('Walker')).get(Model)?.root, 'the glTF root')
    const mesh = defined(meshesUnder(root)[0], 'a mesh')
    expect(mesh.parent).not.toBe(root)

    const pick = defined(raycastPick(camera, CENTER, game.entities), 'a pick')

    expect(pick.entity?.name).toBe('Walker')
    // The bind pose: the leg's front face at z = 0.12.
    expect(pick.point.z).toBeCloseTo(0.12, 3)
  })

  it('hits a posed SkinnedMesh where the pose put it: 12 steps of walk swing the right leg forward', async () => {
    const game = await rigGame()
    loadScene(game, scene3d([rigEntity('Walker')], {}, FRONT_OF_RIGHT_LEG), registryOf({ Model, Animator, StateMachine }))
    await game.assets.ready()
    const camera = game.camera
    if (!(camera instanceof THREE.PerspectiveCamera)) throw new Error('expected the perspective camera')
    // A first pick in the bind pose, as a click before the animation would be.
    expect(raycastPick(camera, CENTER, game.entities)?.entity?.name).toBe('Walker')

    defined(defined(game.find('Walker')).get(Animator)).play('walk')
    step(game, 12)
    const pick = defined(raycastPick(camera, CENTER, game.entities), 'a pick')

    expect(pick.entity?.name).toBe('Walker')
    // 30° forward about the hip at y = 0.9: the front face at y = 0.2 sits near z = 0.43, far ahead of the bind pose's 0.12.
    expect(pick.point.z).toBeGreaterThan(0.35)
  })
})
