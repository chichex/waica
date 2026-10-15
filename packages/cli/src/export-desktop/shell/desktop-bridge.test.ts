import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { createDesktopApi, preloadSource, type BridgeIpc } from './desktop-bridge.js'

function fakeIpc(answers: Record<string, unknown> = {}) {
  const sent: unknown[][] = []
  const ipc: BridgeIpc = {
    send: (channel, ...args) => sent.push(['send', channel, ...args]),
    sendSync: (channel, ...args) => {
      sent.push(['sendSync', channel, ...args])
      return answers[channel]
    },
    invoke: (channel, ...args) => {
      sent.push(['invoke', channel, ...args])
      return Promise.resolve(answers[channel])
    },
  }
  return { ipc, sent }
}

/** Runs preload.js as Electron's sandboxed preload does: a script whose `require('electron')` gives contextBridge and ipcRenderer. */
function runPreload(ipc: BridgeIpc): Record<string, unknown> {
  const exposed: Record<string, unknown> = {}
  const electron = { contextBridge: { exposeInMainWorld: (key: string, api: unknown) => (exposed[key] = api) }, ipcRenderer: ipc }
  const require = vi.fn((id: string) => {
    if (id !== 'electron') throw new Error(`the sandboxed preload cannot require ${id}`)
    return electron
  })
  runInNewContext(preloadSource(), { require })
  return exposed
}

describe('the preload bridge (issue #200 CA-2, CA-3, CA-8)', () => {
  it('sends quit, invokes set-fullscreen and reads is-fullscreen synchronously', async () => {
    const { ipc, sent } = fakeIpc({ 'waica:is-fullscreen': true })
    const api = createDesktopApi(ipc)
    api.quit()
    await expect(api.setFullscreen(true)).resolves.toBeUndefined()
    expect(api.isFullscreen()).toBe(true)
    expect(sent).toEqual([
      ['send', 'waica:quit'],
      ['invoke', 'waica:set-fullscreen', true],
      ['sendSync', 'waica:is-fullscreen'],
    ])
  })

  it('reads anything but true from is-fullscreen as false', () => {
    expect(createDesktopApi(fakeIpc({ 'waica:is-fullscreen': 'yes' }).ipc).isFullscreen()).toBe(false)
  })

  it('preload.js is self-contained and exposes the same API as window.waicaDesktop', () => {
    const { ipc, sent } = fakeIpc()
    const exposed = runPreload(ipc)
    expect(Object.keys(exposed)).toEqual(['waicaDesktop'])
    const api = exposed['waicaDesktop'] as ReturnType<typeof createDesktopApi>
    api.quit()
    expect(sent).toEqual([['send', 'waica:quit']])
  })
})
