// @vitest-environment happy-dom
import * as THREE from 'three/webgpu'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AssetLoader } from './asset-loader'
import { FakeModelBackend, FakeTextureBackend, flush } from './test-helpers'
import { defined } from '../test-support'
import { meshesUnder as meshesOf } from '../test-game-3d'

function make(resolveAsset?: (uri: string) => string): {
  loader: AssetLoader
  models: FakeModelBackend
  textures: FakeTextureBackend
} {
  const models = new FakeModelBackend()
  const textures = new FakeTextureBackend()
  const loader = new AssetLoader({ backend: textures, models, ...(resolveAsset ? { resolveAsset } : {}) })
  return { loader, models, textures }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('game.assets.model (CA-7)', () => {
  it('returns a handle at once: an empty root and no clips until the load settles', async () => {
    const { loader, models } = make()
    models.hold('/hero.glb')

    const handle = loader.model('/hero.glb')

    expect(handle.root).toBeInstanceOf(THREE.Group)
    expect(handle.root.children).toHaveLength(0)
    expect(handle.animations).toHaveLength(0)
    models.release('/hero.glb')
    expect(await handle.settled).toBe('loaded')
    expect(meshesOf(handle.root)).toHaveLength(1)
    expect(handle.animations.map((clip) => clip.name)).toEqual(['Idle'])
  })

})

describe('game.assets.model, caching (CA-7)', () => {
  it('loads a URL once and gives every handle its own clone sharing geometry and material', async () => {
    const { loader, models } = make()

    const first = loader.model('/crate.glb')
    const second = loader.model('/crate.glb')
    await Promise.all([first.settled, second.settled])
    const third = loader.model('/crate.glb')
    await third.settled

    expect(models.loadCalls).toEqual(['/crate.glb'])
    expect(loader.status).toEqual({ pending: 0, loaded: 1, failed: 0 })
    expect(first.root).not.toBe(second.root)
    const [a] = meshesOf(first.root)
    const [b] = meshesOf(second.root)
    const base = defined(models.scenes.get('/crate.glb'))
    expect(defined(a)).not.toBe(b)
    expect(defined(a).geometry).toBe(defined(b).geometry)
    expect(defined(a).material).toBe(defined(b).material)
    // Never the cached scene itself: a consumer moving its clone leaves the base alone.
    expect(first.root.children[0]).not.toBe(base)
    first.root.position.set(5, 0, 0)
    expect(base.position.toArray()).toEqual([0, 0, 0])
  })

})

describe('game.assets.model, skeletons and failures (CA-7)', () => {
  it('clones a skinned mesh with its own skeleton, so two models animate independently', async () => {
    const models = new FakeModelBackend()
    const original = models.load.bind(models)
    models.load = async (url) => {
      const loaded = await original(url)
      const bone = new THREE.Bone()
      const geometry = new THREE.BoxGeometry(1, 1, 1)
      const count = geometry.getAttribute('position').count
      geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4))
      geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(count * 4).fill(0.25), 4))
      const skinned = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial())
      skinned.add(bone)
      skinned.bind(new THREE.Skeleton([bone]))
      loaded.scene.add(skinned)
      return loaded
    }
    const loader = new AssetLoader({ backend: new FakeTextureBackend(), models })

    const a = loader.model('/rig.glb')
    const b = loader.model('/rig.glb')
    await Promise.all([a.settled, b.settled])

    const skinOf = (root: THREE.Object3D): THREE.SkinnedMesh => {
      const found = meshesOf(root).find((mesh): mesh is THREE.SkinnedMesh => mesh instanceof THREE.SkinnedMesh)
      return defined(found, 'a skinned mesh')
    }
    expect(skinOf(a.root).skeleton).not.toBe(skinOf(b.root).skeleton)
    expect(skinOf(a.root).skeleton.bones[0]).not.toBe(skinOf(b.root).skeleton.bones[0])
  })

})

describe('game.assets.model, failures (CA-7)', () => {
  it('leaves root empty and resolves settled with failed when the load fails, recorded in status', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { loader, models } = make()
    models.failUrl('/missing.glb')

    const handle = loader.model('/missing.glb')
    const again = loader.model('/missing.glb')

    expect(await handle.settled).toBe('failed')
    expect(await again.settled).toBe('failed')
    expect(handle.root.children).toHaveLength(0)
    expect(handle.animations).toHaveLength(0)
    expect(loader.status).toEqual({ pending: 0, loaded: 0, failed: 1 })
    expect(models.loadCalls).toEqual(['/missing.glb'])
    expect(warn).toHaveBeenCalledTimes(1)
  })

})

describe('game.assets.model, status and Assets Ready (CA-7)', () => {
  it('counts a pending model in status and in Assets Ready', async () => {
    const { loader, models } = make()
    models.hold('/slow.glb')
    loader.model('/slow.glb')
    expect(loader.status).toEqual({ pending: 1, loaded: 0, failed: 0 })

    let ready = false
    const waiting = loader.ready().then(() => {
      ready = true
    })
    await flush()
    expect(ready).toBe(false)

    models.release('/slow.glb')
    await waiting
    expect(ready).toBe(true)
    expect(loader.status).toEqual({ pending: 0, loaded: 1, failed: 0 })
  })

  it('waits for a texture and a model requested together', async () => {
    const { loader, models, textures } = make()
    models.hold('/a.glb')
    textures.hold('/a.png')
    loader.model('/a.glb')
    loader.texture('/a.png')
    let ready = false
    const waiting = loader.ready().then(() => {
      ready = true
    })
    models.release('/a.glb')
    await flush()
    expect(ready).toBe(false)
    textures.release('/a.png')
    await waiting
    expect(loader.status).toEqual({ pending: 0, loaded: 2, failed: 0 })
  })
})

describe('preload routing (CA-7)', () => {
  it('sends .glb and .gltf uris to models and the rest to textures, through the resolver', async () => {
    const { loader, models, textures } = make((uri) => (uri.startsWith('waica:') ? `/assets/${uri.slice(6)}` : uri))

    await loader.preload(['waica:tree.glb', '/scene.GLTF?v=2', '/ground.png', 'src/art/prop.glb#frag'])

    expect(models.loadCalls).toEqual(['/assets/tree.glb', '/scene.GLTF?v=2', 'src/art/prop.glb#frag'])
    expect(textures.loadCalls).toEqual(['/ground.png'])
    expect(loader.status).toEqual({ pending: 0, loaded: 4, failed: 0 })
  })

  it('shares one load between preload() and model()', async () => {
    const { loader, models } = make()
    await loader.preload(['/tree.glb'])
    const handle = loader.model('/tree.glb')
    await handle.settled
    expect(models.loadCalls).toEqual(['/tree.glb'])
    expect(meshesOf(handle.root)).toHaveLength(1)
  })
})

describe('dispose (CA-7)', () => {
  it('disposes the cached glTF once and forgets it', async () => {
    const { loader, models } = make()
    const handle = loader.model('/crate.glb')
    await handle.settled
    const mesh = defined(meshesOf(defined(models.scenes.get('/crate.glb')))[0])
    const geometry = vi.spyOn(mesh.geometry, 'dispose')
    const material = vi.spyOn(mesh.material as THREE.Material, 'dispose')

    loader.dispose()

    expect(geometry).toHaveBeenCalledTimes(1)
    expect(material).toHaveBeenCalledTimes(1)
    expect(loader.status).toEqual({ pending: 0, loaded: 0, failed: 0 })
    loader.model('/crate.glb')
    expect(models.loadCalls).toEqual(['/crate.glb', '/crate.glb'])
  })
})
