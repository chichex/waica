// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnimationContract } from '@waica/engine'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AnimatedProps } from '../project/clips'
import { AnimationEditor } from './AnimationEditor'
import type { ArtItem, DroppedFile } from './use-project-art'
import { defined } from '../../../engine/src/test-support'

// Characterization of the animation editor's clip list, preview, contract,
// sheet picker and save/cancel, pinned before splitting AnimationEditor.tsx
// by responsibility.

afterEach(cleanup)

const SHEET: AnimatedProps = {
  texture: 'src/art/hero.png',
  cols: 2,
  rows: 1,
  clips: {
    walk: { frames: [0, 1], fps: 8, loop: true },
    run: { frames: [1], fps: 12 },
  },
  initialClip: 'walk',
  width: 1,
  height: 1,
}

const ART: ArtItem[] = [
  { label: 'slime.png', url: 'blob:slime', uri: 'src/art/slime.png', path: 'src/art/slime.png', kind: 'image' },
]

function editorSpies() {
  return {
    onSave: vi.fn<(next: AnimatedProps) => void>(),
    onCancel: vi.fn<() => void>(),
    onImportArt: vi.fn<(files: DroppedFile[]) => Promise<void>>(() => Promise.resolve()),
  }
}

function renderEditor(initial: AnimatedProps, contract?: AnimationContract): ReturnType<typeof editorSpies> {
  const spies = editorSpies()
  render(
    <AnimationEditor
      title="characters/hero"
      initial={initial}
      contract={contract}
      art={ART}
      urlFor={(uri) => `blob:${uri}`}
      onImportArt={spies.onImportArt}
      onSave={spies.onSave}
      onCancel={spies.onCancel}
    />,
    { reactStrictMode: true },
  )
  return spies
}

function saved(spies: ReturnType<typeof editorSpies>): AnimatedProps {
  return defined(spies.onSave.mock.lastCall, 'a save')[0]
}

async function save(spies: ReturnType<typeof editorSpies>): Promise<AnimatedProps> {
  await userEvent.setup().click(screen.getByRole('button', { name: 'Save' }))
  return saved(spies)
}

/** A clip's name field (the initial-clip picker shows the same value). */
function clipNameField(name: string): HTMLElement {
  return defined(
    screen.getAllByRole('textbox').find((field) => field.getAttribute('value') === name),
    `the name field of clip "${name}"`,
  )
}

describe('AnimationEditor (characterization): clips', () => {
  it('lists each clip with its name, fps, loop and frame chips, and the initial clip', () => {
    renderEditor(SHEET)

    expect(screen.getByText('Animation — characters/hero')).toBeDefined()
    expect(clipNameField('walk')).toBeDefined()
    expect(clipNameField('run')).toBeDefined()
    expect(screen.getByDisplayValue('12')).toBeDefined()
    expect(screen.getAllByRole('checkbox', { name: 'loop' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { description: 'remove frame' }).map((b) => b.textContent)).toEqual(['0', '1', '1'])
    expect(screen.getByRole('combobox', { name: 'initial clip' })).toHaveProperty('value', 'walk')
  })

  it('edits fps and loop, removes a frame chip and changes the initial clip', async () => {
    const user = userEvent.setup()
    const spies = renderEditor(SHEET)

    const fps = screen.getByDisplayValue('12')
    await user.clear(fps)
    await user.type(fps, '20')
    await user.click(defined(screen.getAllByRole('checkbox', { name: 'loop' })[1]))
    await user.click(defined(screen.getAllByRole('button', { description: 'remove frame' })[0]))
    await user.selectOptions(screen.getByRole('combobox', { name: 'initial clip' }), 'run')

    expect(await save(spies)).toEqual({
      ...SHEET,
      clips: { walk: { frames: [1], fps: 8, loop: true }, run: { frames: [1], fps: 20, loop: false } },
      initialClip: 'run',
    })
  })

})

describe('AnimationEditor (characterization): clip list', () => {
  it('adds, renames and deletes clips', async () => {
    const user = userEvent.setup()
    const spies = renderEditor(SHEET)

    await user.click(screen.getByRole('button', { name: '+ clip' }))
    expect(clipNameField('clip')).toBeDefined()
    expect(screen.getByText('click sheet cells to add frames')).toBeDefined()
    // The new clip is selected: sheet frames toggle into it.
    await user.click(screen.getByRole('button', { name: '0', pressed: false }))

    const walk = clipNameField('walk')
    await user.clear(walk)
    await user.type(walk, 'stroll')
    await user.tab()
    await user.click(defined(screen.getAllByRole('button', { description: 'Delete clip' })[1]))

    const next = await save(spies)
    expect(Object.keys(next.clips)).toEqual(['stroll', 'clip'])
    expect(next.clips.clip).toEqual({ frames: [0], fps: 8 })
    expect(next.initialClip).toBe('stroll')
  })
})

describe('AnimationEditor (characterization): preview, contract and closing', () => {
  it('toggles the preview between play and pause', async () => {
    const user = userEvent.setup()
    renderEditor(SHEET)

    await user.click(screen.getByRole('button', { name: '⏸ pause' }))
    expect(screen.getByRole('button', { name: '▶ play' })).toBeDefined()
  })

  it('checks the required clips of a contract', () => {
    renderEditor(SHEET, { required: ['walk', 'jump'], fallbacks: {} })

    const list = defined(screen.getByText('Required clips').parentElement)
    expect(within(list).getByText('✓')).toBeDefined()
    expect(within(list).getByText('✗ missing')).toBeDefined()
    expect(screen.getByText('a state without its clip keeps the previous animation at runtime')).toBeDefined()
  })

  it('saves the sanitized draft and cancels from ✕, Cancel and Escape', async () => {
    const user = userEvent.setup()
    const spies = renderEditor({ ...SHEET, clips: { ...SHEET.clips, empty: { frames: [], fps: 8 } } })

    expect(Object.keys((await save(spies)).clips)).toEqual(['walk', 'run'])
    await user.click(defined(screen.getAllByRole('button', { name: '✕' })[0]))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.keyboard('{Escape}')
    expect(spies.onCancel).toHaveBeenCalledTimes(3)
  })
})

describe('AnimationEditor (characterization): picking sheets', () => {
  it('opens on the picker without a texture and uses the picked art as the sheet', async () => {
    const user = userEvent.setup()
    const spies = renderEditor({ ...SHEET, texture: '', clips: {}, initialClip: undefined })

    expect(screen.getByText('Drop a PNG spritesheet here, or pick one:')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Keep current sheet' })).toBeNull()
    await user.keyboard('{Escape}')
    expect(spies.onCancel).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'slime.png slime.png' }))
    expect(screen.getByRole('img', { name: 'src/art/slime.png' })).toBeDefined()
    expect((await save(spies)).texture).toBe('src/art/slime.png')
  })

  it('changes a sheet, keeping it on Escape or "Keep current sheet"', async () => {
    const user = userEvent.setup()
    const spies = renderEditor(SHEET)

    await user.click(screen.getByRole('button', { name: 'change sheet…' }))
    await user.keyboard('{Escape}')
    expect(spies.onCancel).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'change sheet…' }))
    await user.click(screen.getByRole('button', { name: 'Keep current sheet' }))
    await user.click(screen.getByRole('button', { name: 'change sheet…' }))
    await user.click(screen.getByRole('button', { name: 'slime.png slime.png' }))

    expect((await save(spies)).texture).toBe('src/art/slime.png')
  })

  it('imports a chosen image file as the sheet', async () => {
    const spies = renderEditor({ ...SHEET, texture: '' })
    const file = new File(['png'], 'bat.png', { type: 'image/png' })
    const input = defined(document.querySelector<HTMLInputElement>('input[type="file"]'))

    fireEvent.change(input, { target: { files: [file] } })
    await vi.waitFor(() => expect(screen.getByRole('img', { name: 'src/art/bat.png' })).toBeDefined())
    expect(spies.onImportArt).toHaveBeenCalledWith([{ file, relativePath: 'bat.png' }])
  })
})
