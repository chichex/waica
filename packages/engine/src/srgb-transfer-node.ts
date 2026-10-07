import { mix, pow, step, vec3 } from 'three/tsl'
import type * as THREE from 'three/webgpu'

type Vec3 = THREE.Node<'vec3'>

/** The sRGB transfer function's decode (EOTF), per channel: an sRGB value to linear. */
export function srgbToLinear(color: Vec3): Vec3 {
  const curve = pow(color.add(0.055).div(1.055), vec3(2.4, 2.4, 2.4))
  const toe = color.div(12.92)
  return mix(curve, toe, step(color, vec3(0.04045, 0.04045, 0.04045)))
}

/** The sRGB transfer function's encode (OETF), per channel: a linear value to sRGB. */
export function linearToSrgb(color: Vec3): Vec3 {
  const curve = pow(color, vec3(1 / 2.4, 1 / 2.4, 1 / 2.4)).mul(1.055).sub(0.055)
  const toe = color.mul(12.92)
  return mix(curve, toe, step(color, vec3(0.0031308, 0.0031308, 0.0031308)))
}

