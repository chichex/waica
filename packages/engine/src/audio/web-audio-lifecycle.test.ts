import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebAudioBackend } from './web-audio-backend.js'

class RejectingAudioContext {
  readonly destination = {}
  createGain(): { gain: { value: number }; connect(): void } {
    return { gain: { value: 1 }, connect: () => {} }
  }
  suspend(): Promise<void> {
    return Promise.reject(new Error('suspend refused'))
  }
  resume(): Promise<void> {
    return Promise.reject(new Error('resume refused'))
  }
  close(): Promise<void> {
    return Promise.reject(new Error('close refused'))
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}

describe('WebAudioBackend context lifecycle', () => {
  it('reports a rejected resume, suspend or close instead of leaving it unhandled', async () => {
    vi.stubGlobal('AudioContext', RejectingAudioContext)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const backend = new WebAudioBackend()

    backend.resume()
    backend.suspend()
    backend.close()
    await settle()

    expect(error.mock.calls.map((call) => String(call[0]))).toEqual([
      '[waica] audio resume failed: resume refused',
      '[waica] audio suspend failed: suspend refused',
      '[waica] audio close failed: close refused',
    ])
  })
})
