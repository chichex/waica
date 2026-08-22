// @vitest-environment happy-dom
import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { TilemapCard } from './TilemapCard'

function props(): ComponentProps<typeof TilemapCard> {
  return {
    id: 'Map',
    props: {
      texture: 'src/art/tiles.png',
      cols: 3,
      rows: 2,
      mapWidth: 6,
      mapHeight: 5,
      cellSize: 1,
      layer: 2,
      solidTiles: [1, 4],
      cells: [0, 1],
    },
    art: [],
    urlFor: (uri) => uri,
    selectedTile: 1,
    paint: true,
    onProp: vi.fn(),
    onSelectTile: vi.fn(),
    onPaint: vi.fn(),
    onPickTexture: vi.fn(),
  }
}

describe('TilemapCard', () => {
  it('renders dedicated map, tileset, tile picker and Paint controls without raw cells', () => {
    document.body.innerHTML = renderToStaticMarkup(createElement(TilemapCard, props()))

    const text = document.body.textContent ?? ''
    expect(text).toContain('Tilemap')
    expect(text).toContain('map width')
    expect(text).toContain('map height')
    expect(text).toContain('cell size')
    expect(text).toContain('layer')
    expect(text).toContain('solid tiles')
    expect(text).toContain('Tileset')
    expect(text).not.toContain('cells {…}')
    expect(document.querySelectorAll('[data-tile-index]')).toHaveLength(6)
    expect(document.querySelector<HTMLInputElement>('[data-testid="tilemap-paint"]')?.checked).toBe(
      true,
    )
  })
})
