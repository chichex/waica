import { describe, expect, it } from 'vitest'
import { captureRenderer, countDraws, renderBackendOf, syncGpu, type BenchRenderer } from './draw-counter.ts'

/** A renderer as the bench sees it: three's per-frame info and the backend init() settled on. */
function fakeRenderer(backend: object): BenchRenderer & { draw(): void } {
  const info = { render: { drawCalls: 0 } }
  return {
    info,
    backend,
    draw: () => {
      info.render.drawCalls += 1
    },
  }
}

describe('captureRenderer', () => {
  it('remembers the renderer whose init() ran, and still runs the original init', async () => {
    const inits: unknown[] = []
    class Renderer {
      init(): Promise<this> {
        inits.push(this)
        return Promise.resolve(this)
      }
    }
    const capture = captureRenderer(Renderer.prototype)
    expect(capture.current).toBeNull()

    const renderer = new Renderer()
    await renderer.init()

    expect(capture.current).toBe(renderer)
    expect(inits).toEqual([renderer])
    capture.uninstall()
  })

  it('restores the prototype on uninstall', () => {
    class Renderer {
      init(): Promise<void> {
        return Promise.resolve()
      }
    }
    const original = Object.getOwnPropertyDescriptor(Renderer.prototype, 'init')
    const capture = captureRenderer(Renderer.prototype)
    capture.uninstall()

    expect(Object.getOwnPropertyDescriptor(Renderer.prototype, 'init')).toEqual(original)
  })
})

describe('countDraws', () => {
  it("counts the draw calls renderer.info records while the frame runs, whatever it held before", () => {
    const renderer = fakeRenderer({})
    renderer.draw()

    const calls = countDraws(renderer, () => {
      renderer.draw()
      renderer.draw()
    })

    expect(calls).toBe(2)
  })
})

describe('renderBackendOf', () => {
  it('names the Render Backend init() settled on', () => {
    expect(renderBackendOf(fakeRenderer({ isWebGPUBackend: true }))).toBe('webgpu')
    expect(renderBackendOf(fakeRenderer({ isWebGLBackend: true }))).toBe('webgl2')
  })
})

describe('syncGpu', () => {
  it('waits for the WebGPU queue to finish the work submitted so far', async () => {
    let done = false
    const device = {
      queue: {
        onSubmittedWorkDone: () =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              done = true
              resolve()
            }, 0)
          }),
      },
    }

    await syncGpu(fakeRenderer({ isWebGPUBackend: true, device }))

    expect(done).toBe(true)
  })

  it('drains the WebGL2 pipeline with one 1x1 readPixels on the renderer context', async () => {
    const reads: unknown[][] = []
    const gl = { RGBA: 6408, UNSIGNED_BYTE: 5121, readPixels: (...args: unknown[]) => reads.push(args) }

    await syncGpu(fakeRenderer({ isWebGLBackend: true, gl }))

    expect(reads).toHaveLength(1)
    expect(reads[0]?.slice(0, 6)).toEqual([0, 0, 1, 1, 6408, 5121])
  })

  it('fails on a backend it cannot sync, instead of timing an unsynced frame', async () => {
    await expect(syncGpu(fakeRenderer({}))).rejects.toThrow(/GPU sync/)
  })
})
