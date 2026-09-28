// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemFS, RealFS, SCENE_PATH, type ProjectFS } from './fs/project-fs'
import type { StoredSession } from './fs/session'

/**
 * Characterization of App: which screen it shows for the stored session, and
 * how opening, closing, resuming and deleting move between Home and the
 * Editor. Home and the Editor stand in as stubs exposing their callbacks.
 */

const session = vi.hoisted(() => ({
  stored: null as StoredSession | null,
  saveSession: vi.fn<(name: string, handle: unknown) => Promise<void>>(() => Promise.resolve()),
  clearSession: vi.fn<() => Promise<void>>(() => Promise.resolve()),
}))
vi.mock('./fs/session', () => ({
  loadSession: () => Promise.resolve(session.stored),
  saveSession: session.saveSession,
  clearSession: session.clearSession,
}))

const recents = vi.hoisted(() => ({
  granted: true,
  saveRecent: vi.fn<(name: string, handle: unknown) => Promise<void>>(() => Promise.resolve()),
}))
vi.mock('./fs/recents', () => ({
  saveRecent: recents.saveRecent,
  ensurePermission: () => Promise.resolve(recents.granted),
}))

interface HomeStubProps {
  onOpen: (fs: ProjectFS) => void
  resume?: StoredSession | null
  onResume?: () => void
  onDeleted?: (name: string) => void
}

vi.mock('./home/Home', () => ({
  Home: ({ onOpen, resume, onResume, onDeleted }: HomeStubProps) => (
    <section aria-label="home">
      {resume && <button onClick={onResume}>{`resume ${resume.name}`}</button>}
      <button onClick={() => onOpen(new MemFS('demo', {}))}>open demo</button>
      <button onClick={() => onOpen(new RealFS('disk-game', folder(true)))}>open disk game</button>
      <button onClick={() => onDeleted?.('last-game')}>deleted last-game</button>
      <button onClick={() => onDeleted?.('other-game')}>deleted other-game</button>
    </section>
  ),
}))

vi.mock('./editor/Editor', () => ({
  Editor: ({ fs, onClose }: { fs: ProjectFS; onClose: () => void }) => (
    <section aria-label="editor">
      <p>{`editing ${fs.name}`}</p>
      <button onClick={onClose}>close editor</button>
    </section>
  ),
}))

/** A project folder handle: it holds the main scene or not, and grants access or not. */
function folder(hasScene: boolean, permission: PermissionState = 'granted'): FileSystemDirectoryHandle {
  const file = { getFile: () => Promise.resolve({ text: () => Promise.resolve('{}') }) }
  const missing = (): Promise<never> => Promise.reject(new DOMException('missing', 'NotFoundError'))
  const dir = {
    queryPermission: () => Promise.resolve(permission),
    getDirectoryHandle: () => (hasScene ? Promise.resolve(dir) : missing()),
    getFileHandle: (name: string) =>
      hasScene && SCENE_PATH.endsWith(name) ? Promise.resolve(file) : missing(),
  }
  return dir as unknown as FileSystemDirectoryHandle
}

function stored(handle: FileSystemDirectoryHandle): StoredSession {
  return { name: 'last-game', handle, openedAt: 1 }
}

const alertStub = vi.fn<(message?: string) => void>()

import { App } from './App'

beforeEach(() => {
  session.stored = null
  recents.granted = true
  vi.stubGlobal('alert', alertStub)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  for (const stub of [session.saveSession, session.clearSession, recents.saveRecent, alertStub]) stub.mockClear()
})

describe('App characterization: the stored session', () => {
  it('shows Home when there is no session to come back to', async () => {
    render(<App />, { reactStrictMode: true })

    expect(await screen.findByRole('region', { name: 'home' })).toBeDefined()
    expect(screen.queryByRole('button', { name: /resume/ })).toBeNull()
  })

  it('reopens the last project straight away when the folder is still allowed', async () => {
    session.stored = stored(folder(true))
    render(<App />, { reactStrictMode: true })

    expect(await screen.findByText('editing last-game')).toBeDefined()
    expect(recents.saveRecent).toHaveBeenCalledWith('last-game', expect.anything())
  })

  it('forgets a session whose folder lost its scene', async () => {
    session.stored = stored(folder(false))
    render(<App />, { reactStrictMode: true })

    expect(await screen.findByRole('region', { name: 'home' })).toBeDefined()
    await vi.waitFor(() => expect(session.clearSession).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /resume/ })).toBeNull()
  })
})

describe('App characterization: resuming', () => {
  it('offers to resume a folder that needs permission again, and opens it', async () => {
    session.stored = stored(folder(true, 'prompt'))
    render(<App />, { reactStrictMode: true })

    await userEvent.setup().click(await screen.findByRole('button', { name: 'resume last-game' }))

    expect(await screen.findByText('editing last-game')).toBeDefined()
    expect(recents.saveRecent).toHaveBeenCalledWith('last-game', expect.anything())
  })

  it('drops the resume card when the folder moved', async () => {
    session.stored = stored(folder(false, 'prompt'))
    render(<App />, { reactStrictMode: true })

    await userEvent.setup().click(await screen.findByRole('button', { name: 'resume last-game' }))

    await vi.waitFor(() => expect(alertStub).toHaveBeenCalledOnce())
    expect(screen.queryByRole('button', { name: 'resume last-game' })).toBeNull()
    expect(session.clearSession).toHaveBeenCalled()
  })

  it('drops the resume card when that folder is deleted, and only that one', async () => {
    session.stored = stored(folder(true, 'prompt'))
    render(<App />, { reactStrictMode: true })
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'deleted other-game' }))
    expect(screen.getByRole('button', { name: 'resume last-game' })).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'deleted last-game' }))

    expect(screen.queryByRole('button', { name: 'resume last-game' })).toBeNull()
    expect(session.clearSession).toHaveBeenCalledOnce()
  })
})

describe('App characterization: opening and closing', () => {
  it('opens a demo without storing a session, and closes back to Home', async () => {
    render(<App />, { reactStrictMode: true })
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'open demo' }))
    expect(screen.getByText('editing demo')).toBeDefined()
    expect(session.saveSession).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'close editor' }))
    expect(screen.getByRole('region', { name: 'home' })).toBeDefined()
    expect(session.clearSession).toHaveBeenCalledOnce()
  })

  it('stores the session of a project on disk', async () => {
    render(<App />, { reactStrictMode: true })

    await userEvent.setup().click(await screen.findByRole('button', { name: 'open disk game' }))

    expect(screen.getByText('editing disk-game')).toBeDefined()
    expect(session.saveSession).toHaveBeenCalledWith('disk-game', expect.anything())
  })
})
