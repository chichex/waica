import { useState } from 'react'
import type { ArtItem } from './use-project-art'
import { ArtSearchGrid } from './ArtPicker'
import { NumberField } from './NumberField'

interface Props {
  id: string
  props: Record<string, unknown>
  art: ArtItem[]
  urlFor(uri: string): string
  selectedTile: number
  paint: boolean
  brushEnabled?: boolean
  onProp(key: string, value: unknown): void
  onSelectTile(tile: number): void
  onPaint(active: boolean): void
  onPickTexture(uri: string): void
}

const numeric = (props: Record<string, unknown>, key: string, fallback: number): number =>
  typeof props[key] === 'number' ? props[key] : fallback

export function TilemapCard({
  id,
  props,
  art,
  urlFor,
  selectedTile,
  paint,
  brushEnabled = true,
  onProp,
  onSelectTile,
  onPaint,
  onPickTexture,
}: Props) {
  const [pickingTexture, setPickingTexture] = useState(false)
  const texture = typeof props.texture === 'string' ? props.texture : ''
  const cols = Math.max(1, Math.floor(numeric(props, 'cols', 1)))
  const rows = Math.max(1, Math.floor(numeric(props, 'rows', 1)))
  const solidTiles = Array.isArray(props.solidTiles)
    ? props.solidTiles.filter((tile): tile is number => typeof tile === 'number')
    : []
  const numberRow = (key: string, label: string, fallback: number, step = 1) => (
    <label className="ed-row" key={`${id}.${key}`}>
      <span>{label}</span>
      <NumberField
        step={step}
        value={numeric(props, key, fallback)}
        onChange={(value) => onProp(key, Number(value))}
      />
    </label>
  )
  return (
    <div className="ed-section ed-tilemap-card">
      <header className="ed-sec-head">Tilemap</header>
      {numberRow('mapWidth', 'map width', 1)}
      {numberRow('mapHeight', 'map height', 1)}
      {numberRow('cellSize', 'cell size', 1, 0.25)}
      {numberRow('layer', 'layer', 0)}
      <label className="ed-row">
        <span>solid tiles</span>
        <input
          type="text"
          defaultValue={solidTiles.join(', ')}
          key={`${id}.solidTiles.${solidTiles.join(',')}`}
          onBlur={(event) => {
            const next = event.currentTarget.value
              .split(',')
              .map((value) => Number(value.trim()))
              .filter((value) => Number.isInteger(value))
            onProp('solidTiles', [...new Set(next)])
          }}
        />
      </label>

      <header className="ed-sec-head ed-tilemap-subhead">Tileset</header>
      {texture ? (
        <button
          type="button"
          className="ed-tilemap-texture"
          onClick={() => setPickingTexture(!pickingTexture)}
        >
          <img src={urlFor(texture)} alt="" />
          <span>{texture}</span>
        </button>
      ) : (
        <button type="button" className="ed-wide" onClick={() => setPickingTexture(true)}>
          Choose tileset…
        </button>
      )}
      {pickingTexture && (
        <ArtSearchGrid
          art={art}
          onPick={(uri) => {
            onPickTexture(uri)
            setPickingTexture(false)
          }}
        />
      )}
      {!texture && (
        <label className="ed-row">
          <span>color</span>
          <input
            type="color"
            value={`#${Math.max(0, numeric(props, 'color', 0xffffff)).toString(16).padStart(6, '0')}`}
            onChange={(event) => onProp('color', parseInt(event.target.value.slice(1), 16))}
          />
        </label>
      )}
      {numberRow('cols', 'columns', 1)}
      {numberRow('rows', 'rows', 1)}
      {numberRow('gridOffsetX', 'grid x offset', 0)}
      {numberRow('gridOffsetY', 'grid y offset', 0)}
      {numberRow('spacingX', 'x spacing', 0)}
      {numberRow('spacingY', 'y spacing', 0)}
      {numberRow('cellWidth', 'source cell width', 0)}
      {numberRow('cellHeight', 'source cell height', 0)}
      <label className="ed-row">
        <span>pixel art</span>
        <input
          type="checkbox"
          checked={props.pixelArt !== false}
          onChange={(event) => onProp('pixelArt', event.target.checked)}
        />
      </label>

      <div className="ed-tilemap-picker" aria-label="Brush tile">
        {Array.from({ length: cols * rows }, (_, tile) => {
          const column = tile % cols
          const row = Math.floor(tile / cols)
          return (
            <button
              type="button"
              data-tile-index={tile}
              className={tile === selectedTile ? 'is-selected' : ''}
              key={tile}
              title={`Tile ${tile}`}
              style={
                texture
                  ? {
                      backgroundImage: `url(${urlFor(texture)})`,
                      backgroundSize: `${cols * 100}% ${rows * 100}%`,
                      backgroundPosition: `${cols === 1 ? 0 : (column / (cols - 1)) * 100}% ${
                        rows === 1 ? 0 : (row / (rows - 1)) * 100
                      }%`,
                    }
                  : { backgroundColor: `#${numeric(props, 'color', 0xffffff).toString(16).padStart(6, '0')}` }
              }
              onClick={() => onSelectTile(tile)}
            >
              <span>{tile}</span>
            </button>
          )
        })}
      </div>
      {brushEnabled && (
        <>
          <label className="ed-row">
            <span>Paint</span>
            <input
              type="checkbox"
              data-testid="tilemap-paint"
              checked={paint}
              onChange={(event) => onPaint(event.target.checked)}
            />
          </label>
          <div className="ed-hint">drag in the viewport to paint · hold Shift to erase</div>
        </>
      )}
    </div>
  )
}
