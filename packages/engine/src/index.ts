export { Game } from './game.js'
export type {
  GameOptions,
  GameResolution,
  SpawnPrefabOptions,
  UpdateFn,
  ParamOverrides,
} from './game.js'
export { CAMERA_DEFAULTS, resolveSceneCamera, stepSceneCamera } from './camera.js'
export type { SceneCameraJson, CameraLimitsJson, ResolvedSceneCamera } from './camera.js'
export { Entity } from './entity.js'
export { Component } from './component.js'
export { authoringDefaults } from './authoring-defaults.js'
export type {
  ComponentClass,
  ContactNormal,
  ParamSpec,
  SolidContact,
} from './component.js'
export { collectModuleComponents, mergeRegistryComponents } from './component-registry.js'
export type { ComponentModule } from './component-registry.js'
export { Input, DEFAULT_BINDINGS } from './input.js'
export type { ActionName, InputBindings } from './input.js'
export type {
  ArchetypeArt,
  ArchetypeManifest,
  BrowserArchetypeManifest,
  EntityTemplate,
} from './archetype.js'
export { Stats } from './stats.js'
export type { StatValue } from './stats.js'
export { GameUi } from './ui.js'
export { Sprite } from './components/sprite.js'
export { Solid } from './components/solid.js'
export { Hitbox } from './components/hitbox.js'
export { DynamicBody } from './components/dynamic-body.js'
export { AnimatedSprite } from './components/animated-sprite.js'
export { aabbOverlap } from './aabb.js'
export { resolveSolidAxis } from './solid-axis.js'
export type { CollisionAxis, SolidAxisOptions } from './solid-axis.js'
export {
  COLLISION_SHAPES,
  DEFAULT_COLLISION_POLYGON,
  collisionBounds,
  collisionOverlap,
  collisionVertices,
  resolveCollisionPoints,
} from './collision-shape.js'
export type {
  CollisionBody,
  CollisionBounds,
  CollisionPoint,
  CollisionShape,
} from './collision-shape.js'
export { Emitter } from './events.js'
export { loadScene, spawnFromJson, resolveEntityComponents, resolveProps } from './scene.js'
export type { SceneJson, SceneEntityJson, SceneComponentJson, SceneRegistry, PrefabJson } from './scene.js'
export { ClipPlayer } from './animation/clip-player.js'
export type { ClipDef } from './animation/clip-player.js'
export { sheetCell, sheetFrameCount, locateFrame } from './animation/sheet.js'
export type { SheetGridParams, SheetCell, SheetDef } from './animation/sheet.js'
export { resolveClip, missingClips } from './animation/contract.js'
export type { AnimationContract } from './animation/contract.js'
export { StateMachine, evaluateTrigger, nextTransition } from './state/state-machine.js'
export type { StateJson, StateTransitionJson, TriggerEnv } from './state/state-machine.js'
export {
  defineRole,
  defineStates,
  installArchetype,
  logicSet,
  registeredLogicSets,
  registeredRoles,
  resetRegistries,
  roleDefinition,
} from './state/hooks.js'
export type {
  ArchetypeBundle,
  RoleDefinition,
  RoleGraph,
  StateContext,
  StateHooks,
  StateLogic,
} from './state/hooks.js'

// Explicit escape hatch while our own API grows: a single source of three
// for the whole workspace. The thesis is that three stays an implementation detail.
export * as THREE from 'three'
