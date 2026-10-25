// Test support for the animation tests (issue #166), excluded from builds: a
// 3D Game over the real GltfModelBackend with the checked-in skinned rig
// served by a stubbed fetch, entities that draw and animate it, and the bones
// the clips move.
import * as THREE from 'three/webgpu'
import { vi } from 'vitest'
import rig from '../fixtures/rig.glb?inline'
import { GltfModelBackend } from './assets/model-backend.js'
import { Animator } from './components/animator.js'
import { Model } from './components/model.js'
import type { Entity } from './entity.js'
import type { Game } from './game.js'
import { loadScene, type SceneEntityJson } from './scene.js'
import { StateMachine } from './state/state-machine.js'
import { meshesUnder, ready3dGame, registryOf, scene3d } from './test-game-3d.js'
import { stepFrame } from './test-sprite-batches.js'
import { defined } from './test-support.js'

export const RIG_URL = '/rig.glb'

/** The rig's bytes, decoded from the data URI Vite inlines the file as. */
export function rigBytes(): ArrayBuffer {
  const base64 = rig.slice(rig.indexOf(',') + 1)
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)).buffer
}

/** A `fetch` that serves the rig for RIG_URL and a 404 for any other url. */
export function serveRig(): void {
  vi.stubGlobal('fetch', (request: RequestInfo | URL) => {
    const asked = request instanceof Request ? request.url : String(request)
    const found = asked.endsWith(RIG_URL)
    return Promise.resolve(found ? new Response(rigBytes(), { status: 200 }) : new Response('not found', { status: 404 }))
  })
}

/**
 * A ready 3D Game loading glTFs through the real loader, with `entities`
 * spawned from the scene. StateMachine is registered because Animator updates
 * after it: a schedule naming an unregistered component fails closed.
 */
export async function rigGame(entities: SceneEntityJson[] = []): Promise<Game> {
  serveRig()
  const { game } = await ready3dGame(undefined, undefined, { models: new GltfModelBackend() })
  loadScene(game, scene3d(entities), registryOf({ Model, Animator, StateMachine }))
  return game
}

/** A loaded rig Game whose one entity, `Rig`, has an Animator of the given props. */
export async function animatedRig(animator: Record<string, unknown> = {}): Promise<{ game: Game; entity: Entity; animator: Animator }> {
  const game = await rigGame([rigEntity('Rig', animator)])
  await game.assets.ready()
  const entity = defined(game.find('Rig'))
  return { game, entity, animator: defined(entity.get(Animator)) }
}

/** A scene entity drawing the rig with an Animator of the given props. */
export function rigEntity(name: string, animator: Record<string, unknown> = {}): SceneEntityJson {
  return { name, components: [{ type: 'Model', props: { src: RIG_URL } }, { type: 'Animator', props: animator }] }
}

/** The rig's bones in skin order: root, leg.L and leg.R (three drops the dot from a node name: legL, legR). */
export function bonesOf(entity: Entity): THREE.Bone[] {
  const root = defined(defined(entity.get(Model)).handle, 'a model handle').root
  const skinned = meshesUnder(root).find((mesh): mesh is THREE.SkinnedMesh => mesh instanceof THREE.SkinnedMesh)
  return defined(skinned, 'a skinned mesh').skeleton.bones
}

/** A bone's local quaternion as plain numbers. */
export function quaternionOf(bone: THREE.Bone): number[] {
  return bone.quaternion.toArray()
}

/** `frames` whole Simulation Steps, each followed by the render pass. */
export function step(game: Game, frames: number): void {
  for (let frame = 0; frame < frames; frame += 1) stepFrame(game)
}
