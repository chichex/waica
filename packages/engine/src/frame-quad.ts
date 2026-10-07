import * as THREE from 'three/webgpu'

/** The scenes FrameQuad draws, so a test can tell them from any other render. */
const quadScenes = new WeakSet<object>()

/** Whether `value` is the scene of a FrameQuad. */
export function isFrameQuad(value: unknown): boolean {
  return typeof value === 'object' && value !== null && quadScenes.has(value)
}

/**
 * Two triangles covering the viewport, with three's QuadMesh UV convention
 * (v = 1 at the bottom), so a render target samples upright on both Render
 * Backends — three flips a render target's v itself on WebGL2.
 */
function quadGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2))
  geometry.setIndex([0, 1, 2, 0, 2, 3])
  return geometry
}

/**
 * A full-viewport pass drawn as an ordinary scene with its own camera — not
 * a THREE.QuadMesh: on the WebGPU backend a QuadMesh drawn to the canvas
 * marks that render a full-screen pass, and the next render to the canvas in
 * the same frame then loses everything drawn before it (seen in the issue
 * #78 e2e). The lit frame draws its Emissive drawables after its multiply
 * quad, so its quad must be ordinary.
 */
export class FrameQuad {
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly mesh: THREE.Mesh

  constructor(readonly material: THREE.Material) {
    this.mesh = new THREE.Mesh(quadGeometry(), material)
    this.mesh.position.z = -0.5
    this.mesh.frustumCulled = false
    this.scene.add(this.mesh)
    this.scene.matrixWorldAutoUpdate = true
    quadScenes.add(this.scene)
  }

  /** Draws the quad into whatever is bound now, inside the current viewport. */
  render(renderer: THREE.WebGPURenderer): void {
    renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}
