import type * as THREE from 'three/webgpu'

/**
 * The three.js layer an Emissive drawable lives on, alone (issue #78 CA-10).
 * The Game's camera sees layer 0 and this one, so an unlit scene draws an
 * Emissive drawable in place like any other; a lit scene draws layer 0, then
 * its light-map, then this layer at full brightness (ADR 0026).
 */
export const EMISSIVE_LAYER = 1

/** Puts `object` on the Emissive layer alone, or back on the default layer 0. */
export function setEmissive(object: THREE.Object3D, emissive: boolean): void {
  object.layers.set(emissive ? EMISSIVE_LAYER : 0)
}

/**
 * The alphaTest every drawable carries (PR #150 review): a texel whose alpha
 * byte is 0 is discarded instead of drawn. It contributes no color either way
 * (normal blending keeps the frame), but discarded it also writes no depth, so
 * an Emissive drawable drawn after the lit pass shows through the transparent
 * texels of a lit sprite in front of it, and stays hidden behind its opaque ones.
 */
export const TRANSPARENT_TEXEL_ALPHA = 1 / 512
