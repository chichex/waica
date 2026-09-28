// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemFS, SCENE_PATH } from '../fs/project-fs'
import { WRITE_DELAY_MS } from './write-scheduler'

/**
 * Characterization of CodePane: what it shows for inline and file sources,
 * and when an edit reaches the file. Monaco stands in as a labelled textarea
 * that reports its language and edits.
 */
vi.mock('@monaco-editor/react', () => ({
  default: ({
    value,
    language,
    options,
    onChange,
  }: {
    value: string
    language: string
    options: { readOnly: boolean }
    onChange?: (next: string) => void
  }) => (
    <textarea
      aria-label={`${language} source`}
      value={value}
      readOnly={options.readOnly}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}))

import { CodePane } from './CodePane'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('CodePane characterization: inline sources', () => {
  it('shows an inline source read-only, with its folder and file name and no save control', () => {
    render(<CodePane path="scripts/platformer.ts" source="export const x = 1" readOnly />, {
      reactStrictMode: true,
    })

    expect(screen.getByText('platformer.ts')).toBeDefined()
    expect(screen.getByText(/scripts \//)).toBeDefined()
    expect(screen.getByRole('textbox', { name: 'typescript source' })).toHaveProperty(
      'value',
      'export const x = 1',
    )
    expect(screen.queryByRole('button', { name: 'save ⌘S' })).toBeNull()
  })

  it('offers the way back to the viewport when asked for it', async () => {
    const onBack = vi.fn()
    render(<CodePane path="notes.md" source="# hi" onBack={onBack} />, { reactStrictMode: true })

    expect(screen.getByRole('textbox', { name: 'markdown source' })).toBeDefined()
    await userEvent.setup().click(screen.getByRole('button', { name: '◀ viewport' }))
    expect(onBack).toHaveBeenCalledOnce()
  })
})

describe('CodePane characterization: project files', () => {
  it('loads the file, marks edits dirty and saves them with the save button', async () => {
    const fs = new MemFS('code', { 'src/a.ts': 'export const a = 1\n' })
    const onSaved = vi.fn()
    render(<CodePane fs={fs} path="src/a.ts" onSaved={onSaved} />, { reactStrictMode: true })

    const source = await screen.findByRole('textbox', { name: 'typescript source' })
    expect(source).toHaveProperty('value', 'export const a = 1\n')
    fireEvent.change(source, { target: { value: 'export const a = 2\n' } })
    expect(screen.getByText(/•/)).toBeDefined()

    await userEvent.setup().click(screen.getByRole('button', { name: 'save ⌘S' }))

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith('src/a.ts'))
    expect(await fs.readText('src/a.ts')).toBe('export const a = 2\n')
    expect(screen.queryByText(/•/)).toBeNull()
  })

  it('auto-saves an edit after the write delay', async () => {
    vi.useFakeTimers()
    const fs = new MemFS('code', { 'src/a.json': '{}' })
    render(<CodePane fs={fs} path="src/a.json" />, { reactStrictMode: true })
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    fireEvent.change(screen.getByRole('textbox', { name: 'json source' }), {
      target: { value: '{"a":1}' },
    })
    expect(await fs.readText('src/a.json')).toBe('{}')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WRITE_DELAY_MS)
    })

    expect(await fs.readText('src/a.json')).toBe('{"a":1}')
  })

})

describe('CodePane characterization: leaving and scenes', () => {
  it('lands a dirty buffer when the pane unmounts', async () => {
    const fs = new MemFS('code', { 'src/b.ts': 'let b = 1\n' })
    const { unmount } = render(<CodePane fs={fs} path="src/b.ts" />, { reactStrictMode: true })

    fireEvent.change(await screen.findByRole('textbox', { name: 'typescript source' }), {
      target: { value: 'let b = 2\n' },
    })
    unmount()

    await vi.waitFor(async () => expect(await fs.readText('src/b.ts')).toBe('let b = 2\n'))
  })

  it('hands a saved main scene up, and keeps quiet when the JSON is not a scene', async () => {
    const fs = new MemFS('code', { [SCENE_PATH]: '{"waicaScene":3,"entities":[]}' })
    const onSceneSaved = vi.fn()
    render(<CodePane fs={fs} path={SCENE_PATH} onSceneSaved={onSceneSaved} />, {
      reactStrictMode: true,
    })
    const user = userEvent.setup()
    const source = await screen.findByRole('textbox', { name: 'json source' })

    fireEvent.change(source, { target: { value: '{"waicaScene":3,"entities":[{"name":"A"}]}' } })
    await user.click(screen.getByRole('button', { name: 'save ⌘S' }))
    await vi.waitFor(() => expect(onSceneSaved).toHaveBeenCalledOnce())
    expect(onSceneSaved.mock.calls[0]?.[0]).toMatchObject({ entities: [{ name: 'A' }] })

    fireEvent.change(source, { target: { value: 'not json' } })
    await user.click(screen.getByRole('button', { name: 'save ⌘S' }))
    await vi.waitFor(async () => expect(await fs.readText(SCENE_PATH)).toBe('not json'))
    expect(onSceneSaved).toHaveBeenCalledOnce()
  })
})
