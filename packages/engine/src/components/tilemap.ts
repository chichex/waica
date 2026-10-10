import * as THREE from 'three/webgpu'
import { sheetCell } from '../animation/sheet.js'
import { Component, type ComponentSpace } from '../component.js'
import { projectIsometric } from '../projection.js'
import { SOLID_SOURCE_SYMBOL, type SolidSource } from '../scene-solids.js'
import {
  cellAt as gridCellAt,
  cellBounds as gridCellBounds,
  cellIndex as gridCellIndex,
  type TilemapCell,
  type TilemapCellBounds,
  type TilemapGridSpec,
} from '../tilemap-grid.js'
import { Solid } from './solid.js'
import { reportRejection } from '../report-rejection.js'
import { markOccludersChanged } from '../scene-lighting.js'
import { TRANSPARENT_TEXEL_ALPHA } from '../render-layers.js'

/** Vertex positions, UVs and triangle indices for a Tilemap's mesh. */
interface TileMeshBuffers {
  positions: number[]
  uvs: number[]
  indices: number[]
}

/** One authorable cell map rendered as a single merged geometry. */
export class Tilemap extends Component implements SolidSource {
  static override componentName = 'Tilemap'
  static override space: ComponentSpace = '2d'
  static override params = {
    color: { label: 'color' },
    cols: { label: 'tileset columns', min: 1, step: 1 },
    rows: { label: 'tileset rows', min: 1, step: 1 },
    mapWidth: { label: 'map width', min: 1, step: 1 },
    mapHeight: { label: 'map height', min: 1, step: 1 },
    cellSize: { label: 'cell size', min: 0.05, step: 0.25 },
    layer: { label: 'layer', min: -5, max: 5, step: 1 },
  }
  static override transient = ['mesh', 'loadedTexture', 'derivedSolids']

  readonly [SOLID_SOURCE_SYMBOL] = true

  private _texture = ''
  get texture(): string {
    return this._texture
  }
  set texture(value: string) {
    this._texture = value
    this.rebuildMaterial()
  }

  private _color = 0xffffff
  get color(): number {
    return this._color
  }
  set color(value: number) {
    this._color = value
    this.rebuildMaterial()
  }

  private _cols = 1
  get cols(): number {
    return this._cols
  }
  set cols(value: number) {
    this._cols = value
    this.rebuildGeometry()
  }

  private _rows = 1
  get rows(): number {
    return this._rows
  }
  set rows(value: number) {
    this._rows = value
    this.rebuildGeometry()
  }

  private _gridOffsetX = 0
  get gridOffsetX(): number {
    return this._gridOffsetX
  }
  set gridOffsetX(value: number) {
    this._gridOffsetX = value
    this.rebuildGeometry()
  }

  private _gridOffsetY = 0
  get gridOffsetY(): number {
    return this._gridOffsetY
  }
  set gridOffsetY(value: number) {
    this._gridOffsetY = value
    this.rebuildGeometry()
  }

  private _spacingX = 0
  get spacingX(): number {
    return this._spacingX
  }
  set spacingX(value: number) {
    this._spacingX = value
    this.rebuildGeometry()
  }

  private _spacingY = 0
  get spacingY(): number {
    return this._spacingY
  }
  set spacingY(value: number) {
    this._spacingY = value
    this.rebuildGeometry()
  }

  private _cellWidth = 0
  get cellWidth(): number {
    return this._cellWidth
  }
  set cellWidth(value: number) {
    this._cellWidth = value
    this.rebuildGeometry()
  }

  private _cellHeight = 0
  get cellHeight(): number {
    return this._cellHeight
  }
  set cellHeight(value: number) {
    this._cellHeight = value
    this.rebuildGeometry()
  }

  private _pixelArt = true
  get pixelArt(): boolean {
    return this._pixelArt
  }
  set pixelArt(value: boolean) {
    this._pixelArt = value
    this.rebuildMaterial()
  }

  private _mapWidth = 1
  get mapWidth(): number {
    return this._mapWidth
  }
  set mapWidth(value: number) {
    this._mapWidth = value
    this.rebuildMap()
  }

  private _mapHeight = 1
  get mapHeight(): number {
    return this._mapHeight
  }
  set mapHeight(value: number) {
    this._mapHeight = value
    this.rebuildMap()
  }

  private _cellSize = 1
  get cellSize(): number {
    return this._cellSize
  }
  set cellSize(value: number) {
    this._cellSize = value
    this.rebuildMap()
  }

  private _cells: number[] = []
  get cells(): number[] {
    return this._cells
  }
  set cells(value: number[]) {
    this._cells = [...value]
    this.rebuildMap()
  }

  private _solidTiles: number[] = []
  get solidTiles(): number[] {
    return this._solidTiles
  }
  set solidTiles(value: number[]) {
    this._solidTiles = [...value]
    this.rebuildSolids()
  }

  private _layer = 0
  get layer(): number {
    return this._layer
  }
  set layer(value: number) {
    this._layer = value
    this.rebuildGeometry()
  }

  private mesh?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
  private loadedTexture?: THREE.Texture
  private derivedSolids: Solid[] = []

  override onReady(): void {
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.makeMaterial())
    this.entity.node.add(this.mesh)
    this.rebuildMaterial()
    this.rebuildMap()
  }

  override onProjectionChange(): void {
    this.rebuildGeometry()
  }

  override onDestroy(): void {
    this.mesh?.removeFromParent()
    this.mesh?.geometry.dispose()
    this.mesh?.material.dispose()
    this.loadedTexture?.dispose()
    this.loadedTexture = undefined
    this.derivedSolids = []
    markOccludersChanged(this.game.lighting)
  }

  solids(): readonly Solid[] {
    return this.derivedSolids
  }

  cellIndex(column: number, row: number): number | null {
    return gridCellIndex(this.mapWidth, this.mapHeight, column, row)
  }

  cellAt(logicalX: number, logicalY: number): TilemapCell | null {
    return gridCellAt(this.gridSpec(), logicalX, logicalY)
  }

  cellBounds(column: number, row: number): TilemapCellBounds | null {
    return gridCellBounds(this.gridSpec(), column, row)
  }

  private gridSpec(): TilemapGridSpec {
    return {
      mapWidth: this.mapWidth,
      mapHeight: this.mapHeight,
      cellSize: this.cellSize,
      originX: this.entity?.position.x ?? 0,
      originY: this.entity?.position.y ?? 0,
    }
  }

  private rebuildMap(): void {
    this.rebuildGeometry()
    this.rebuildSolids()
  }

  private rebuildMaterial(): void {
    const mesh = this.mesh
    if (!mesh) return
    this.loadedTexture?.dispose()
    this.loadedTexture = undefined
    mesh.material.dispose()
    mesh.material = this.makeMaterial()
    if (!this.texture) return
    const requested = this.texture
    // Its own clone of the cached base (game.assets, ADR 0019). The image's
    // pixel size drives the UVs, so the geometry is rebuilt once the texture
    // settles — on a cache hit too, whose settlement is already resolved —
    // and a texture that fails is dropped for the flat colour; neither
    // happens if the texture was replaced or the component destroyed
    // meanwhile.
    const { texture, settled } = this.game.assets.texture(requested)
    reportRejection(settled.then((outcome) => {
      if (this.loadedTexture !== texture || this.texture !== requested) return
      if (outcome === 'loaded') this.rebuildGeometry()
      else this.dropFailedTexture()
    }), 'tilemap texture settle')
    if (this.pixelArt) {
      texture.magFilter = THREE.NearestFilter
      texture.minFilter = THREE.NearestFilter
    }
    this.loadedTexture = texture
    mesh.material.map = texture
    mesh.material.color.set(0xffffff)
    mesh.material.needsUpdate = true
  }

  /**
   * CA-4's failure rule: an image that never arrives leaves the flat
   * `color`, not a white map over an empty texture. Only reached while the
   * failed clone is still the current one (see rebuildMaterial).
   */
  private dropFailedTexture(): void {
    const mesh = this.mesh
    if (!mesh) return
    this.loadedTexture?.dispose()
    this.loadedTexture = undefined
    mesh.material.map = null
    mesh.material.color.setHex(this.color)
    mesh.material.needsUpdate = true
  }

  private makeMaterial(): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color: this.color,
      transparent: true,
      alphaTest: TRANSPARENT_TEXEL_ALPHA,
    })
  }

  private rebuildGeometry(): void {
    const mesh = this.mesh
    if (!mesh) return
    const buffers: TileMeshBuffers = { positions: [], uvs: [], indices: [] }
    const width = Math.max(0, Math.floor(this.mapWidth))
    const height = Math.max(0, Math.floor(this.mapHeight))
    const size = this.cellSize
    if (Number.isFinite(size) && size > 0) {
      const sheet = this.sheetSize()
      for (let index = 0; index < width * height; index++) {
        const tile = this.cells[index] ?? -1
        if (!Number.isFinite(tile) || tile < 0) continue
        this.pushTileQuad(buffers.positions, index % width, Math.floor(index / width))
        buffers.uvs.push(...this.tileUvs(tile, sheet))
        const vertex = buffers.positions.length / 3 - 4
        buffers.indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3)
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffers.uvs, 2))
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(buffers.indices), 1))
    mesh.geometry.dispose()
    mesh.geometry = geometry
    // WebGPURenderer issues a zero-count draw (WebGLRenderer skipped it): no tile, no draw.
    mesh.visible = buffers.indices.length > 0
  }

  /** The loaded sheet image's size, or one pixel per sheet cell until it arrives. */
  private sheetSize(): { width: number; height: number } {
    const image = this.loadedTexture?.image as { width?: number; height?: number } | undefined
    return {
      width: image?.width && image.width > 0 ? image.width : Math.max(1, this.cols),
      height: image?.height && image.height > 0 ? image.height : Math.max(1, this.rows),
    }
  }

  /** The four corners of a cell's quad, projected for the Game, on this layer's depth. */
  private pushTileQuad(positions: number[], column: number, row: number): void {
    const size = this.cellSize
    const logicalCenterX = (column + 0.5) * size
    const logicalCenterY = (row + 0.5) * size
    const center =
      this.game.projection === 'isometric'
        ? projectIsometric(logicalCenterX, logicalCenterY)
        : { x: logicalCenterX, y: logicalCenterY }
    const halfWidth = this.game.projection === 'isometric' ? size : size / 2
    const halfHeight = size / 2
    const z = this.layer * 0.01
    positions.push(
      center.x - halfWidth,
      center.y - halfHeight,
      z,
      center.x + halfWidth,
      center.y - halfHeight,
      z,
      center.x + halfWidth,
      center.y + halfHeight,
      z,
      center.x - halfWidth,
      center.y + halfHeight,
      z,
    )
  }

  /** The UVs of a tile's sheet cell, in the quad's corner order. */
  private tileUvs(tile: number, sheet: { width: number; height: number }): number[] {
    const frame = sheetCell(sheet.width, sheet.height, this.cols, this.rows, tile, {
      gridOffsetX: this.gridOffsetX,
      gridOffsetY: this.gridOffsetY,
      spacingX: this.spacingX,
      spacingY: this.spacingY,
      cellWidth: this.cellWidth,
      cellHeight: this.cellHeight,
    })
    const left = frame.x / sheet.width
    const right = (frame.x + frame.width) / sheet.width
    const bottom = 1 - (frame.y + frame.height) / sheet.height
    const top = 1 - frame.y / sheet.height
    return [left, bottom, right, bottom, right, top, left, top]
  }

  private rebuildSolids(): void {
    if (!this.entity || !this.game) return
    const solids = new Set(this.solidTiles)
    const width = Math.max(0, Math.floor(this.mapWidth))
    const height = Math.max(0, Math.floor(this.mapHeight))
    const next: Solid[] = []
    for (let index = 0; index < width * height; index++) {
      const tile = this.cells[index] ?? -1
      if (!solids.has(tile)) continue
      const column = index % width
      const row = Math.floor(index / width)
      const bounds = this.cellBounds(column, row)
      if (!bounds) continue
      const solid = new Solid()
      solid.entity = this.entity
      solid.game = this.game
      solid.width = this.cellSize
      solid.height = this.cellSize
      solid.offsetX = bounds.centerX - this.entity.position.x
      solid.offsetY = bounds.centerY - this.entity.position.y
      next.push(solid)
    }
    this.derivedSolids = next
    // Occlusion is rebuilt from the solid tiles only when they change (inference 9).
    markOccludersChanged(this.game.lighting)
  }
}
