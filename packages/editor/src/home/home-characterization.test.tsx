// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defined } from '../../../engine/src/test-support'
import type { ProjectFS } from '../fs/project-fs'
import type { RecentProject } from '../fs/recents'

/**
 * Characterization of Home: what it offers with and without the File System
 * Access API, and what each card and recent entry does. Recents storage and
 * folder deletion are stubbed; folders are small in-memory handles.
 */

const recents = vi.hoisted(() => ({
  list: [] as RecentProject[],
  saveRecent: vi.fn<(name: string, handle: unknown) => Promise<void>>(() => Promise.resolve()),
  removeRecent: vi.fn<(name: string) => Promise<void>>(() => Promise.resolve()),
}))

vi.mock('../fs/recents', () => ({
  listRecents: () => Promise.resolve([...recents.list]),
  saveRecent: recents.saveRecent,
  removeRecent: (name: string) => {
    recents.list = recents.list.filter((recent) => recent.name !== name)
    return recents.removeRecent(name)
  },
  ensurePermission: () => Promise.resolve(true),
}))

const deleteProjectFolder = vi.hoisted(() =>
  vi.fn<(handle: unknown) => Promise<string>>(() => Promise.resolve('deleted')),
)
vi.mock('../fs/delete-project', () => ({ deleteProjectFolder }))

import { Home } from './Home'

/** A folder handle held in memory: enough of the File System Access API for RealFS. */
class FakeDir {
  readonly kind = 'directory'
  readonly dirs = new Map<string, FakeDir>()
  readonly files = new Map<string, string>()
  constructor(readonly name: string) {}

  async *entries(): AsyncGenerator<[string, { kind: string }]> {
    await Promise.resolve()
    for (const entry of this.dirs) yield entry
    for (const name of this.files.keys()) yield [name, { kind: 'file' }]
  }

  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FakeDir> {
    const existing = this.dirs.get(name)
    if (existing) return Promise.resolve(existing)
    if (!options?.create) return Promise.reject(new DOMException('missing', 'NotFoundError'))
    const dir = new FakeDir(name)
    this.dirs.set(name, dir)
    return Promise.resolve(dir)
  }

  getFileHandle(name: string, options?: { create?: boolean }) {
    if (!this.files.has(name) && !options?.create) {
      return Promise.reject(new DOMException('missing', 'NotFoundError'))
    }
    return Promise.resolve({
      getFile: () => Promise.resolve({ text: () => Promise.resolve(this.files.get(name) ?? '') }),
      createWritable: () =>
        Promise.resolve({
          write: (content: string) => {
            this.files.set(name, typeof content === 'string' ? content : '<bytes>')
            return Promise.resolve()
          },
          close: () => Promise.resolve(),
        }),
    })
  }

  /** The text of `path` below this folder, or undefined. */
  read(path: string): string | undefined {
    const slash = path.indexOf('/')
    if (slash === -1) return this.files.get(path)
    return this.dirs.get(path.slice(0, slash))?.read(path.slice(slash + 1))
  }
}

function asHandle(dir: FakeDir): FileSystemDirectoryHandle {
  return dir as unknown as FileSystemDirectoryHandle
}

const confirmStub = vi.fn((): boolean => true)
const alertStub = vi.fn((): void => {})
const pickerStub = vi.fn<(options?: unknown) => Promise<FileSystemDirectoryHandle>>(() =>
  Promise.reject(new Error('unset')),
)

function renderHome(props: Partial<Parameters<typeof Home>[0]> = {}) {
  const onOpen = vi.fn<(fs: ProjectFS) => void>()
  const onDeleted = vi.fn<(name: string) => void>()
  render(<Home onOpen={onOpen} onDeleted={onDeleted} {...props} />, { reactStrictMode: true })
  return { onOpen, onDeleted, user: userEvent.setup() }
}

beforeEach(() => {
  recents.list = []
  vi.stubGlobal('confirm', confirmStub)
  vi.stubGlobal('alert', alertStub)
  vi.stubGlobal('showDirectoryPicker', pickerStub)
  vi.stubGlobal('fetch', () => Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  for (const stub of [confirmStub, alertStub, pickerStub, recents.saveRecent, recents.removeRecent, deleteProjectFolder]) {
    stub.mockClear()
  }
  confirmStub.mockImplementation(() => true)
})

describe('Home characterization: without the folder API', () => {
  it('offers only the in-memory demo, and opens it', async () => {
    vi.stubGlobal('showDirectoryPicker', undefined)
    const { onOpen, user } = renderHome()

    expect(screen.getByRole('button', { name: /Create project/ })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: /Open project/ })).toHaveProperty('disabled', true)
    expect(screen.getByText(/requires Chrome or Edge/)).toBeDefined()
    await user.click(screen.getByRole('button', { name: /Try the demo/ }))

    await vi.waitFor(() => expect(onOpen).toHaveBeenCalledOnce())
    const fs = defined(onOpen.mock.calls[0]?.[0])
    expect(fs.name).toBe('waica-demo')
    expect(fs.kind).toBe('memory')
  })

  it('offers to continue the last session', async () => {
    const onResume = vi.fn()
    const { user } = renderHome({
      resume: { name: 'last-game', handle: asHandle(new FakeDir('last-game')), openedAt: 1 },
      onResume,
    })

    await user.click(screen.getByRole('button', { name: /Continue “last-game”/ }))

    expect(onResume).toHaveBeenCalledOnce()
  })
})

describe('Home characterization: creating a project', () => {
  it('scaffolds the picked archetype into a new folder and opens it', async () => {
    const parent = new FakeDir('games')
    pickerStub.mockResolvedValue(asHandle(parent))
    const { onOpen, user } = renderHome()

    await user.click(screen.getByRole('button', { name: /Create project/ }))
    await user.click(screen.getByRole('button', { name: /Platformer/ }))
    await user.click(screen.getByRole('button', { name: /Blank/ }))
    await user.click(screen.getByRole('button', { name: 'Pick a folder and create' }))

    await vi.waitFor(() => expect(onOpen).toHaveBeenCalledOnce())
    expect(defined(onOpen.mock.calls[0]?.[0]).name).toBe('my-game')
    expect(parent.dirs.get('my-game')?.read('src/scenes/main.scene.json')).toBeDefined()
    expect(recents.saveRecent).toHaveBeenCalledWith('my-game', expect.anything())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('refuses to overwrite a folder that already holds something', async () => {
    const parent = new FakeDir('games')
    const taken = new FakeDir('my-game')
    taken.files.set('keep.txt', 'mine')
    parent.dirs.set('my-game', taken)
    pickerStub.mockResolvedValue(asHandle(parent))
    const { onOpen, user } = renderHome()

    await user.click(screen.getByRole('button', { name: /Create project/ }))
    await user.click(screen.getByRole('button', { name: /Platformer/ }))
    await user.click(screen.getByRole('button', { name: 'Pick a folder and create' }))

    await vi.waitFor(() =>
      expect(alertStub).toHaveBeenCalledWith(
        '"games" already has "my-game" — pick another name or another folder.',
      ),
    )
    expect(onOpen).not.toHaveBeenCalled()
  })
})

describe('Home characterization: opening a folder', () => {
  it('opens a folder that has a main scene', async () => {
    const folder = new FakeDir('old-game')
    const scenes = await (await folder.getDirectoryHandle('src', { create: true })).getDirectoryHandle('scenes', { create: true })
    scenes.files.set('main.scene.json', '{"waicaScene":3,"entities":[]}')
    pickerStub.mockResolvedValue(asHandle(folder))
    const { onOpen, user } = renderHome()

    await user.click(screen.getByRole('button', { name: /Open project/ }))

    await vi.waitFor(() => expect(onOpen).toHaveBeenCalledOnce())
    expect(defined(onOpen.mock.calls[0]?.[0]).name).toBe('old-game')
  })

  it('offers an empty scene for a folder without one', async () => {
    const folder = new FakeDir('empty')
    pickerStub.mockResolvedValue(asHandle(folder))
    const { onOpen, user } = renderHome()

    await user.click(screen.getByRole('button', { name: /Open project/ }))

    await vi.waitFor(() => expect(onOpen).toHaveBeenCalledOnce())
    expect(confirmStub).toHaveBeenCalledOnce()
    expect(folder.read('src/scenes/main.scene.json')).toBeDefined()
  })

  it('stays silent when the folder picker is cancelled', async () => {
    pickerStub.mockRejectedValue(new DOMException('cancelled', 'AbortError'))
    const { onOpen, user } = renderHome()

    await user.click(screen.getByRole('button', { name: /Open project/ }))

    await vi.waitFor(() => expect(pickerStub).toHaveBeenCalledOnce())
    expect(alertStub).not.toHaveBeenCalled()
    expect(onOpen).not.toHaveBeenCalled()
  })
})

describe('Home characterization: recent projects', () => {
  function recent(name: string): RecentProject {
    return { name, handle: asHandle(new FakeDir(name)), openedAt: 1 }
  }

  it('reopens a recent project', async () => {
    recents.list = [recent('alpha')]
    const { onOpen, user } = renderHome()

    await user.click(await screen.findByRole('button', { name: '📁 alpha' }))

    await vi.waitFor(() => expect(onOpen).toHaveBeenCalledOnce())
    expect(defined(onOpen.mock.calls[0]?.[0]).name).toBe('alpha')
  })

  it('forgets a recent project without touching its folder', async () => {
    recents.list = [recent('alpha'), recent('beta')]
    const { user } = renderHome()

    await user.click(await screen.findByRole('button', { name: 'Remove alpha from recents' }))

    await vi.waitFor(() => expect(screen.queryByRole('button', { name: '📁 alpha' })).toBeNull())
    expect(screen.getByRole('button', { name: '📁 beta' })).toBeDefined()
    expect(deleteProjectFolder).not.toHaveBeenCalled()
  })

  it('deletes a project folder after confirming, and reports it', async () => {
    recents.list = [recent('alpha')]
    const { onDeleted, user } = renderHome()

    await user.click(await screen.findByRole('button', { name: 'Delete alpha from disk' }))

    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalledWith('alpha'))
    expect(deleteProjectFolder).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: '📁 alpha' })).toBeNull()
  })
})
