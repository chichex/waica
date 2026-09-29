// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RecentProject } from '../fs/recents'

const recentsReads = vi.hoisted(() => [] as ((recents: RecentProject[]) => void)[])

vi.mock('../fs/recents', () => ({
  listRecents: () =>
    new Promise<RecentProject[]>((resolve) => {
      recentsReads.push(resolve)
    }),
  saveRecent: () => Promise.resolve(),
  removeRecent: () => Promise.resolve(),
  ensurePermission: () => Promise.resolve(true),
}))

import { Home } from './Home'

afterEach(() => {
  cleanup()
  recentsReads.length = 0
})

function recent(name: string): RecentProject {
  return { name, handle: {} as FileSystemDirectoryHandle, openedAt: 1 }
}

describe('Home recents', () => {
  it('shows the latest recents read, not an older one that resolves later', async () => {
    render(<Home onOpen={() => {}} />, { reactStrictMode: true })
    // StrictMode mounts, cleans up and mounts again: two reads in flight.
    expect(recentsReads).toHaveLength(2)
    const [stale, live] = recentsReads

    await act(async () => {
      live?.([recent('fresh-project')])
      await Promise.resolve()
    })
    await act(async () => {
      stale?.([recent('stale-project')])
      await Promise.resolve()
    })

    expect(screen.getByRole('button', { name: '📁 fresh-project' })).toBeDefined()
    expect(screen.queryAllByRole('button', { name: /stale-project/ })).toEqual([])
  })
})
