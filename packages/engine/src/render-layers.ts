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
