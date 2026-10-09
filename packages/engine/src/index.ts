export { Game } from './game.js'
export type {
  GameOptions,
  GameResolution,
  SceneCatalog,
  SpawnPrefabOptions,
  UpdateFn,
  ParamOverrides,
} from './game.js'
export { AssetLoader } from './assets/asset-loader.js'
export type { AssetStatus } from './assets/asset-loader.js'
export type { TextureBackend } from './assets/texture-backend.js'
export { GltfModelBackend } from './assets/model-backend.js'
export type { LoadedModel, ModelBackend } from './assets/model-backend.js'
export type { ModelHandle, ModelOutcome } from './assets/model-cache.js'
export { AudioSubsystem } from './audio/audio-subsystem.js'
export type { AudioSubsystemOptions } from './audio/audio-subsystem.js'
export type { AudioBackend, AudioResource, BackendPlayHandle, BackendPlayOptions } from './audio/backend.js'
export type { AudioChannelState, AudioPlayOptions, LiveSoundInfo, SoundHandle } from './audio/types.js'
export {
  installDirectionalAnimation,
  installedDirectionalAnimation,
  isAnimationFacingProvider,
  resolveDirectionalClip,
} from './animation/directional.js'
export type {
  AnimationFacingProvider,
  DirectionalAnimation,
  DirectionalFallback,
  ResolvedDirectionalClip,
} from './animation/directional.js'
export { isYSortBatchParticipant, isYSortParticipant, ySortZ } from './render-sort.js'
export type { YSortBatchParticipant, YSortEntry, YSortParticipant } from './render-sort.js'
export { projectIsometric, screenInputToLogical, unprojectIsometric } from './projection.js'
export type { ProjectedPoint } from './projection.js'
export { spritePlacement } from './sprite-placement.js'
export type { SpritePlacement, SpritePlacementInput } from './sprite-placement.js'
export { CAMERA_DEFAULTS, isCameraVelocityProvider, resolveSceneCamera, stepSceneCamera } from './camera.js'
export { SIMULATION_STEP, SIMULATION_TIME_EPSILON } from './fixed-step.js'
export { CameraEffects } from './camera-effects.js'
export type {
  CameraEffectColor,
  CameraEffectHandle,
  CameraEffectsOptions,
  CameraEffectsState,
  FadeOptions,
  FlashOptions,
  ShakeOptions,
} from './camera-effects.js'
export { GameTime, advanceGameTime } from './game-time.js'
export type { EasingName, TimerHandle, TimerOptions, TweenOptions } from './game-time.js'
export type {
  SceneCameraJson,
  OrthographicSceneCameraJson,
  CameraLimitsJson,
  CameraVelocity,
  CameraVelocityProvider,
  ResolvedSceneCamera,
} from './camera.js'
export {
  isPerspectiveCameraJson,
  PERSPECTIVE_DEFAULTS,
  perspectiveCameraIssues,
  placePerspectiveCamera,
  resolvePerspectiveCamera,
} from './scene-camera-3d.js'
export type {
  PerspectiveSceneCameraJson,
  ResolvedPerspectiveCamera,
  SceneFieldIssue,
  Vec3Json,
} from './scene-camera-3d.js'
export { isPerspectiveCamera, worldToNormalized } from './camera-projection.js'
export type { GameCamera, NormalizedPoint, ViewCamera, WorldPoint } from './camera-projection.js'
export {
  componentSpaceMismatch,
  entityTransformIssues,
  resolveSceneSpace,
  SCENE_SPACES,
  sceneSpaceIssues,
  THREE_D_COMPONENTS,
  TWO_D_COMPONENTS,
} from './scene-space.js'
export type { SceneSpace } from './scene-space.js'
export type { RuntimeSnapshotView } from './runtime-view-snapshot.js'
export { applyTransformJson } from './entity-transform.js'
export type { PositionJson, TransformJson } from './entity-transform.js'
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
export { resolveComponentUpdateSchedule } from './component-update-schedule.js'
export type {
  ComponentUpdateCycleIssue,
  ComponentUpdateRegistry,
  ComponentUpdateScheduleIssue,
  ComponentUpdateScheduleResult,
  DuplicateComponentUpdateIssue,
  InvalidComponentUpdateConstraintIssue,
  InvalidComponentUpdateSchedule,
  InvalidUpdateConstraintReason,
  ValidComponentUpdateSchedule,
} from './component-update-schedule.js'
export { Input, DEFAULT_BINDINGS } from './input.js'
export type { ActionName, InjectedActionOperation, InputBindings, InputOptions } from './input.js'
export {
  ACTION_HELD_THRESHOLD,
  firstStandardPadValues,
  GAMEPAD_CODE_PREFIX,
  gamepadControl,
} from './gamepad.js'
export type { GamepadControl } from './gamepad.js'
export { Pointer } from './pointer.js'
export type { PointerCamera, PointerDeps, PointerPick, PointerResolution } from './pointer.js'
export {
  RUNTIME_BRIDGE_CAPABILITIES,
  RUNTIME_BRIDGE_PROTOCOL_VERSION,
  RUNTIME_BRIDGE_SYMBOL,
  RuntimeBridgeOperationError,
} from './runtime-bridge.js'
export type {
  RuntimeBridge,
  RuntimeBridgeActivation,
  RuntimeBridgeFailure,
  RuntimeControlRequest,
  RuntimeControlResult,
  RuntimeMetadata,
  RuntimeMode,
} from './runtime-bridge.js'
export type { RenderBackend } from './render-readiness.js'
export { RUNTIME_PROJECTION_LIMITS } from './runtime-inspection.js'
export type {
  RuntimeSnapshotLight,
  RuntimeSnapshotLighting,
  RuntimeSnapshotPointLight,
  RuntimeSnapshotSun,
  RuntimeSnapshotPost,
} from './runtime-lighting-snapshot.js'
export type {
  ProjectedValue,
  ProjectionIssue,
  ProjectionMarker,
  ProjectionMarkerKind,
  RuntimeComponentSnapshot,
  RuntimeEntitySnapshot,
  RuntimeSnapshot,
  RuntimeSnapshotAudio,
  RuntimeSnapshotCamera,
  RuntimeSnapshotFilters,
  RuntimeSnapshotTime,
  RuntimeSnapshotUi,
  RuntimeTransformSnapshot,
} from './runtime-inspection.js'
export type {
  ArchetypeArt,
  ArchetypeManifest,
  BrowserArchetypeManifest,
  EntityTemplate,
} from './archetype.js'
export { Stats } from './stats.js'
export type { StatValue } from './stats.js'
export { GameUi } from './ui.js'
export type { AnchoredPieceHandle, AttachOptions } from './anchored-pieces.js'
export { Sprite } from './components/sprite.js'
export { Light } from './components/light.js'
export { Model } from './components/model.js'
export type { ModelShape } from './components/model.js'
export { Sun } from './components/sun.js'
export { PointLight } from './components/point-light.js'
export { GameLighting } from './scene-lighting.js'
export type { AmbientLightInput } from './scene-lighting.js'
export { GamePost } from './post-effects.js'
export { EMISSIVE_LAYER, setEmissive } from './render-layers.js'
export { lightFalloff, lightMapValue, lightVisibility } from './light-field.js'
export type { LightField, OccluderGrid, Rgb } from './light-field.js'
export { sceneRenderIssues } from './scene-render-options.js'
export type {
  AmbientLight,
  ColorGradeEffect,
  PostEffectsState,
  SceneRenderIssue,
  VignetteEffect,
} from './scene-render-options.js'
export { ParticleEmitter } from './components/particle-emitter.js'
export type {
  ParticleBlend,
  ParticleDestroyMode,
  ParticleOverflow,
  ParticleSpace,
  ParticleVector,
} from './components/particle-emitter.js'
export { Solid } from './components/solid.js'
export { Hitbox } from './components/hitbox.js'
export { DynamicBody } from './components/dynamic-body.js'
export { AnimatedSprite } from './components/animated-sprite.js'
export { Tilemap } from './components/tilemap.js'
export { aabbOverlap } from './aabb.js'
export { resolveSolidAxis } from './solid-axis.js'
export type { CollisionAxis, SolidAxisOptions } from './solid-axis.js'
export { isSolidSource, sceneSolids, SOLID_SOURCE_SYMBOL } from './scene-solids.js'
export type { SolidSource } from './scene-solids.js'
export { cellAt, cellBounds, cellIndex } from './tilemap-grid.js'
export type {
  TilemapCell,
  TilemapCellBounds,
  TilemapGridSpec,
} from './tilemap-grid.js'
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
export type {
  EntityWith,
  NearestQueryContext,
  NearestSpatialQueryFilter,
  RayHit,
  SpatialQuery,
  SpatialQueryFilter,
} from './spatial-query.js'
export { Emitter } from './events.js'
export { loadScene, spawnFromJson, resolveEntityComponents, resolveProps } from './scene.js'
export type {
  SceneJson,
  SceneEntityJson,
  SceneComponentJson,
  SceneRegistry,
  SceneRenderJson,
  SceneLightingJson,
  ScenePostJson,
  PrefabJson,
} from './scene.js'
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
// It is the WebGPU build the engine draws with (ADR 0025): no classic WebGL renderer,
// and node materials (TSL) instead of GLSL shaders.
export * as THREE from 'three/webgpu'
