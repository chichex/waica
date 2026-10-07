import { clamp, dot, float, length, max, mix, texture, uniform, uv, vec3, vec4 } from 'three/tsl'
import * as THREE from 'three/webgpu'
import { FrameQuad } from './frame-quad.js'
import type { PostEffectsState } from './scene-render-options.js'
import { hexChannels } from './scene-lighting.js'
import { linearToSrgb } from './srgb-transfer-node.js'

/** The Post Effects' inputs, set every frame from `game.post`. */
interface PostUniforms {
  vignetteOn: THREE.UniformNode<'float', number>
  vignetteIntensity: THREE.UniformNode<'float', number>
  vignetteRadius: THREE.UniformNode<'float', number>
  gradeOn: THREE.UniformNode<'float', number>
  tint: THREE.UniformNode<'vec3', THREE.Vector3>
  contrast: THREE.UniformNode<'float', number>
  saturation: THREE.UniformNode<'float', number>
}

function createUniforms(): PostUniforms {
  return {
    vignetteOn: uniform(0),
    vignetteIntensity: uniform(0),
    vignetteRadius: uniform(0),
    gradeOn: uniform(0),
    tint: uniform(new THREE.Vector3(1, 1, 1)),
    contrast: uniform(1),
    saturation: uniform(1),
  }
}

/**
 * The single full-screen pass of the Post Effects (issue #78 CA-11): it reads
 * the frame from the linear target, encodes it to sRGB, grades it there —
 * tint, then saturation around Rec. 709 luma, then contrast around mid grey —
 * and darkens it towards the corners. Its output is the canvas's sRGB value.
 */
function createPostMaterial(scene: THREE.Texture, u: PostUniforms): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial()
  const display = linearToSrgb(max(texture(scene, uv()).rgb, vec3(0, 0, 0)))
  const tinted = display.mul(u.tint)
  const luma = dot(tinted, vec3(0.2126, 0.7152, 0.0722))
  const saturated = mix(vec3(luma, luma, luma), tinted, u.saturation)
  const graded = saturated.sub(0.5).mul(u.contrast).add(0.5)
  const color = mix(display, graded, u.gradeOn)
  // 0 at the centre, 1 at the corners.
  const distance = length(uv().sub(0.5).mul(2)).div(Math.SQRT2)
  const ramp = clamp(distance.sub(u.vignetteRadius).div(max(float(1).sub(u.vignetteRadius), 1e-3)), 0, 1)
  const eased = ramp.mul(ramp).mul(float(3).sub(ramp.mul(2)))
  const vignette = float(1).sub(u.vignetteIntensity.mul(eased).mul(u.vignetteOn))
  material.fragmentNode = vec4(clamp(color.mul(vignette), vec3(0, 0, 0), vec3(1, 1, 1)), 1)
  material.depthTest = false
  material.depthWrite = false
  return material
}

/**
 * The Post Effects' render target and pass: the frame is drawn into `target`
 * (linear, half float, at the light-map resolution with nearest upscale —
 * E2), then `draw` writes it to the canvas through the effects.
 */
export class PostPass {
  readonly target = new THREE.RenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
  })
  private readonly uniforms = createUniforms()
  private readonly quad = new FrameQuad(createPostMaterial(this.target.texture, this.uniforms))

  /** Sizes the target for this frame. */
  resize(width: number, height: number): void {
    if (this.target.width !== width || this.target.height !== height) this.target.setSize(width, height)
  }

  /** Draws the target to whatever is bound now (the canvas), with this frame's effects. */
  draw(renderer: THREE.WebGPURenderer, effects: PostEffectsState): void {
    this.setVignette(effects.vignette)
    this.setColorGrade(effects.colorGrade)
    this.quad.render(renderer)
  }

  private setVignette(vignette: PostEffectsState['vignette']): void {
    const u = this.uniforms
    u.vignetteOn.value = vignette ? 1 : 0
    u.vignetteIntensity.value = vignette ? vignette.intensity : 0
    u.vignetteRadius.value = vignette ? vignette.radius : 0
  }

  private setColorGrade(grade: PostEffectsState['colorGrade']): void {
    const u = this.uniforms
    const neutral = { tint: '#ffffff', contrast: 1, saturation: 1 }
    const { tint, contrast, saturation } = grade ?? neutral
    u.gradeOn.value = grade ? 1 : 0
    const [r, g, b] = hexChannels(tint)
    u.tint.value.set(r, g, b)
    u.contrast.value = contrast
    u.saturation.value = saturation
  }

  dispose(): void {
    this.target.dispose()
    this.quad.dispose()
  }
}
