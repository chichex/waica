// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectFS } from '../fs/project-fs'

// Monaco needs workers and a real layout; the pane's contract is the text it
// hands the editor, so a labelled textarea stands in for it.
vi.mock('@monaco-editor/react', () => ({
  default: ({ value, path }: { value: string; path: string }) => (
    <textarea aria-label={`source of ${path}`} value={value} readOnly />
  ),
}))

import { CodePane } from './CodePane'

afterEach(cleanup)

function deferred(): { promise: Promise<string>; resolve(text: string): void } {
  let resolve: (text: string) => void = () => {}
  const promise = new Promise<string>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

function pendingFs(reads: Record<string, ReturnType<typeof deferred>>): ProjectFS {
  const fs: Pick<ProjectFS, 'readText' | 'writeText'> = {
    readText: (path: string) => reads[path]?.promise ?? Promise.resolve(null),
    writeText: () => Promise.resolve(),
  }
  return fs as ProjectFS
}

describe('CodePane file switching', () => {
  it('never shows the text of a file the user already left', async () => {
    const reads = { 'src/a.ts': deferred(), 'src/b.ts': deferred() }
    const fs = pendingFs(reads)
    const { rerender } = render(<CodePane fs={fs} path="src/a.ts" />, { reactStrictMode: true })
    rerender(<CodePane fs={fs} path="src/b.ts" />)

    await act(async () => {
      reads['src/b.ts'].resolve('export const b = 2\n')
      await reads['src/b.ts'].promise
    })
    await act(async () => {
      reads['src/a.ts'].resolve('export const a = 1\n')
      await reads['src/a.ts'].promise
    })

    const source = await screen.findByRole('textbox', { name: 'source of file:///src/b.ts' })
    expect(source).toHaveProperty('value', 'export const b = 2\n')
  })
})
