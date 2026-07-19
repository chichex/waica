export { Game } from './game'
export type { GameOptions, UpdateFn } from './game'

// Escape hatch explícito mientras la API propia crece: una sola fuente de three
// para todo el workspace. La tesis es que three sea detalle de implementación,
// pero en v0 el usuario aún compone escenas directamente.
export * as THREE from 'three'
