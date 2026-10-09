// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { THREE } from '../index'
import unitBox from './fixtures/unit-box.glb?inline'
import { GltfModelBackend } from './model-backend'
import { defined } from '../test-support'

/** The checked-in glb's bytes, decoded from the data URI Vite inlines it as. */
function fixtureBytes(): ArrayBuffer {
  const base64 = unitBox.slice(unitBox.indexOf(',') + 1)
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)).buffer
}

/** A `fetch` that serves the checked-in glb for one url and a 404 for any other. */
function serveFixture(url: string): void {
  vi.stubGlobal('fetch', (request: RequestInfo | URL) => {
    const asked = request instanceof Request ? request.url : String(request)
    const found = asked.endsWith(url)
    return Promise.resolve(found ? new Response(fixtureBytes(), { status: 200 }) : new Response('not found', { status: 404 }))
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GltfModelBackend over the real GLTFLoader (CA-19)', () => {
  it('parses a glb into a THREE.Group whose material is a MeshStandardMaterial of the engine THREE', async () => {
    serveFixture('/unit-box.glb')

    const model = await new GltfModelBackend().load('/unit-box.glb')

    expect(model.scene instanceof THREE.Group).toBe(true)
    let mesh: THREE.Mesh | undefined
    model.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) mesh = object
    })
    const box = defined(mesh, 'the fixture mesh')
    expect(box.material instanceof THREE.MeshStandardMaterial).toBe(true)
    expect(box.name).toBe('UnitBox')
    expect(box.geometry.getAttribute('position').count).toBe(8)
  })

  it('rejects a file that cannot be loaded, without throwing synchronously', async () => {
    serveFixture('/unit-box.glb')
    await expect(new GltfModelBackend().load('/missing.glb')).rejects.toBeDefined()
  })
})
