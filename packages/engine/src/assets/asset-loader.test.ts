// @vitest-environment happy-dom
import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AssetLoader } from './asset-loader'
import { FakeTextureBackend, flush } from './test-helpers'
import { ThreeTextureBackend } from './texture-backend'

function make(resolveAsset?: (uri: string) => string): { loader: AssetLoader; backend: FakeTextureBackend } {
  const backend = new FakeTextureBackend()
  const loader = new AssetLoader(resolveAsset ? { backend, resolveAsset } : { backend })
  return { loader, backend }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AssetLoader cache (CA-2)', () => {
  it('loads a URL once across texture() and preload() and hands out distinct clones over one Source', async () => {
    const { loader, backend } = make()

    const first = loader.texture('/crate.png')
    const second = loader.texture('/crate.png')
    await loader.preload(['/crate.png'])
    const third = loader.texture('/crate.png')

    expect(backend.loadCalls).toEqual(['/crate.png'])
    expect(loader.status).toEqual({ pending: 0, loaded: 1, failed: 0 })
    expect(first.texture).not.toBe(second.texture)
    expect(first.texture).not.toBe(third.texture)
    expect(first.texture.source).toBe(second.texture.source)
    expect(first.texture.source).toBe(third.texture.source)
    // Colour space is set once on the base and inherited (CA-5).
    expect(first.texture.colorSpace).toBe(THREE.SRGBColorSpace)
    expect(third.texture.colorSpace).toBe(THREE.SRGBColorSpace)
    // The image lands on the shared Source, so every clone sees it.
    expect(first.texture.image).toEqual({ width: 64, height: 64 })
    expect(third.texture.image).toEqual({ width: 64, height: 64 })
  })

  it('isolates repeat, offset and filters per clone', async () => {
    const { loader } = make()
    const a = loader.texture('/sheet.png').texture
    const b = loader.texture('/sheet.png').texture
    await loader.ready()

    a.repeat.set(0.25, 0.5)
    a.offset.set(0.75, 0.5)
    a.magFilter = THREE.NearestFilter
    a.minFilter = THREE.NearestFilter

    expect(b.repeat.toArray()).toEqual([1, 1])
    expect(b.offset.toArray()).toEqual([0, 0])
    expect(b.magFilter).toBe(THREE.LinearFilter)
    expect(b.minFilter).toBe(THREE.LinearMipmapLinearFilter)
  })

  it('keeps a clone handed out mid-flight unuploadable until its image arrives, then marks it', async () => {
    const { loader, backend } = make()
    backend.hold('/late.png')

    const early = loader.texture('/late.png')
    expect(early.texture.version).toBe(0)
    expect(early.texture.image).toBeNull()

    backend.release('/late.png')
    await expect(early.settled).resolves.toBe('loaded')
    expect(early.texture.version).toBeGreaterThan(0)
    expect(early.texture.image).toEqual({ width: 64, height: 64 })

    const late = loader.texture('/late.png')
    expect(late.texture.version).toBeGreaterThan(0)
    expect(late.texture.source).toBe(early.texture.source)
  })
})

describe('AssetLoader status and ready() (CA-3)', () => {
  it('counts URLs, not requests, in a fresh object on every read', async () => {
    const { loader, backend } = make()
    backend.hold('/b.png')

    loader.texture('/a.png')
    loader.texture('/a.png')
    loader.texture('/b.png')

    const before = loader.status
    expect(before).toEqual({ pending: 2, loaded: 0, failed: 0 })
    expect(loader.status).not.toBe(before)
    await flush()
    expect(loader.status).toEqual({ pending: 1, loaded: 1, failed: 0 })
    backend.release('/b.png')
    await flush()
    expect(loader.status).toEqual({ pending: 0, loaded: 2, failed: 0 })
  })

  it('resolves at once with nothing pending and does not cover a request made afterwards', async () => {
    const { loader, backend } = make()
    let resolved = false
    const first = loader.ready().then(() => {
      resolved = true
    })
    await flush()
    expect(resolved).toBe(true)

    backend.hold('/after.png')
    loader.texture('/after.png')
    let second = false
    const later = loader.ready().then(() => {
      second = true
    })
    await flush()
    expect(second).toBe(false)
    expect(loader.status.pending).toBe(1)
    backend.release('/after.png')
    await flush()
    expect(second).toBe(true)
    await Promise.all([first, later])
  })

  it('waits for a URL requested while waiting and resolves every concurrent caller', async () => {
    const { loader, backend } = make()
    backend.hold('/first.png')
    backend.hold('/second.png')
    loader.texture('/first.png')
    const outcomes: string[] = []
    const one = loader.ready().then(() => outcomes.push('one'))
    const two = loader.ready().then(() => outcomes.push('two'))

    loader.texture('/second.png')
    backend.release('/first.png')
    await flush()
    expect(outcomes).toEqual([])
    expect(loader.status).toEqual({ pending: 1, loaded: 1, failed: 0 })

    backend.release('/second.png')
    await flush()
    expect(outcomes.sort()).toEqual(['one', 'two'])
    await Promise.all([one, two])
  })

  it('resolves after the settled continuations a consumer chained before waiting', async () => {
    const { loader, backend } = make()
    backend.hold('/tiles.png')
    const order: string[] = []
    const handle = loader.texture('/tiles.png')
    const consumer = handle.settled.then(() => order.push('consumer'))
    const ready = loader.ready().then(() => order.push('ready'))

    backend.release('/tiles.png')
    await flush()

    expect(order).toEqual(['consumer', 'ready'])
    await Promise.all([consumer, ready])
  })
})

describe('AssetLoader failures (CA-4)', () => {
  it('warns once per URL, counts the failure, settles every handle as failed and never retries', async () => {
    const { loader, backend } = make()
    backend.failUrl('/missing.png')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const first = loader.texture('/missing.png')
    const second = loader.texture('/missing.png')
    await expect(first.settled).resolves.toBe('failed')
    await expect(second.settled).resolves.toBe('failed')
    await loader.ready()

    expect(loader.status).toEqual({ pending: 0, loaded: 0, failed: 1 })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('[waica] assets: failed to load "/missing.png"', expect.any(Error))
    expect(first.texture.image).toBeNull()
    expect(first.texture.version).toBe(0)

    const again = loader.texture('/missing.png')
    await expect(again.settled).resolves.toBe('failed')
    expect(backend.loadCalls).toEqual(['/missing.png'])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(loader.status).toEqual({ pending: 0, loaded: 0, failed: 1 })
  })
})

describe('AssetLoader preload (CA-7)', () => {
  it('resolves uris through the resolver, dedupes to one backend call and never rejects', async () => {
    const { loader, backend } = make((uri) =>
      uri.startsWith('waica:') ? `/resolved/${uri.slice('waica:'.length)}.png` : uri,
    )
    backend.failUrl('/resolved/broken.png')
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await loader.preload([...Array.from({ length: 10 }, () => 'waica:tree'), '/plain.png', 'waica:broken'])

    expect(backend.loadCalls).toEqual(['/resolved/tree.png', '/plain.png', '/resolved/broken.png'])
    expect(loader.status).toEqual({ pending: 0, loaded: 2, failed: 1 })
    // A component asking for the resolved URL afterwards is a cache hit.
    loader.texture('/resolved/tree.png')
    expect(backend.loadCalls).toHaveLength(3)
  })

  it('is identity without a resolver', async () => {
    const { loader, backend } = make()
    await loader.preload(['waica:tree'])
    expect(backend.loadCalls).toEqual(['waica:tree'])
  })
})

describe('AssetLoader dispose() (CA-6)', () => {
  it('disposes every cached base exactly once, never a clone, and zeroes the status', async () => {
    const { loader, backend } = make()
    const dispose = vi.spyOn(THREE.Texture.prototype, 'dispose')
    const crate = loader.texture('/crate.png').texture
    const crateAgain = loader.texture('/crate.png').texture
    const tree = loader.texture('/tree.png').texture
    await loader.ready()
    expect(loader.status).toEqual({ pending: 0, loaded: 2, failed: 0 })

    loader.dispose()

    expect(loader.status).toEqual({ pending: 0, loaded: 0, failed: 0 })
    const disposed = dispose.mock.instances as THREE.Texture[]
    expect(disposed).toHaveLength(2)
    expect(disposed).not.toContain(crate)
    expect(disposed).not.toContain(crateAgain)
    expect(disposed).not.toContain(tree)
    expect(disposed.map((texture) => texture.source).sort()).toEqual([crate.source, tree.source].sort())

    loader.dispose()
    expect(dispose).toHaveBeenCalledTimes(2)
    // A request after dispose() starts over: a new base, a new backend call.
    loader.texture('/crate.png')
    expect(backend.loadCalls).toEqual(['/crate.png', '/tree.png', '/crate.png'])
  })

  it('ignores a load that settles after dispose(): no warning, no write on the disposed base, counters at zero', async () => {
    const { loader, backend } = make()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    backend.hold('/late.png')
    backend.hold('/broken.png')
    backend.failUrl('/broken.png')
    const late = loader.texture('/late.png')
    const broken = loader.texture('/broken.png')
    expect(loader.status).toEqual({ pending: 2, loaded: 0, failed: 0 })

    loader.dispose()
    backend.release('/late.png')
    backend.release('/broken.png')

    // The settlement is still owed, so nobody awaiting it hangs; it reports what the backend did.
    await expect(late.settled).resolves.toBe('loaded')
    await expect(broken.settled).resolves.toBe('failed')
    expect(warn).not.toHaveBeenCalled()
    // The image never lands on the disposed base, so the clone sharing its Source stays empty.
    expect(late.texture.image).toBeNull()
    expect(late.texture.version).toBe(0)
    expect(loader.status).toEqual({ pending: 0, loaded: 0, failed: 0 })
  })
})

describe('the default backend (CA-8)', () => {
  it('wraps THREE.TextureLoader in a promise that never throws synchronously in happy-dom', async () => {
    const backend = new ThreeTextureBackend()
    let outcome: 'pending' | 'resolved' | 'rejected' = 'pending'

    const promise = backend.load('/never-decoded.png')
    expect(promise).toBeInstanceOf(Promise)
    void promise.then(
      () => {
        outcome = 'resolved'
      },
      () => {
        outcome = 'rejected'
      },
    )
    await flush()

    expect(outcome).toBe('pending')
  })
})
