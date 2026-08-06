import * as THREE from 'three'
import { Component } from '../component.js'
import { ClipPlayer, type ClipDef } from '../animation/clip-player.js'
import { locateFrame, sheetCell, type SheetCell, type SheetDef } from '../animation/sheet.js'

const loader = new THREE.TextureLoader()

/**
 * Sprite animated from one or more spritesheets. The main sheet is the
 * top-level texture/cols/rows (or explicit cells); extraSheets append after
 * it, and clip frames index the sheets consecutively (sheet 0 owns 0..n0-1,
 * sheet 1 the next n1, …). Each instance clones its textures to animate UVs
 * independently. On sheets with explicit cells the frames vary in pixel size,
 * so the quad rescales per frame, anchored bottom-center — width/height size
 * the sheet's largest frame and smaller ones keep their feet planted.
 */
export class AnimatedSprite extends Component {
  static override componentName = 'AnimatedSprite'
  static override params = {
    offsetX: { label: 'x offset' },
    offsetY: { label: 'y offset' },
    layer: { label: 'layer', min: -5, max: 5, step: 1 },
  }
  static override transient = [
    'current',
    'player',
    'sheets',
    'texs',
    'mesh',
    'frame',
    'frameScaleX',
    'frameScaleY',
  ]

  /** Spritesheet URL. */
  texture = ''
  /** Sheet grid dimensions. */
  cols = 1
  rows = 1
  // Slicing params for sheets whose frames don't fill the image (margins,
  // gaps, fixed cell size). In image pixels; 0 = default uniform grid.
  gridOffsetX = 0
  gridOffsetY = 0
  spacingX = 0
  spacingY = 0
  cellWidth = 0
  cellHeight = 0
  /** Explicit frame rects for the main sheet (packed sheets); wins over the grid. */
  cells: SheetCell[] = []
  /** Additional sheets after the main one; clip frames continue across them. */
  extraSheets: SheetDef[] = []
  // Size in world units. Reactive like Sprite's: assigning rescales the unit
  // quad, even outside the simulation loop (the editor drags them live).
  private _width = 1
  private _height = 1
  get width(): number {
    return this._width
  }
  set width(value: number) {
    this._width = value
    this.syncQuad()
  }
  get height(): number {
    return this._height
  }
  set height(value: number) {
    this._height = value
    this.syncQuad()
  }
  private _offsetX = 0
  private _offsetY = 0
  get offsetX(): number {
    return this._offsetX
  }
  set offsetX(value: number) {
    this._offsetX = value
    this.syncQuad()
  }
  get offsetY(): number {
    return this._offsetY
  }
  set offsetY(value: number) {
    this._offsetY = value
    this.syncQuad()
  }

  pixelArt = true

  // Draw order among sprites: higher layers render in front. Same-layer
  // sprites fall back to spawn order, so give overlap an explicit layer.
  private _layer = 0
  get layer(): number {
    return this._layer
  }
  set layer(value: number) {
    this._layer = value
    if (this.mesh) this.mesh.position.z = value * 0.01
  }

  clips: Record<string, ClipDef> = {}
  initialClip?: string

  /** Clip currently playing. */
  current?: string

  private readonly player = new ClipPlayer()
  private sheets: SheetDef[] = []
  private texs: THREE.Texture[] = []
  private mesh?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  private frame = 0
  // Current frame's quad scale relative to the sheet's largest cell: always
  // 1 on grid sheets, per-frame on cell sheets (frames vary in pixel size).
  private frameScaleX = 1
  private frameScaleY = 1

  override onReady(): void {
    const main: SheetDef = {
      texture: this.texture,
      cols: this.cols,
      rows: this.rows,
      gridOffsetX: this.gridOffsetX,
      gridOffsetY: this.gridOffsetY,
      spacingX: this.spacingX,
      spacingY: this.spacingY,
      cellWidth: this.cellWidth,
      cellHeight: this.cellHeight,
    }
    if (this.cells.length) main.cells = this.cells
    this.sheets = [main, ...this.extraSheets]
    this.texs = this.sheets.map((sheet) => {
      // Non-uniform slicing needs the image's pixel size, so re-apply the
      // current frame once each texture is in.
      const tex = loader.load(sheet.texture, () => this.applyFrame())
      tex.colorSpace = THREE.SRGBColorSpace
      if (this.pixelArt) {
        tex.magFilter = THREE.NearestFilter
        tex.minFilter = THREE.NearestFilter
      }
      tex.repeat.set(1 / Math.max(1, sheet.cols), 1 / Math.max(1, sheet.rows))
      return tex
    })
    const material = new THREE.MeshBasicMaterial({ map: this.texs[0], transparent: true })
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
    this.mesh.position.z = this.layer * 0.01
    this.syncQuad()
    this.entity.node.add(this.mesh)
    if (this.initialClip) this.play(this.initialClip)
  }

  /** Switches clip; repeating the same name doesn't restart the animation. */
  play(name: string): void {
    if (this.current === name) return
    const clip = this.clips[name]
    if (!clip) return
    this.player.set(clip)
    this.current = name
  }

  override onUpdate(dt: number): void {
    if (this.texs.length === 0 || !this.current) return
    this.showFrame(this.player.advance(dt))
  }

  override onDestroy(): void {
    this.mesh?.removeFromParent()
    this.mesh?.geometry.dispose()
    this.mesh?.material.dispose()
    for (const tex of this.texs) tex.dispose()
  }

  private showFrame(index: number): void {
    this.frame = index
    this.applyFrame()
  }

  /** Repositions/rescales the quad from size, offsets and the frame scale. */
  private syncQuad(): void {
    if (!this.mesh) return
    this.mesh.scale.set(this._width * this.frameScaleX, this._height * this.frameScaleY, 1)
    // Bottom-center anchor: a shrunk frame keeps its feet on the quad's floor.
    this.mesh.position.x = this._offsetX
    this.mesh.position.y = this._offsetY - (this._height * (1 - this.frameScaleY)) / 2
  }

  private applyFrame(): void {
    const located = locateFrame(this.sheets, this.frame)
    const sheet = this.sheets[located.sheet]
    const tex = this.texs[located.sheet]
    if (!sheet || !tex) return
    if (this.mesh && this.mesh.material.map !== tex) {
      this.mesh.material.map = tex
      this.mesh.material.needsUpdate = true
    }
    const cells = sheet.cells
    if (cells?.length) {
      const cell = sheetCell(0, 0, sheet.cols, sheet.rows, located.frame, sheet)
      const maxW = Math.max(...cells.map((c) => c.width))
      const maxH = Math.max(...cells.map((c) => c.height))
      this.frameScaleX = maxW > 0 ? cell.width / maxW : 1
      this.frameScaleY = maxH > 0 ? cell.height / maxH : 1
      this.syncQuad()
      const image = tex.image as { width?: number; height?: number } | undefined
      if (image?.width && image?.height) {
        tex.repeat.set(cell.width / image.width, cell.height / image.height)
        tex.offset.set(cell.x / image.width, 1 - (cell.y + cell.height) / image.height)
      }
      return
    }
    if (this.frameScaleX !== 1 || this.frameScaleY !== 1) {
      this.frameScaleX = 1
      this.frameScaleY = 1
      this.syncQuad()
    }
    const image = tex.image as { width?: number; height?: number } | undefined
    if (image?.width && image?.height) {
      const cell = sheetCell(image.width, image.height, sheet.cols, sheet.rows, located.frame, sheet)
      tex.repeat.set(cell.width / image.width, cell.height / image.height)
      tex.offset.set(cell.x / image.width, 1 - (cell.y + cell.height) / image.height)
      return
    }
    // Image not loaded yet: uniform-grid math needs no pixel size.
    const cols = Math.max(1, sheet.cols)
    const rows = Math.max(1, sheet.rows)
    tex.offset.set((located.frame % cols) / cols, 1 - (Math.floor(located.frame / cols) + 1) / rows)
  }
}
