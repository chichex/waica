// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SheetCell } from '@waica/engine'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AnimatedProps } from '../project/clips'
import { AnimationEditor } from './AnimationEditor'
import { detectCellsFromUrl } from './sheet-detect'
import { defined } from '../../../engine/src/test-support'

// Characterization of the animation editor's per-sheet slicing (grid and
// cells) and multi-sheet frame numbering, pinned before splitting
// AnimationEditor.tsx by responsibility.

// Decoding pixels needs a canvas the test DOM lacks: detection is the
// image boundary, so the test decides what it finds.
vi.mock('./sheet-detect', () => ({ detectCellsFromUrl: vi.fn() }))

afterEach(cleanup)

const CELLS: SheetCell[] = [
  { x: 0, y: 0, width: 8, height: 8 },
  { x: 8, y: 0, width: 8, height: 8 },
]

const GRID: AnimatedProps = {
  texture: 'src/art/hero.png',
  cols: 2,
  rows: 1,
  clips: { walk: { frames: [0, 1], fps: 8 } },
  initialClip: 'walk',
  width: 1,
  height: 1,
}

function renderEditor(initial: AnimatedProps): ReturnType<typeof vi.fn<(next: AnimatedProps) => void>> {
  const onSave = vi.fn<(next: AnimatedProps) => void>()
  render(
    <AnimationEditor
      title="characters/hero"
      initial={initial}
      art={[]}
      urlFor={(uri) => `blob:${uri}`}
      onImportArt={() => Promise.resolve()}
      onSave={onSave}
      onCancel={() => {}}
    />,
    { reactStrictMode: true },
  )
  // Each sheet image reports a 16×8 natural size once it loads.
  for (const image of screen.getAllByRole('img')) {
    Object.defineProperty(image, 'naturalWidth', { value: 16 })
    Object.defineProperty(image, 'naturalHeight', { value: 8 })
    fireEvent.load(image)
  }
  return onSave
}

async function save(onSave: ReturnType<typeof renderEditor>): Promise<AnimatedProps> {
  await userEvent.setup().click(screen.getByRole('button', { name: 'Save' }))
  return defined(onSave.mock.lastCall, 'a save')[0]
}

describe('AnimationEditor (characterization): grid slicing', () => {
  it('shows one frame toggle per grid cell and the auto cell size as placeholders', () => {
    renderEditor(GRID)

    expect(screen.getByRole('button', { name: '0', pressed: true })).toBeDefined()
    expect(screen.getByRole('button', { name: '1', pressed: true })).toBeDefined()
    expect(screen.getAllByPlaceholderText('8')).toHaveLength(2)
    expect(screen.getAllByPlaceholderText('0')).toHaveLength(4)
    expect(screen.queryByText(/sheet 1/)).toBeNull()
  })

  it('reslices the grid and stores only positive slicing params', async () => {
    const user = userEvent.setup()
    const onSave = renderEditor(GRID)

    const [cols] = screen.getAllByDisplayValue('2')
    await user.clear(defined(cols))
    await user.type(defined(cols), '4')
    expect(screen.getByRole('button', { name: '3', pressed: false })).toBeDefined()
    const [offsetX, , gapX] = screen.getAllByPlaceholderText('0')
    await user.type(defined(offsetX), '2')
    await user.type(defined(gapX), '0')

    const next = await save(onSave)
    expect(next.cols).toBe(4)
    expect(next.gridOffsetX).toBe(2)
    expect(next.spacingX).toBeUndefined()
  })

  it('detects cells by transparency, or explains when none are found', async () => {
    const user = userEvent.setup()
    vi.mocked(detectCellsFromUrl).mockResolvedValueOnce([]).mockResolvedValueOnce(CELLS)
    const onSave = renderEditor(GRID)

    await user.click(screen.getByRole('button', { name: '✂ detect frames' }))
    expect(await screen.findByText('no frames found — the image has no opaque pixels')).toBeDefined()
    await user.click(screen.getByRole('button', { name: '✂ detect frames' }))
    expect(await screen.findByText('2 cells')).toBeDefined()
    expect(detectCellsFromUrl).toHaveBeenCalledWith('blob:src/art/hero.png')
    expect((await save(onSave)).cells).toEqual(CELLS)
  })
})

describe('AnimationEditor (characterization): cells', () => {
  it('toggles cell frames, deletes cells in edit mode and returns to the grid', async () => {
    const user = userEvent.setup()
    const onSave = renderEditor({ ...GRID, cells: CELLS, clips: { walk: { frames: [1], fps: 8 } } })

    expect(screen.getByText('2 cells')).toBeDefined()
    await user.click(screen.getByRole('button', { name: '0', pressed: false }))
    await user.click(screen.getByRole('button', { name: '✎ edit cells' }))
    expect(screen.getByText(/drag on empty space to draw a cell/)).toBeDefined()
    expect(screen.queryByRole('button', { name: '0', pressed: true })).toBeNull()
    await user.click(defined(screen.getAllByRole('button', { description: 'Delete cell' })[0]))
    expect(screen.getByText('1 cells')).toBeDefined()
    expect(await save(onSave)).toMatchObject({ cells: [CELLS[1]], clips: { walk: { frames: [0] } } })

    await user.click(screen.getByRole('button', { name: 'grid…' }))
    expect(screen.getByRole('button', { name: '✂ detect frames' })).toBeDefined()
    expect((await save(onSave)).cells).toBeUndefined()
  })
})

describe('AnimationEditor (characterization): several sheets', () => {
  const TWO_SHEETS: AnimatedProps = {
    ...GRID,
    extraSheets: [{ texture: 'src/art/bat.png', cols: 3, rows: 1 }],
    clips: { walk: { frames: [0, 3], fps: 8 } },
  }

  it('numbers frames across sheets and titles each sheet', () => {
    renderEditor(TWO_SHEETS)

    expect(screen.getByText('sheet 1 · src/art/hero.png')).toBeDefined()
    expect(screen.getByText('frames 0–1')).toBeDefined()
    expect(screen.getByText('sheet 2 · src/art/bat.png')).toBeDefined()
    expect(screen.getByText('frames 2–4')).toBeDefined()
    expect(screen.getByRole('button', { name: '3', pressed: true })).toBeDefined()
  })

  it('removes a sheet, dropping its frames and shifting later ones', async () => {
    const user = userEvent.setup()
    const onSave = renderEditor(TWO_SHEETS)

    const removeFirst = defined(screen.getAllByRole('button', { description: 'Remove this sheet (drops its frames from clips)' })[0])
    await user.click(removeFirst)
    const next = await save(onSave)
    expect(next).toMatchObject({ texture: 'src/art/bat.png', cols: 3, clips: { walk: { frames: [1] } } })
    expect('extraSheets' in next).toBe(false)
  })

  it('adds a sheet through the picker, cancelable', async () => {
    const user = userEvent.setup()
    renderEditor(GRID)

    await user.click(screen.getByRole('button', { name: '+ add sheet' }))
    expect(screen.getByText('Drop a PNG spritesheet here, or pick one:')).toBeDefined()
    // The picker's own Cancel comes before the modal's.
    await user.click(defined(screen.getAllByRole('button', { name: 'Cancel' })[0]))
    expect(screen.getByRole('button', { name: '+ add sheet' })).toBeDefined()
  })
})
