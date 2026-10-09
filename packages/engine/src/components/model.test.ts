// @vitest-environment happy-dom
import * as THREE from 'three/webgpu'
import { describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('../test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { authoringDefaults } from '../authoring-defaults.js'
import { flush } from '../assets/test-helpers.js'
import { loadScene } from '../scene.js'
import { meshesUnder as meshesOf, ready3dGame, registryOf, scene3d, use3dTestEnvironment, type Game3d } from '../test-game-3d.js'
import { defined } from '../test-support.js'
import { Model } from './model.js'

use3dTestEnvironment()

/** A ready Game with an empty 3D scene loaded: a Model draws only in one. */
async function ready3dModelGame(): Promise<Game3d> {
  const built = await ready3dGame()
  loadScene(built.game, scene3d([]), registryOf({ Model }))
  return built
}

describe('Model in a 2D scene (CA-9)', () => {
  it('creates nothing: no root, no mesh, like Sun and PointLight', async () => {
    const { game } = await ready3dGame()
    loadScene(game, { waicaScene: 3, entities: [] }, registryOf({ Model }))
    const entity = game.spawn('Crate')

    const model = entity.add(Model, { shape: 'box' })

    expect(model.root).toBeNull()
    expect(entity.node.children).toHaveLength(0)
    expect(() => entity.destroy()).not.toThrow()
  })

  it('ignores a later shape or src change without building anything', async () => {
    const { game } = await ready3dGame()
    loadScene(game, { waicaScene: 3, entities: [] }, registryOf({ Model }))
    const entity = game.spawn('Crate')
    const model = entity.add(Model)

    model.shape = 'sphere'
    model.src = '/tree.glb'

    expect(entity.node.children).toHaveLength(0)
  })
})

describe('Model primitives (CA-9)', () => {
  it('draws a box of the given color and size under the entity node, with a standard node material', async () => {
    const { game } = await ready3dModelGame()
    const entity = game.spawn('Crate')

    const model = entity.add(Model, { shape: 'box', color: 0xff0000, size: 2 })

    const root = defined(model.root)
    expect(root.parent).toBe(entity.node)
    const [mesh] = meshesOf(root)
    expect(defined(mesh).geometry).toBeInstanceOf(THREE.BoxGeometry)
    expect(defined(mesh).material).toBeInstanceOf(THREE.MeshStandardNodeMaterial)
    expect((defined(mesh).material as THREE.MeshStandardNodeMaterial).color.getHex()).toBe(0xff0000)
    expect(defined(mesh).scale.toArray()).toEqual([2, 2, 2])
  })

  it.each([
    ['sphere', THREE.SphereGeometry],
    ['plane', THREE.PlaneGeometry],
    ['box', THREE.BoxGeometry],
  ] as const)('draws a %s', async (shape, Geometry) => {
    const { game } = await ready3dModelGame()
    const model = game.spawn('Thing').add(Model, { shape })
    expect(defined(meshesOf(defined(model.root))[0]).geometry).toBeInstanceOf(Geometry)
  })

})

describe('Model primitives, shapes (CA-9)', () => {
  it('lays a plane flat on the ground: its normal points up', async () => {
    const { game } = await ready3dModelGame()
    const model = game.spawn('Ground').add(Model, { shape: 'plane' })
    const geometry = defined(meshesOf(defined(model.root))[0]).geometry
    const normal = geometry.getAttribute('normal')
    expect([normal.getX(0), normal.getY(0), normal.getZ(0)].map((n) => Math.round(n))).toEqual([0, 1, 0])
  })

  it('defaults to a white unit box', async () => {
    const { game } = await ready3dModelGame()
    const model = game.spawn('Default').add(Model)
    const mesh = defined(meshesOf(defined(model.root))[0])
    expect(mesh.geometry).toBeInstanceOf(THREE.BoxGeometry)
    expect((mesh.material as THREE.MeshStandardNodeMaterial).color.getHex()).toBe(0xffffff)
    expect(mesh.scale.toArray()).toEqual([1, 1, 1])
  })

  it('updates the live mesh when color or size change, and rebuilds it when the shape changes', async () => {
    const { game } = await ready3dModelGame()
    const model = game.spawn('Live').add(Model, { shape: 'box' })
    const first = defined(meshesOf(defined(model.root))[0])

    model.color = 0x00ff00
    model.size = 3
    expect((first.material as THREE.MeshStandardNodeMaterial).color.getHex()).toBe(0x00ff00)
    expect(first.scale.toArray()).toEqual([3, 3, 3])

    const geometry = vi.spyOn(first.geometry, 'dispose')
    const material = vi.spyOn(first.material as THREE.Material, 'dispose')
    model.shape = 'sphere'
    const meshes = meshesOf(defined(model.root))
    expect(meshes).toHaveLength(1)
    expect(defined(meshes[0]).geometry).toBeInstanceOf(THREE.SphereGeometry)
    expect((defined(meshes[0]).material as THREE.MeshStandardNodeMaterial).color.getHex()).toBe(0x00ff00)
    expect(geometry).toHaveBeenCalledTimes(1)
    expect(material).toHaveBeenCalledTimes(1)
  })
})

describe('Model glTF (CA-9)', () => {
  it('draws the cached glTF under its root and keeps the file\'s own materials', async () => {
    const { game, models } = await ready3dModelGame()
    const model = game.spawn('Tree').add(Model, { src: '/tree.glb' })
    expect(defined(model.root).parent).toBe(game.entities[0]?.node)
    expect(meshesOf(defined(model.root))).toHaveLength(0)

    await game.assets.ready()

    const [mesh] = meshesOf(defined(model.root))
    const base = defined(meshesOf(defined(models.scenes.get('/tree.glb')))[0])
    expect(defined(mesh).material).toBe(base.material)
    expect(defined(mesh).material).toBeInstanceOf(THREE.MeshStandardMaterial)
    expect(models.loadCalls).toEqual(['/tree.glb'])
  })

})

describe('Model glTF, precedence and disposal (CA-9)', () => {
  it('lets src win over shape: no primitive is built', async () => {
    const { game } = await ready3dModelGame()
    const model = game.spawn('Both').add(Model, { src: '/tree.glb', shape: 'sphere' })
    await game.assets.ready()
    const geometries = meshesOf(defined(model.root)).map((mesh) => mesh.geometry.type)
    expect(geometries).toEqual(['BoxGeometry'])
    expect(geometries).not.toContain('SphereGeometry')
  })

  it('does not dispose the cached glTF on destroy, but removes its root', async () => {
    const { game, models } = await ready3dModelGame()
    const entity = game.spawn('Tree')
    const model = entity.add(Model, { src: '/tree.glb' })
    await game.assets.ready()
    const base = defined(meshesOf(defined(models.scenes.get('/tree.glb')))[0])
    const geometry = vi.spyOn(base.geometry, 'dispose')
    const material = vi.spyOn(base.material as THREE.Material, 'dispose')
    const root = defined(model.root)

    entity.destroy()

    expect(root.parent).toBeNull()
    expect(geometry).not.toHaveBeenCalled()
    expect(material).not.toHaveBeenCalled()
  })

  it('disposes the primitive geometry and material it created on destroy', async () => {
    const { game } = await ready3dModelGame()
    const entity = game.spawn('Box')
    const model = entity.add(Model, { shape: 'box' })
    const mesh = defined(meshesOf(defined(model.root))[0])
    const geometry = vi.spyOn(mesh.geometry, 'dispose')
    const material = vi.spyOn(mesh.material as THREE.Material, 'dispose')

    entity.destroy()

    expect(geometry).toHaveBeenCalledTimes(1)
    expect(material).toHaveBeenCalledTimes(1)
    expect(defined(model.root).parent).toBeNull()
  })

})

describe('Model glTF, swapping and late loads (CA-9)', () => {
  it('swaps the glTF when src changes, loading the new file', async () => {
    const { game, models } = await ready3dModelGame()
    const model = game.spawn('Swap').add(Model, { src: '/a.glb' })
    await game.assets.ready()
    model.src = '/b.glb'
    await game.assets.ready()
    await flush()
    expect(models.loadCalls).toEqual(['/a.glb', '/b.glb'])
    const names = meshesOf(defined(model.root)).map((mesh) => mesh.name)
    expect(names).toEqual(['mesh:/b.glb'])
  })

  it('ignores a glTF that settles after the model was destroyed or swapped away', async () => {
    const { game, models } = await ready3dModelGame()
    models.hold('/late.glb')
    const entity = game.spawn('Late')
    const model = entity.add(Model, { src: '/late.glb' })
    entity.destroy()
    models.release('/late.glb')
    await flush()
    expect(meshesOf(defined(model.root))).toHaveLength(0)
  })
})

describe('Model through a scene (CA-9)', () => {
  it('resolves src through the registry like a texture: waica: uris and project paths', async () => {
    const { game, models } = await ready3dModelGame()
    const registry = registryOf({ Model })
    loadScene(
      game,
      scene3d([
        { name: 'A', components: [{ type: 'Model', props: { src: 'waica:tree.glb' } }] },
        { name: 'B', components: [{ type: 'Model', props: { src: 'src/art/rock.glb' } }] },
      ]),
      registry,
    )
    await game.assets.ready()
    expect([...models.loadCalls].sort()).toEqual(['/assets/tree.glb', 'src/art/rock.glb'])
  })

  it('exposes src, shape, color and size to the inspector and to list_components', () => {
    expect(Model.componentName).toBe('Model')
    expect(Model.params).toMatchObject({
      src: { kind: 'model' },
      shape: { options: ['box', 'sphere', 'plane'] },
      color: { kind: 'color' },
    })
    expect(Model.params?.size?.min).toBeGreaterThan(0)
    expect(authoringDefaults(Model)).toEqual({ src: '', shape: 'box', color: 0xffffff, size: 1 })
  })
})
