// @vitest-environment happy-dom
import * as THREE from 'three/webgpu'
import { expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { flush } from './assets/test-helpers.js'
import { ParticleEmitter } from './components/particle-emitter.js'
import { Tilemap } from './components/tilemap.js'
import { TRANSPARENT_TEXEL_ALPHA } from './render-layers.js'
import { loadScene, type SceneRenderJson } from './scene.js'
import { animatedEntity, readyGame, REGISTRY, renderFrame, scene, spriteEntity, useSpriteBatchTestEnvironment } from './test-sprite-batches.js'

useSpriteBatchTestEnvironment()

const COMPONENTS = { components: { ...REGISTRY.components, ParticleEmitter, Tilemap } }

/** Every material three would draw this frame, wherever it hangs in the scene. */
function drawnMaterials(root: THREE.Object3D): THREE.Material[] {
  const found: THREE.Material[] = []
  root.traverse((object) => {
    const mesh = object as Partial<THREE.Mesh>
    if (mesh.isMesh !== true || !mesh.material) return
    found.push(...(Array.isArray(mesh.material) ? mesh.material : [mesh.material]))
  })
  return found
}

for (const render of [undefined, { batch: false }] satisfies Array<SceneRenderJson | undefined>) {
  it(`Emissive occlusion (review #1): every drawable discards its fully transparent texels, so it writes no depth there (${render ? 'per sprite' : 'batched'})`, async () => {
    const game = await readyGame()
    loadScene(game, scene([
      spriteEntity('Sprite', { texture: '/a.png' }),
      animatedEntity('Animated', {}),
      { name: 'Ground', position: [0, 0], components: [{ type: 'Tilemap', props: { mapWidth: 2, mapHeight: 1, cells: [0, 0] } }] },
      { name: 'Sparks', position: [0, 0], components: [{ type: 'ParticleEmitter', props: {} }] },
    ], render), COMPONENTS)
    await flush()
    renderFrame(game)
    const materials = drawnMaterials(game.scene)
    expect(materials.length).toBeGreaterThanOrEqual(4)
    for (const material of materials) expect(material.alphaTest, material.type).toBe(TRANSPARENT_TEXEL_ALPHA)
    game.dispose()
  })
}

it('Emissive occlusion (review #1): the threshold discards only an alpha byte of 0', () => {
  expect(TRANSPARENT_TEXEL_ALPHA).toBeGreaterThan(0)
  expect(TRANSPARENT_TEXEL_ALPHA).toBeLessThan(1 / 255)
})
