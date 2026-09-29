// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AnimatedProps } from '../project/clips'
import { AnimationEditor } from './AnimationEditor'

const SHEET: AnimatedProps = {
  texture: 'src/art/hero.png',
  cols: 2,
  rows: 1,
  cells: [
    { x: 0, y: 0, width: 8, height: 8 },
    { x: 8, y: 0, width: 8, height: 8 },
  ],
  clips: {
    walk: { frames: [0], fps: 8, loop: true },
    run: { frames: [], fps: 12, loop: true },
  },
  initialClip: 'walk',
  width: 1,
  height: 1,
}

function renderEditor(onSave = vi.fn()): typeof onSave {
  render(
    <AnimationEditor
      title="characters/hero"
      initial={SHEET}
      art={[]}
      urlFor={(uri) => uri}
      onImportArt={() => Promise.resolve()}
      onSave={onSave}
      onCancel={() => {}}
    />,
    { reactStrictMode: true },
  )
  // The frame overlay appears once the sheet image reports its size.
  for (const image of screen.getAllByRole('img')) fireEvent.load(image)
  return onSave
}

function savedClips(onSave: ReturnType<typeof vi.fn>): AnimatedProps['clips'] {
  const saved: unknown = onSave.mock.lastCall?.[0]
  if (typeof saved !== 'object' || saved === null || !('clips' in saved)) throw new Error('nothing saved')
  return (saved as AnimatedProps).clips
}

afterEach(cleanup)

describe('AnimationEditor frame and clip controls (CA-25)', () => {
  it('shows each frame as a toggle button that reports whether the selected clip uses it', async () => {
    const user = userEvent.setup()
    const onSave = renderEditor()

    expect(screen.getByRole('button', { name: '0', pressed: true })).toBeDefined()
    await user.click(screen.getByRole('button', { name: '1', pressed: false }))
    expect(screen.getByRole('button', { name: '1', pressed: true })).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(savedClips(onSave).walk?.frames).toEqual([0, 1])
  })

  it('selects a clip when the keyboard moves into its fields', async () => {
    const user = userEvent.setup()
    const onSave = renderEditor()

    screen.getByDisplayValue('run').focus()
    await user.keyboard('{Tab}')
    await user.click(screen.getByRole('button', { name: '1', pressed: false }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(savedClips(onSave).run?.frames).toEqual([1])
    expect(savedClips(onSave).walk?.frames).toEqual([0])
  })
})

describe('AnimationEditor clip row selection', () => {
  it('keeps the selected clip when a different clip is deleted', async () => {
    const user = userEvent.setup()
    const onSave = renderEditor()

    const [, deleteRun] = screen.getAllByTitle('Delete clip')
    if (!deleteRun) throw new Error('missing the run clip delete button')
    await user.click(deleteRun)
    await user.click(screen.getByRole('button', { name: '1', pressed: false }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(savedClips(onSave).run).toBeUndefined()
    expect(savedClips(onSave).walk?.frames).toEqual([0, 1])
  })

  it('selects a clip when its row padding is pressed', async () => {
    const user = userEvent.setup()
    const onSave = renderEditor()

    const runRow = screen.getByDisplayValue('run').closest('.ed-clip')
    if (!runRow) throw new Error('missing the run clip row')
    await user.pointer({ keys: '[MouseLeft]', target: runRow })
    await user.click(screen.getByRole('button', { name: '1', pressed: false }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(savedClips(onSave).run?.frames).toEqual([1])
  })
})
