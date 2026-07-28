export { Game } from './game'
export type { GameOptions, GameResolution, UpdateFn, ParamOverrides } from './game'
export { CAMERA_DEFAULTS, resolveSceneCamera, stepSceneCamera } from './camera'
export type { SceneCameraJson, CameraLimitsJson, ResolvedSceneCamera } from './camera'
export { Entity } from './entity'
export { Component } from './component'
export type { ComponentClass, ParamSpec } from './component'
export { Input, DEFAULT_BINDINGS } from './input'
export type { ActionName, InputBindings } from './input'
export { Stats } from './stats'
export type { StatValue } from './stats'
export { GameUi } from './ui'
export { Sprite } from './components/sprite'
export { Solid } from './components/solid'
export { Hitbox } from './components/hitbox'
export { AnimatedSprite } from './components/animated-sprite'
export { aabbOverlap } from './aabb'
export { resolveSolidAxis } from './solid-axis'
export type { CollisionAxis, SolidAxisOptions } from './solid-axis'
export {
  COLLISION_SHAPES,
  DEFAULT_COLLISION_POLYGON,
  collisionBounds,
  collisionOverlap,
  collisionVertices,
  resolveCollisionPoints,
} from './collision-shape'
export type {
  CollisionBody,
  CollisionBounds,
  CollisionPoint,
  CollisionShape,
} from './collision-shape'
export { Emitter } from './events'
export { loadScene, spawnFromJson, resolveEntityComponents, resolveProps } from './scene'
export type { SceneJson, SceneEntityJson, SceneComponentJson, SceneRegistry, PrefabJson } from './scene'
export { ClipPlayer } from './animation/clip-player'
export type { ClipDef } from './animation/clip-player'
export { sheetCell, sheetFrameCount, locateFrame } from './animation/sheet'
export type { SheetGridParams, SheetCell, SheetDef } from './animation/sheet'
export { resolveClip, missingClips } from './animation/contract'
export type { AnimationContract } from './animation/contract'
export { StateMachine, evaluateTrigger, nextTransition } from './state/state-machine'
export type { StateJson, StateTransitionJson, TriggerEnv } from './state/state-machine'
export {
  defineRole,
  defineStates,
  installArchetype,
  logicSet,
  registeredLogicSets,
  registeredRoles,
  resetRegistries,
  roleDefinition,
} from './state/hooks'
export type {
  ArchetypeBundle,
  RoleDefinition,
  RoleGraph,
  StateContext,
  StateHooks,
  StateLogic,
} from './state/hooks'

// Explicit escape hatch while our own API grows: a single source of three
// for the whole workspace. The thesis is that three stays an implementation detail.
export * as THREE from 'three'
