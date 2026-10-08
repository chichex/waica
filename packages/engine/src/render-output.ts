import { uv, vertexStage, workingToColorSpace } from 'three/tsl'
import * as THREE from 'three/webgpu'

/** What three hands a renderer-level `getOutput` hook while it builds a material. */
interface OutputBuilder {
  readonly renderer: { getRenderTarget(): unknown }
}

/** The plain object behind `renderer.contextNode`, which three merges into every material build. */
type RendererContext = Record<string, unknown>

/**
 * Makes WebGPURenderer draw the way WebGLRenderer did (ADR 0025): straight
 * into the 8-bit canvas, each material encoding its color to sRGB in its own
 * shader, so alpha blending happens on sRGB values. By default three renders
 * into a linear half-float target and converts it in an extra full-screen
 * pass: blending in linear space, which changes every translucent edge, and
 * one more draw per frame. A render target keeps the linear working space.
 */
export function drawStraightToCanvas(renderer: THREE.WebGPURenderer): void {
  // The working space as output: three then needs no intermediate target.
  renderer.outputColorSpace = THREE.ColorManagement.workingColorSpace
  const context = renderer.contextNode.value as RendererContext
  context.getOutput = (output: THREE.Node, builder: OutputBuilder): THREE.Node => {
    const target = builder.renderer.getRenderTarget()
    const likeCanvas = target === null || (typeof target === 'object' && canvasLike.has(target))
    return likeCanvas ? workingToColorSpace(output, THREE.SRGBColorSpace) : output
  }
}

/** Render targets that hold a frame exactly as the canvas would: sRGB-encoded 8-bit values. */
const canvasLike = new WeakSet<object>()

/**
 * Makes `target` receive what the canvas would (issue #78): every material
 * encodes to sRGB into it and blends on sRGB values, so a frame drawn there
 * and copied to the canvas is the frame drawn straight to the canvas. The
 * Post Effects' 8-bit target.
 */
export function drawLikeCanvas(target: THREE.RenderTarget): THREE.RenderTarget {
  canvasLike.add(target)
  return target
}

/**
 * The scene background for a canvas drawn straight: three clears with a
 * color's working-space (linear) components, and the canvas stores sRGB, so
 * the clear carries the color's sRGB components — what WebGLRenderer wrote.
 */
export function canvasBackground(color: THREE.ColorRepresentation): THREE.Color {
  const { r, g, b } = new THREE.Color(color).getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace)
  return new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace)
}

/** What a renderer-level `getUV` hook receives: the texture being sampled, and the object drawn. */
interface UvTexture {
  readonly uvNode: THREE.Node | null
  readonly value: THREE.Texture
  getTransformedUV(uvNode: THREE.Node): THREE.Node
  setUpdateMatrix(value: boolean): unknown
}

/**
 * Applies a material map's UV transform (offset, repeat) per vertex, as
 * WebGLRenderer's `vMapUv` did, instead of per fragment as three's node
 * materials do by default. At a quad's corners the UV is 0 or 1, so the
 * transformed corner UV is the same float however a shader compiler fuses
 * the multiply and add — per fragment it is not, and a sprite whose sheet
 * offset is not 0 could then sample a texel row apart in two shaders of the
 * same picture (a Sprite Batch and its per-sprite fallback, ADR 0024).
 * Textures with their own UV node, or sampled outside a mesh, stay three's.
 */
export function mapUvPerVertex(renderer: THREE.WebGPURenderer): void {
  const context = renderer.contextNode.value as RendererContext
  context.getUV = (texture: UvTexture, builder: { readonly object: unknown }): THREE.Node | null => {
    if (texture.uvNode !== null || !(builder.object as Partial<THREE.Mesh>).isMesh) return null
    texture.setUpdateMatrix(false)
    return vertexStage(texture.getTransformedUV(uv(texture.value.channel)))
  }
}
