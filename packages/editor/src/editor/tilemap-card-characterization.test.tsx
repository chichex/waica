// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { TilemapCard } from './TilemapCard'
import type { ArtItem } from './use-project-art'
import { defined } from '../../../engine/src/test-support'

/**
 * Characterization of TilemapCard before it is split by responsibility: the
 * map, tileset and brush controls it renders and the props they commit.
 */

const TILES: ArtItem = {
  label: 'tiles.png',
  url: 'blob:tiles',
  uri: 'src/art/tiles.png',
  path: 'src/art/tiles.png',
  kind: 'image',
}

const SHEET = { texture: TILES.uri, cols: 3, rows: 2, mapWidth: 6, solidTiles: [1, 4] }

afterEach(cleanup)

function renderCard(props: Record<string, unknown> = SHEET, brushEnabled?: boolean) {
  const spies = {
    onProp: vi.fn<(key: string, value: unknown) => void>(),
    onSelectTile: vi.fn<(tile: number) => void>(),
    onPaint: vi.fn<(active: boolean) => void>(),
    onPickTexture: vi.fn<(uri: string) => void>(),
  }
  render(
    <TilemapCard
      id="Map"
      props={props}
      art={[TILES]}
      urlFor={(uri) => `url:${uri}`}
      selectedTile={1}
      paint={false}
      brushEnabled={brushEnabled}
      {...spies}
    />,
    { reactStrictMode: true },
  )
  return spies
}

const NUMBER_ROWS: Array<[string, string]> = [
  ['map width', '6'],
  ['map height', '1'],
  ['cell size', '1'],
  ['layer', '0'],
  ['columns', '3'],
  ['rows', '2'],
  ['grid x offset', '0'],
  ['grid y offset', '0'],
  ['x spacing', '0'],
  ['y spacing', '0'],
  ['source cell width', '0'],
  ['source cell height', '0'],
]

it('commits map numbers with their defaults filled in', () => {
  const spies = renderCard()

  for (const [label, value] of NUMBER_ROWS) {
    expect(screen.getByRole<HTMLInputElement>('spinbutton', { name: label }).value).toBe(value)
  }
  const cellSize = screen.getByRole('spinbutton', { name: 'cell size' })
  expect(cellSize.getAttribute('step')).toBe('0.25')
  fireEvent.change(cellSize, { target: { value: '0.5' } })
  expect(spies.onProp).toHaveBeenLastCalledWith('cellSize', 0.5)
})

it('parses solid tiles on blur into unique integers', async () => {
  const user = userEvent.setup()
  const spies = renderCard()

  const solid = screen.getByRole<HTMLInputElement>('textbox', { name: 'solid tiles' })
  expect(solid.value).toBe('1, 4')
  await user.clear(solid)
  await user.type(solid, '2, x, 2, 5.5, 7')
  await user.tab()
  expect(spies.onProp).toHaveBeenLastCalledWith('solidTiles', [2, 7])
})

it('toggles pixel art', async () => {
  const user = userEvent.setup()
  const spies = renderCard()

  const pixelArt = screen.getByRole<HTMLInputElement>('checkbox', { name: 'pixel art' })
  expect(pixelArt.checked).toBe(true)
  await user.click(pixelArt)
  expect(spies.onProp).toHaveBeenLastCalledWith('pixelArt', false)
})

it('opens the art grid from the current tileset and picks a new one', async () => {
  const user = userEvent.setup()
  const spies = renderCard()

  expect(document.querySelector('input[type="color"]')).toBeNull()
  await user.click(screen.getByRole('button', { name: TILES.uri }))
  await user.click(screen.getByRole('button', { name: 'tiles.png tiles.png' }))
  expect(spies.onPickTexture).toHaveBeenCalledWith(TILES.uri)
  expect(screen.queryByRole('button', { name: 'tiles.png tiles.png' })).toBeNull()
})

it('offers a tileset chooser and a flat color without a texture', async () => {
  const user = userEvent.setup()
  const spies = renderCard({ cols: 1, rows: 1, color: 0x00ff00 })

  await user.click(screen.getByRole('button', { name: 'Choose tileset…' }))
  expect(screen.getByRole('searchbox')).toBeDefined()
  const color = defined(document.querySelector<HTMLInputElement>('input[type="color"]'))
  expect(color.value).toBe('#00ff00')
  fireEvent.change(color, { target: { value: '#0000ff' } })
  expect(spies.onProp).toHaveBeenLastCalledWith('color', 0x0000ff)
})

it('lays out one tile button per sheet cell and selects the clicked one', async () => {
  const user = userEvent.setup()
  const spies = renderCard()

  const picker = screen.getByLabelText('Brush tile')
  const tiles = within(picker).getAllByRole('button')
  expect(tiles.map((tile) => tile.textContent)).toEqual(['0', '1', '2', '3', '4', '5'])
  expect(tiles[5]?.getAttribute('title')).toBe('Tile 5')
  expect(tiles[5]?.style.backgroundPosition).toBe('100% 100%')
  await user.click(within(picker).getByRole('button', { name: '4' }))
  expect(spies.onSelectTile).toHaveBeenCalledWith(4)
})

it('toggles painting and hides the brush when disabled', async () => {
  const user = userEvent.setup()
  const spies = renderCard()

  expect(screen.getByText('drag in the viewport to paint · hold Shift to erase')).toBeDefined()
  await user.click(screen.getByRole('checkbox', { name: 'Paint' }))
  expect(spies.onPaint).toHaveBeenCalledWith(true)
  cleanup()

  renderCard(SHEET, false)
  expect(screen.queryByRole('checkbox', { name: 'Paint' })).toBeNull()
  expect(screen.getAllByRole('button', { name: /^\d$/ })).toHaveLength(6)
})
