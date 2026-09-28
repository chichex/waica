import { useState } from 'react'
import type { ArtItem } from './use-project-art'
import { ArtSearchGrid } from './ArtPicker'
import { NumberField } from './NumberField'

interface Props {
  id: string
  props: Record<string, unknown>
  art: ArtItem[]
  urlFor: (uri: string) => string
  selectedTile: number
  paint: boolean
  brushEnabled?: boolean
  onProp: (key: string, value: unknown) => void
  onSelectTile: (tile: number) => void
  onPaint: (active: boolean) => void
  onPickTexture: (uri: string) => void
}

type TilemapProps = Record<string, unknown>
type OnProp = (key: string, value: unknown) => void

const numeric = (props: TilemapProps, key: string, fallback: number): number =>
  typeof props[key] === 'number' ? props[key] : fallback

const colorHex = (color: number): string => `#${Math.max(0, color).toString(16).padStart(6, '0')}`

/** One numeric tilemap prop, showing its fallback while unset. */
function NumberRow({
  props,
  propKey,
  label,
  fallback,
  step = 1,
  onProp,
}: {
  props: TilemapProps
  propKey: string
  label: string
  fallback: number
  step?: number
  onProp: OnProp
}) {
  return (
    <label className="ed-row">
      <span>{label}</span>
      <NumberField
        step={step}
        value={numeric(props, propKey, fallback)}
        onChange={(value) => onProp(propKey, Number(value))}
      />
    </label>
  )
}

/** The map's own size, layer and which tiles collide. */
function MapRows({ id, props, onProp }: { id: string; props: TilemapProps; onProp: OnProp }) {
  const solidTiles = Array.isArray(props.solidTiles)
    ? props.solidTiles.filter((tile): tile is number => typeof tile === 'number')
    : []
  const row = { props, onProp }
  return (
    <>
      <NumberRow key={`${id}.mapWidth`} {...row} propKey="mapWidth" label="map width" fallback={1} />
      <NumberRow key={`${id}.mapHeight`} {...row} propKey="mapHeight" label="map height" fallback={1} />
      <NumberRow key={`${id}.cellSize`} {...row} propKey="cellSize" label="cell size" fallback={1} step={0.25} />
      <NumberRow key={`${id}.layer`} {...row} propKey="layer" label="layer" fallback={0} />
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
    </>
  )
}

/** The flat color a texture-less tilemap draws its tiles with. */
function FlatColorRow({ props, onProp }: { props: TilemapProps; onProp: OnProp }) {
  return (
    <label className="ed-row">
      <span>color</span>
      <input
        type="color"
        value={colorHex(numeric(props, 'color', 0xffffff))}
        onChange={(event) => onProp('color', parseInt(event.target.value.slice(1), 16))}
      />
    </label>
  )
}

/** The tileset image — picked from the art library — or, without one, a flat color. */
function TilesetPicker({
  props,
  art,
  urlFor,
  onProp,
  onPickTexture,
}: Pick<Props, 'props' | 'art' | 'urlFor' | 'onProp' | 'onPickTexture'>) {
  const [pickingTexture, setPickingTexture] = useState(false)
  const texture = typeof props.texture === 'string' ? props.texture : ''
  return (
    <>
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
      {!texture && <FlatColorRow props={props} onProp={onProp} />}
    </>
  )
}

/** The tileset and the grid that slices it into tiles. */
function TilesetRows(card: Pick<Props, 'id' | 'props' | 'art' | 'urlFor' | 'onProp' | 'onPickTexture'>) {
  const { id, props, onProp } = card
  const row = { props, onProp }
  return (
    <>
      <header className="ed-sec-head ed-tilemap-subhead">Tileset</header>
      <TilesetPicker {...card} />
      <NumberRow key={`${id}.cols`} {...row} propKey="cols" label="columns" fallback={1} />
      <NumberRow key={`${id}.rows`} {...row} propKey="rows" label="rows" fallback={1} />
      <NumberRow key={`${id}.gridOffsetX`} {...row} propKey="gridOffsetX" label="grid x offset" fallback={0} />
      <NumberRow key={`${id}.gridOffsetY`} {...row} propKey="gridOffsetY" label="grid y offset" fallback={0} />
      <NumberRow key={`${id}.spacingX`} {...row} propKey="spacingX" label="x spacing" fallback={0} />
      <NumberRow key={`${id}.spacingY`} {...row} propKey="spacingY" label="y spacing" fallback={0} />
      <NumberRow key={`${id}.cellWidth`} {...row} propKey="cellWidth" label="source cell width" fallback={0} />
      <NumberRow key={`${id}.cellHeight`} {...row} propKey="cellHeight" label="source cell height" fallback={0} />
      <label className="ed-row">
        <span>pixel art</span>
        <input
          type="checkbox"
          checked={props.pixelArt !== false}
          onChange={(event) => onProp('pixelArt', event.target.checked)}
        />
      </label>
    </>
  )
}

/** A tile swatch cut from the tileset (or the flat color) at its sheet cell. */
function tileStyle(props: TilemapProps, urlFor: (uri: string) => string, tile: number): React.CSSProperties {
  const texture = typeof props.texture === 'string' ? props.texture : ''
  const cols = Math.max(1, Math.floor(numeric(props, 'cols', 1)))
  const rows = Math.max(1, Math.floor(numeric(props, 'rows', 1)))
  if (!texture) {
    return { backgroundColor: `#${numeric(props, 'color', 0xffffff).toString(16).padStart(6, '0')}` }
  }
  const column = tile % cols
  const row = Math.floor(tile / cols)
  return {
    backgroundImage: `url(${urlFor(texture)})`,
    backgroundSize: `${cols * 100}% ${rows * 100}%`,
    backgroundPosition: `${cols === 1 ? 0 : (column / (cols - 1)) * 100}% ${
      rows === 1 ? 0 : (row / (rows - 1)) * 100
    }%`,
  }
}

/** Paints in the viewport while on; Shift erases. */
function PaintToggle({ paint, onPaint }: Pick<Props, 'paint' | 'onPaint'>) {
  return (
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
  )
}

/** The brush: one button per tileset cell, plus the Paint toggle where painting is possible. */
function TileBrush({
  props,
  urlFor,
  selectedTile,
  paint,
  brushEnabled,
  onSelectTile,
  onPaint,
}: Pick<Props, 'props' | 'urlFor' | 'selectedTile' | 'paint' | 'onSelectTile' | 'onPaint'> & {
  brushEnabled: boolean
}) {
  const cols = Math.max(1, Math.floor(numeric(props, 'cols', 1)))
  const rows = Math.max(1, Math.floor(numeric(props, 'rows', 1)))
  return (
    <>
      <div className="ed-tilemap-picker" aria-label="Brush tile">
        {Array.from({ length: cols * rows }, (_, tile) => (
          <button
            type="button"
            data-tile-index={tile}
            className={tile === selectedTile ? 'is-selected' : ''}
            key={tile}
            title={`Tile ${tile}`}
            style={tileStyle(props, urlFor, tile)}
            onClick={() => onSelectTile(tile)}
          >
            <span>{tile}</span>
          </button>
        ))}
      </div>
      {brushEnabled && <PaintToggle paint={paint} onPaint={onPaint} />}
    </>
  )
}

export function TilemapCard({ brushEnabled = true, ...card }: Props) {
  return (
    <div className="ed-section ed-tilemap-card">
      <header className="ed-sec-head">Tilemap</header>
      <MapRows id={card.id} props={card.props} onProp={card.onProp} />
      <TilesetRows {...card} />
      <TileBrush {...card} brushEnabled={brushEnabled} />
    </div>
  )
}
