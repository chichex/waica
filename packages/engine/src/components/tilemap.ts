import * as THREE from 'three'
import { sheetCell } from '../animation/sheet.js'
import { Component } from '../component.js'
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

const loader = new THREE.TextureLoader()

/** One authorable cell map rendered as a single merged geometry. */
export class Tilemap extends Component implements SolidSource {
  static override componentName = 'Tilemap'
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
    const texture = loader.load(requested, () => {
      if (this.loadedTexture === texture && this.texture === requested) this.rebuildGeometry()
    })
    if (this.pixelArt) {
      texture.magFilter = THREE.NearestFilter
      texture.minFilter = THREE.NearestFilter
    }
    texture.colorSpace = THREE.SRGBColorSpace
    this.loadedTexture = texture
    mesh.material.map = texture
    mesh.material.color.set(0xffffff)
    mesh.material.needsUpdate = true
  }

  private makeMaterial(): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color: this.color,
      transparent: true,
    })
  }

  private rebuildGeometry(): void {
    const mesh = this.mesh
    if (!mesh) return
    const positions: number[] = []
    const uvs: number[] = []
    const indices: number[] = []
    const width = Math.max(0, Math.floor(this.mapWidth))
    const height = Math.max(0, Math.floor(this.mapHeight))
    const size = this.cellSize
    if (Number.isFinite(size) && size > 0) {
      const image = this.loadedTexture?.image as { width?: number; height?: number } | undefined
      const imageWidth = image?.width && image.width > 0 ? image.width : Math.max(1, this.cols)
      const imageHeight = image?.height && image.height > 0 ? image.height : Math.max(1, this.rows)
      const frameParams = {
        gridOffsetX: this.gridOffsetX,
        gridOffsetY: this.gridOffsetY,
        spacingX: this.spacingX,
        spacingY: this.spacingY,
        cellWidth: this.cellWidth,
        cellHeight: this.cellHeight,
      }
      for (let index = 0; index < width * height; index++) {
        const tile = this.cells[index] ?? -1
        if (!Number.isFinite(tile) || tile < 0) continue
        const column = index % width
        const row = Math.floor(index / width)
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
        const frame = sheetCell(
          imageWidth,
          imageHeight,
          this.cols,
          this.rows,
          tile,
          frameParams,
        )
        const left = frame.x / imageWidth
        const right = (frame.x + frame.width) / imageWidth
        const bottom = 1 - (frame.y + frame.height) / imageHeight
        const top = 1 - frame.y / imageHeight
        uvs.push(left, bottom, right, bottom, right, top, left, top)
        const vertex = positions.length / 3 - 4
        indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3)
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1))
    mesh.geometry.dispose()
    mesh.geometry = geometry
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
  }
}
