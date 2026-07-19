import * as THREE from 'three'

export interface GameOptions {
  /** Canvas donde se dibuja el juego. */
  canvas: HTMLCanvasElement
  /** Color de fondo de la escena. */
  background?: THREE.ColorRepresentation
  /** Altura visible del mundo en unidades; la cámara 2D encuadra esto. */
  viewHeight?: number
}

export type UpdateFn = (dt: number) => void

/**
 * v0 del núcleo: un loop, una escena three y una cámara ortográfica 2D.
 * La API pública real (Entity + Components, behaviors, arquetipos) se
 * construye encima de esto — ver DESIGN.md §6-§8.
 */
export class Game {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.OrthographicCamera
  // TODO(H1): migrar a WebGPURenderer (three/webgpu) con fallback WebGL2 automático.
  private readonly renderer: THREE.WebGLRenderer
  private readonly updateFns = new Set<UpdateFn>()
  private readonly viewHeight: number
  private lastTime = 0

  constructor(options: GameOptions) {
    const { canvas, background = 0x1a1a2e, viewHeight = 10 } = options
    this.viewHeight = viewHeight
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.scene.background = new THREE.Color(background)
    this.camera = new THREE.OrthographicCamera()
    this.camera.position.z = 10
    this.resize()
    new ResizeObserver(() => this.resize()).observe(canvas)
  }

  /** Registra una función que corre una vez por frame. Devuelve el de-registro. */
  onUpdate(fn: UpdateFn): () => void {
    this.updateFns.add(fn)
    return () => this.updateFns.delete(fn)
  }

  start(): void {
    this.renderer.setAnimationLoop((time) => this.tick(time))
  }

  stop(): void {
    this.renderer.setAnimationLoop(null)
  }

  private tick(time: number): void {
    // Clamp del dt: cambiar de pestaña o pausar no dispara la simulación.
    const dt = Math.min((time - this.lastTime) / 1000, 0.1)
    this.lastTime = time
    for (const fn of this.updateFns) fn(dt)
    this.renderer.render(this.scene, this.camera)
  }

  private resize(): void {
    const canvas = this.renderer.domElement
    const { clientWidth: w, clientHeight: h } = canvas
    if (w === 0 || h === 0) return
    this.renderer.setSize(w, h, false)
    const halfH = this.viewHeight / 2
    const halfW = halfH * (w / h)
    this.camera.left = -halfW
    this.camera.right = halfW
    this.camera.top = halfH
    this.camera.bottom = -halfH
    this.camera.updateProjectionMatrix()
  }
}
