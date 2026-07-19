export { Game } from './game'
export type { GameOptions, UpdateFn, ParamOverrides } from './game'
export { Entity } from './entity'
export { Component } from './component'
export type { ComponentClass, ParamSpec } from './component'
export { Input } from './input'
export type { ActionName } from './input'
export { Sprite } from './components/sprite'
export { Solid } from './components/solid'

// Escape hatch explícito mientras la API propia crece: una sola fuente de three
// para todo el workspace. La tesis es que three sea detalle de implementación.
export * as THREE from 'three'
