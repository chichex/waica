// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('../../../engine/src/test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { fakeRendering, FakeWebGPURenderer, lastFakeRenderer } from '../../../engine/src/test-renderer.js'
import { use3dTestEnvironment } from '../../../engine/src/test-game-3d.js'
import { runScenario } from './harness.ts'

use3dTestEnvironment()

it('starts a real paused Game before reading its bridge and always disposes it after measurement', async () => {
  fakeRendering.init = 'webgl2'
  document.body.innerHTML = '<canvas id="game" width="1280" height="720"></canvas>'
  const original = FakeWebGPURenderer.prototype.init
  vi.spyOn(FakeWebGPURenderer.prototype, 'init').mockImplementation(function (this: FakeWebGPURenderer) {
    Object.assign(this.info, { autoReset: true })
    Object.assign(this.backend.gl, {
      RGBA: 0x1908, UNSIGNED_BYTE: 0x1401, RENDERER: 1,
      readPixels: () => {}, getExtension: () => null,
      getParameter: (name: number) => name === 0x0d33 ? 8192 : 'Fake GPU boundary',
    })
    return original.call(this)
  })

  const report = await runScenario('falling-boxes-200')

  expect(report.backend).toBe('webgl2')
  expect(report.frameMs).toHaveLength(300)
  expect(report.counters.meshes).toBe(200)
  expect(lastFakeRenderer().disposed).toBe(true)
})
