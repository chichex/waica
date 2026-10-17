// @vitest-environment happy-dom
import * as THREE from 'three/webgpu'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('../test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { authoringDefaults } from '../authoring-defaults.js'
import { FakeModelBackend } from '../assets/test-helpers.js'
import { loadScene } from '../scene.js'
import { meshesUnder, ready3dGame, registryOf, scene3d, use3dTestEnvironment } from '../test-game-3d.js'
import { bonesOf, quaternionOf, rigEntity, rigGame, step } from '../test-rig.js'
import { defined } from '../test-support.js'
import { Animator } from './animator.js'
import { Model } from './model.js'

use3dTestEnvironment()
afterEach(() => vi.unstubAllGlobals())

async function modelGame(models = new FakeModelBackend()) {
  const built = await ready3dGame(undefined, undefined, { models })
  loadScene(built.game, scene3d([]), registryOf({ Model }))
  return { ...built, models }
}

/** A backend fixture with two meshes sharing resources, under two nested groups. */
class NestedModels extends FakeModelBackend {
  override async load(url: string) {
    const loaded = await super.load(url)
    const mesh = defined(meshesUnder(loaded.scene)[0])
    const inner = new THREE.Group()
    inner.add(mesh, new THREE.Mesh(mesh.geometry, mesh.material))
    const outer = new THREE.Group()
    outer.add(inner)
    loaded.scene.add(outer)
    return loaded
  }
}

describe('Model shadow participation (issue #203 CA-4)', () => {
  it('defaults both flags to true and exposes labeled boolean controls', () => {
    expect(authoringDefaults(Model)).toMatchObject({ castShadows: true, receiveShadows: true })
    expect(Model.params).toMatchObject({
      castShadows: { label: 'Cast shadows' },
      receiveShadows: { label: 'Receive shadows' },
    })
  })

  it('enables casting and receiving on every primitive shape by default', async () => {
    const { game } = await modelGame()
    for (const shape of ['box', 'sphere', 'plane'] as const) {
      const model = game.spawn(shape).add(Model, { shape })
      const mesh = defined(meshesUnder(defined(model.root))[0])
      expect([mesh.castShadow, mesh.receiveShadow]).toEqual([true, true])
    }
  })
})

describe('Model live shadow flags (issue #203 CA-4)', () => {
  it('updates each flag independently without rebuilding the primitive', async () => {
    const { game } = await modelGame()
    const model = game.spawn('Ground').add(Model, { castShadows: false, receiveShadows: true })
    const root = defined(model.root)
    const mesh = defined(meshesUnder(root)[0])
    const geometry = mesh.geometry
    const material = mesh.material
    expect([mesh.castShadow, mesh.receiveShadow]).toEqual([false, true])

    model.castShadows = true
    model.receiveShadows = false
    expect([mesh.castShadow, mesh.receiveShadow]).toEqual([true, false])
    model.castShadows = false
    expect([mesh.castShadow, mesh.receiveShadow]).toEqual([false, false])
    expect(model.root).toBe(root)
    expect(meshesUnder(root)).toEqual([mesh])
    expect(mesh.geometry).toBe(geometry)
    expect(mesh.material).toBe(material)
  })
})

describe('Model shadow boolean normalization (issue #203 CA-4)', () => {
  it('preserves false but defaults malformed authored and live values to true', async () => {
    const { game } = await modelGame()
    const cases = [
      [false, false], [true, true], [undefined, true], [null, true],
      [0, true], [1, true], ['', true], ['false', true], ['true', true], [{}, true], [[], true],
    ] as const
    for (const [value, expected] of cases) {
      loadScene(game, scene3d([{
        name: 'Authored', components: [{ type: 'Model', props: { castShadows: value, receiveShadows: value } }],
      }]), registryOf({ Model }))
      const model = defined(defined(game.find('Authored')).get(Model))
      const mesh = defined(meshesUnder(defined(model.root))[0])
      expect([model.castShadows, model.receiveShadows, mesh.castShadow, mesh.receiveShadow]).toEqual([
        expected, expected, expected, expected,
      ])
      Object.assign(model, { castShadows: false, receiveShadows: false })
      Object.assign(model, { castShadows: value, receiveShadows: value })
      expect([model.castShadows, model.receiveShadows, mesh.castShadow, mesh.receiveShadow]).toEqual([
        expected, expected, expected, expected,
      ])
    }
  })
})

describe('Model pending glTF shadow flags (issue #203 CA-4)', () => {
  it('applies the latest flags to every nested mesh when a held glTF settles', async () => {
    const { game, models } = await modelGame(new NestedModels())
    models.hold('/nested.glb')
    const model = game.spawn('Nested').add(Model, { src: '/nested.glb', castShadows: false })
    const handle = defined(model.handle)
    model.castShadows = true
    model.receiveShadows = false

    models.release('/nested.glb')
    await game.assets.ready()

    expect(model.handle).toBe(handle)
    const meshes = meshesUnder(defined(model.root))
    expect(meshes.map((mesh) => [mesh.castShadow, mesh.receiveShadow])).toEqual([[true, false], [true, false]])
    expect(defined(handle.root.children[0]).castShadow).toBe(false)
  })
})

describe('Model cached Assets Ready (issue #203 CA-4)', () => {
  it('has the latest cache-hit mesh flags when Assets Ready resolves', async () => {
    const { game } = await modelGame()
    await game.assets.preload(['/cached.glb'])
    await game.assets.ready()
    const model = game.spawn('Cached').add(Model, { src: '/cached.glb', castShadows: false })
    model.castShadows = true
    await game.assets.ready()
    const mesh = defined(meshesUnder(defined(model.root))[0])
    expect([mesh.castShadow, mesh.receiveShadow]).toEqual([true, true])
  })
})

describe('Model shared glTF shadow flags (issue #203 CA-4)', () => {
  it('uses latest cache-hit props and keeps clone flags independent without touching shared resources', async () => {
    const { game, models } = await modelGame(new NestedModels())
    await game.assets.preload(['/shared.glb'])
    const source = defined(models.scenes.get('/shared.glb'))
    const sourceMesh = defined(meshesUnder(source)[0])
    const material = sourceMesh.material as THREE.MeshStandardMaterial
    const before = { material: material.toJSON(), geometry: sourceMesh.geometry.toJSON() }
    const first = game.spawn('First').add(Model, { src: '/shared.glb' })
    const second = game.spawn('Second').add(Model, { src: '/shared.glb', receiveShadows: false })
    second.castShadows = false
    second.receiveShadows = true
    await Promise.all([defined(first.handle).settled, defined(second.handle).settled])

    expect(meshesUnder(defined(first.root)).map((mesh) => [mesh.castShadow, mesh.receiveShadow])).toEqual([[true, true], [true, true]])
    const secondMeshes = meshesUnder(defined(second.root))
    expect(secondMeshes.map((mesh) => [mesh.castShadow, mesh.receiveShadow])).toEqual([[false, true], [false, true]])
    first.receiveShadows = false
    expect(secondMeshes.map((mesh) => [mesh.castShadow, mesh.receiveShadow])).toEqual([[false, true], [false, true]])
    for (const mesh of [...meshesUnder(defined(first.root)), ...secondMeshes]) {
      expect(mesh).not.toBe(sourceMesh)
      expect(mesh.material).toBe(sourceMesh.material)
      expect(mesh.geometry).toBe(sourceMesh.geometry)
    }
    expect(defined(meshesUnder(defined(first.root))[0])).not.toBe(secondMeshes[0])
    expect(meshesUnder(source).map((mesh) => [mesh.castShadow, mesh.receiveShadow])).toEqual([[false, false], [false, false]])
    expect({ material: material.toJSON(), geometry: sourceMesh.geometry.toJSON() }).toEqual(before)
    expect(models.loadCalls).toEqual(['/shared.glb'])
  })
})

describe('Model animated shadow flags (issue #203 CA-4)', () => {
  it('updates nested SkinnedMeshes without rebuilding or restarting the Animator', async () => {
    const game = await rigGame([rigEntity('Rig', { initialClip: 'jump', clips: { jump: { loop: false } } })])
    await game.assets.ready()
    const entity = defined(game.find('Rig'))
    const model = defined(entity.get(Model))
    const animator = defined(entity.get(Animator))
    const root = defined(model.root)
    const handle = defined(model.handle)
    const mesh = defined(meshesUnder(root)[0])
    expect(mesh).toBeInstanceOf(THREE.SkinnedMesh)
    expect(mesh.parent).not.toBe(root)
    expect([mesh.castShadow, mesh.receiveShadow]).toEqual([true, true])
    step(game, 20)
    const progress = animator.clipProgress
    const pose = bonesOf(entity).map(quaternionOf)

    model.castShadows = false
    model.receiveShadows = false
    expect([mesh.castShadow, mesh.receiveShadow]).toEqual([false, false])
    expect(model.root).toBe(root)
    expect(model.handle).toBe(handle)
    expect(meshesUnder(root)).toEqual([mesh])
    expect(animator.clipProgress).toBe(progress)
    expect(bonesOf(entity).map(quaternionOf)).toEqual(pose)
    step(game, 12)
    expect(animator.current).toBe('jump')
    expect(animator.clipFinished).toBe(true)
  })
})

describe('Model replacement shadow flags (issue #203 CA-4)', () => {
  it('retains the flags across primitive shape, source and glTF shape replacements', async () => {
    const { game } = await modelGame()
    const model = game.spawn('Swap').add(Model, { castShadows: false, receiveShadows: false })
    model.shape = 'sphere'
    expect(meshesUnder(defined(model.root)).map((mesh) => [mesh.castShadow, mesh.receiveShadow])).toEqual([[false, false]])
    model.src = '/swap.glb'
    await game.assets.ready()
    expect(meshesUnder(defined(model.root)).map((mesh) => [mesh.castShadow, mesh.receiveShadow])).toEqual([[false, false]])
    const previous = model.handle
    model.shape = 'plane'
    await defined(model.handle).settled
    expect(model.handle).not.toBe(previous)
    expect(meshesUnder(defined(model.root)).map((mesh) => [mesh.castShadow, mesh.receiveShadow])).toEqual([[false, false]])
    model.castShadows = true
    model.src = ''
    const mesh = defined(meshesUnder(defined(model.root))[0])
    expect(mesh.geometry).toBeInstanceOf(THREE.PlaneGeometry)
    expect([mesh.castShadow, mesh.receiveShadow]).toEqual([true, false])
  })
})

describe('Model stale source shadow settlement (issue #203 CA-4)', () => {
  it('ignores obsolete glTF settlements after source and primitive replacements', async () => {
    const { game, models } = await modelGame()
    models.hold('/obsolete.glb')
    const model = game.spawn('Swap').add(Model, { src: '/obsolete.glb' })
    const obsolete = defined(model.handle)
    model.src = '/current.glb'
    await defined(model.handle).settled
    model.castShadows = false
    model.receiveShadows = false
    const current = defined(model.handle)
    const mesh = defined(meshesUnder(defined(model.root))[0])
    // Hosts can customize the exposed root; an obsolete load must not rewrite it.
    mesh.castShadow = true
    models.release('/obsolete.glb')
    await obsolete.settled
    expect(model.handle).toBe(current)
    expect([mesh.castShadow, mesh.receiveShadow]).toEqual([true, false])
    expect(meshesUnder(obsolete.root).map((old) => [old.castShadow, old.receiveShadow])).toEqual([[false, false]])

    models.hold('/abandoned.glb')
    model.src = '/abandoned.glb'
    const abandoned = defined(model.handle)
    model.src = ''
    model.shape = 'sphere'
    const primitive = defined(meshesUnder(defined(model.root))[0])
    primitive.receiveShadow = true
    models.release('/abandoned.glb')
    await abandoned.settled
    expect(meshesUnder(defined(model.root))).toEqual([primitive])
    expect([primitive.castShadow, primitive.receiveShadow]).toEqual([false, true])
  })
})

describe('Model removed shadow settlement (issue #203 CA-4)', () => {
  it.each(['destroy', 'remove', 'unload'] as const)('ignores a late load after %s while a replacement uses the same file', async (operation) => {
    const { game, models } = await modelGame()
    models.hold('/late.glb')
    const entity = game.spawn('Outgoing')
    const model = entity.add(Model, { src: '/late.glb' })
    const root = defined(model.root)
    const obsolete = defined(model.handle)
    if (operation === 'remove') {
      model.onDestroy()
      entity.components.splice(entity.components.indexOf(model), 1)
    } else if (operation === 'destroy') {
      entity.destroy()
    } else {
      game.unloadScene()
      loadScene(game, scene3d([]), registryOf({ Model }))
    }
    const incoming = operation === 'remove' ? entity : game.spawn('Incoming')
    const replacement = incoming.add(Model, { src: '/late.glb', receiveShadows: false })
    models.release('/late.glb')
    await Promise.all([obsolete.settled, defined(replacement.handle).settled])

    expect(model.handle).toBeNull()
    expect(root.parent).toBeNull()
    expect(meshesUnder(root)).toEqual([])
    expect(meshesUnder(obsolete.root).map((mesh) => [mesh.castShadow, mesh.receiveShadow])).toEqual([[false, false]])
    expect(meshesUnder(defined(replacement.root)).map((mesh) => [mesh.castShadow, mesh.receiveShadow])).toEqual([[true, false]])
  })
})
