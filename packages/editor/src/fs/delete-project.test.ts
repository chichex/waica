import { describe, expect, it, vi } from 'vitest'
import { deleteProjectFolder } from './delete-project'

function notFound(): DOMException {
  return new DOMException('missing', 'NotFoundError')
}

/** A directory handle with just what deleteProjectFolder touches. */
function fakeDir(entries: string[], overrides: Record<string, unknown> = {}) {
  const left = new Set(entries)
  const handle = {
    kind: 'directory',
    name: 'my-game',
    async *entries() {
      for (const name of left) yield [name, { kind: 'file', name }]
    },
    removeEntry: vi.fn(async (name: string) => {
      left.delete(name)
    }),
    ...overrides,
  }
  return { handle: handle as unknown as FileSystemDirectoryHandle, left }
}

describe('deleteProjectFolder', () => {
  it('removes the folder itself when the browser supports remove()', async () => {
    const remove = vi.fn(async () => {})
    const { handle } = fakeDir(['scene.json'], { remove })

    expect(await deleteProjectFolder(handle)).toBe('deleted')
    expect(remove).toHaveBeenCalledWith({ recursive: true })
  })

  it('empties the folder in place when remove() is missing', async () => {
    const { handle, left } = fakeDir(['scene.json', 'src', 'game.json'])

    expect(await deleteProjectFolder(handle)).toBe('emptied')
    expect([...left]).toEqual([])
  })

  it('removes subdirectories recursively in the fallback path', async () => {
    const { handle } = fakeDir(['src'])

    await deleteProjectFolder(handle)
    expect(handle.removeEntry).toHaveBeenCalledWith('src', { recursive: true })
  })

  // The folder moved or was deleted from the OS while it sat in Recent: the
  // user's intent is already satisfied, so the caller can just forget it.
  it('reports a folder that is already gone as missing', async () => {
    const remove = vi.fn(async () => {
      throw notFound()
    })
    const { handle } = fakeDir([], { remove })

    expect(await deleteProjectFolder(handle)).toBe('missing')
  })

  it('reports a missing folder in the fallback path too', async () => {
    const handle = {
      entries() {
        return {
          [Symbol.asyncIterator]() {
            return this
          },
          next: () => Promise.reject(notFound()),
        }
      },
    } as unknown as FileSystemDirectoryHandle

    expect(await deleteProjectFolder(handle)).toBe('missing')
  })

  it('ignores an entry that vanishes mid-delete', async () => {
    const { handle } = fakeDir(['scene.json', 'ghost'], {
      removeEntry: vi.fn(async (name: string) => {
        if (name === 'ghost') throw notFound()
      }),
    })

    expect(await deleteProjectFolder(handle)).toBe('emptied')
    expect(handle.removeEntry).toHaveBeenCalledTimes(2)
  })

  // Reporting "deleted" for a folder that is still there would be a lie the
  // user only discovers in Finder.
  it('propagates a denied permission instead of claiming success', async () => {
    const remove = vi.fn(async () => {
      throw new DOMException('nope', 'NotAllowedError')
    })
    const { handle } = fakeDir([], { remove })

    await expect(deleteProjectFolder(handle)).rejects.toThrow('nope')
  })

  it('propagates a failure while emptying', async () => {
    const { handle } = fakeDir(['scene.json'], {
      removeEntry: vi.fn(async () => {
        throw new DOMException('nope', 'NoModificationAllowedError')
      }),
    })

    await expect(deleteProjectFolder(handle)).rejects.toThrow('nope')
  })
})
