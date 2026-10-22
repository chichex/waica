# `@waica/engine`

Waica's public engine core: entities and components, the game loop, scene and prefab loading, state machines, input, collisions, sprites, camera, stats, and UI.

```ts
import { Component, Game, loadScene } from '@waica/engine'
```

## Migrating to 0.24.0: WebGPURenderer and `game.ready()`

A `Game` draws through three's `WebGPURenderer` (ADR 0025): WebGPU when the browser offers it, otherwise the renderer's own WebGL2 fallback. The browser decides — there is no option to force either one — and `game.backend` reports which one it got (`'webgpu'` or `'webgl2'`; `null` until the renderer is ready).

- **Await `game.ready()` before the first frame.** `new Game(...)` stays synchronous, but the renderer initializes asynchronously. Frames before it finishes still simulate (steps, `onUpdate`) but draw nothing, so a host waits for it before `game.start()`:

  ```ts
  const game = new Game({ canvas })
  loadScene(game, scene, registry)
  await game.assets.ready()
  await game.ready()
  game.start()
  ```

  Every call returns the same promise. It rejects with an error naming both `webgpu` and `webgl2` when neither initializes; nothing is ever drawn then. A `Game` disposed while `ready()` is pending never starts, and its renderer is released once initialization settles.
- **`THREE` is the `three/webgpu` build.** `import { THREE } from '@waica/engine'` now re-exports `three/webgpu`, the same copy of three the engine draws with: `THREE.WebGPURenderer` exists and `THREE.WebGLRenderer` does not. Custom GLSL does not render under `WebGPURenderer` — `ShaderMaterial`, `RawShaderMaterial` and `material.onBeforeCompile` are not supported there — so write custom shading as node materials with TSL (`three/tsl`). Built-in materials such as `MeshBasicMaterial` keep working unchanged.
- **Tests under happy-dom.** happy-dom has no GPU: a project test that builds a `Game` replaces `WebGPURenderer` from `three/webgpu` with a fake (it previously replaced `WebGLRenderer` from `three`), whose `init()` resolves.
- **Run Sessions.** A Run Session waits for the Render Backend before it reports ready, steps or screenshots, and its snapshots carry `backend`. A renderer that cannot initialize ends `start_project` with a runtime error that names the failure.

## Migrating to 0.31.0: animation blending

The `Animator` mixes its clips (issue #205, ADR 0033). Every scene file loads as it did, the Clip Target contract and the `StateMachine` are unchanged, and a single clip played from the start poses exactly as before; what changes:

- **Fades leave from the current weight.** The Animator schedules its own fades instead of three's `crossFadeTo`: a fade moves the entering clip from its current weight to 1 and every other sounding clip from its current weight to 0. A fade interrupted by another `play` no longer jumps the leaving clip back to full weight, so a pose in the middle of an interrupted fade differs from 0.30; a project test that pinned such a pose re-pins it.
- **A clip asked for again continues.** `play(name)` on a clip that is still fading out continues from its time and rises from its weight instead of restarting at 0; a silent clip and a finished one-shot still restart.
- **`clips.<name>.fade`** (new) is the fade into that clip in seconds, in place of `fade`; `0` cuts into it.
- **`blends`** (new) are 1D blends, virtual clips mixing the file's clips by a named parameter: `{ <Name>: { param, points: [{ clip, at }], smoothing } }`. A state plays one with `clip: "<Name>"`. `setParam(name, value)` (new) aims the parameter.
- **The Runtime Snapshot's Animator** adds `weights` (each glb clip's effective weight above 0) and `params` (the smoothed values); with a blend playing, `current` is the blend's name and `time` its phase in seconds.
- **`authoringDefaults`** of the `Animator` gains `blends: {}`, so a test pinning its defaults adds it.
- **`validate_project`** accepts a blend's name wherever an Animator clip name goes (`initialClip`, a `clips` key, a state's `clip`), warns `clip-end-on-looping-clip` for a state leaving a blend on `clip:end`, extends `missing-clip` to blend points, and adds the errors `invalid-clip-fade`, `invalid-blend`, `blend-name-collides-with-clip` and `blend-thresholds-not-increasing` and the warning `blend-point-one-shot`.

## Migrating to 0.29.1: checkpoint banners on the walls

A fix release for the third-person demo, whose checkpoint banners stood free in the yard: KayKit's banner is single-sided and modelled to hang on a wall, so it floated and vanished from behind. Every existing scene file loads as it did; what changes:

- **`Checkpoint.spawnOffset`** (new, a `vector3`, default `[0, 0, 0]`: unchanged) moves where the player respawns from the checkpoint's position. In a 3D scene it is in the entity's local frame, turned and scaled with it like a `Collider`'s `offset`; in 2D it is in world units, like a `Hitbox`'s or a `Solid`'s offset, whatever the node's scale or rotation. `validate_project` reports a `spawnOffset` that is not three finite numbers as `invalid-checkpoint-param`.
- **`@waica/archetype-third-person`'s `objects/checkpoint` prefab is a wall banner.** Its origin goes 0.35 inside a wall's inner face (the cloth's back then lies flush on it), turned so its local +z faces away from the wall. Its sensor `Collider` moves to `offset: [0, 1.5, 1.35]` (same 2 × 3 × 2 size) and its `Checkpoint` gets `spawnOffset: [0, 0, 1.35]`, so the sensor starts at the wall's face and the player respawns standing on the floor 1 in front of it. A project created earlier keeps its own `src/objects/checkpoint.object.json` and behaves as before; one that takes the new prefab should hang its checkpoints on walls. The demo's checkpoints are now `Checkpoint West` at `(-9.85, 0, 4)` turned `[0, 90, 0]` and `Checkpoint East` at `(9.85, 0, 4)` turned `[0, -90, 0]`.

## Migrating to 0.29.0: third-person archetype

The release adds `@waica/archetype-third-person` (issue #181, ADR 0031) and the engine and behavior pieces it needs. Every existing scene file loads as it did; what changes:

- **`examples/smoke-3d` is gone**, and with it `pnpm dev:3d`: `pnpm dev:third-person` runs `examples/third-person`, a synced copy of the new archetype's demo (a dungeon courtyard with KayKit's CC0 Knight and Skeleton Warriors). The browser e2e's 3D legs run on that demo.
- **`MeleeAttack`, `Patrol` and `Chaser` run in both spaces** (they no longer declare `space: '2d'`). In 2D they behave exactly as before. In 3D: `MeleeAttack.strike()` takes no facing and hits every collider in a `range` × `height` × `width` box in front of the attacker's yaw, centred on the attacker's `Collider` (`height` is new, default 2) whose layer the attacker's Collider mask names, pushing each body it hurts away at `knockbackSpeed` (new, default 8) for 0.15 s; `Patrol` paces x (`horizontal`) or z (`vertical`) and `Chaser` walks straight at the player on xz, both through a kinematic `RigidBody`'s desired velocity; a `Patrol` blocked short of its rail's end turns around there. `validate_project` no longer reports them as a `component-space-mismatch` in a 3D scene, and reports one without a `Collider` and a kinematic `RigidBody` there as `mover-without-body`.
- **The perspective camera may `follow` an entity**: the block's orbit fields (`distance`, `minDistance`, `maxDistance`, `yaw`, `pitch`, `minPitch`, `maxPitch`, `lookHeight`, `sensitivity`, `orbitSpeed`, `invertY` and the four `orbit…Action` names) make it the Orbit Camera. A block that named `follow` was an error; it is now accepted, and `validate_project` reports an unknown target, inverted ranges and a pitch outside (-89, 89), and warns about an initial `distance` or `pitch` outside its range (the camera clamps it).
- **`Mouse:Left` and `Mouse:Right` bind Actions** beside keys and `Gamepad:` codes; an unknown `Mouse:` code is warned once. Touch and pen pointers never press them. `game.input.mouseMovement()` and `game.input.wheelDelta()` report the step's locked movement and wheel; the wheel's page scroll is prevented only over the canvas of a scene whose orbit camera plays (the `preventsWheelScroll` Input option), so other games keep the page scrolling as before. `requestPointerLock()` and `pointerLocked` reach the Pointer Lock API; a click that asks for a lock the browser refuses reaches its Action as any click. The Runtime Bridge and `control_runtime` gain `look { dx, dy }` (capability `'look'`).
- **`--waica-unit` is per Anchored Piece in a perspective scene**: each piece's host carries the unit at its own anchor's depth (a piece twice as far is half as wide), over the layer's unit at the world origin. Orthographic scenes are unchanged.
- **Camera shake moves a perspective camera** along its right and up axes, scaled so the image moves as far as the same shake in 2D; the Runtime Snapshot reports the shake offset in a 3D scene too (it reported zero).
- **`CharacterMotor`** gains `relativeTo` (`'world'` by default: unchanged), `runAction`/`runSpeed`, `dodgeAction`/`dodgeSpeed`/`dodgeDuration`/`dodgeCooldown`, `attackAction` and `halt()`, and a knockback that reaches it mid-roll is ignored; the `character` role gains `run`, `attack`, `roll` and `die`, entered only when those Actions are bound (and, for `attack`, beside a `MeleeAttack`; for `die`, on a Health death). `Health.guard(seconds)` opens an invulnerability window without the blink. `Respawnable.setSpawn(point)` moves its respawn point, and `respawn()` halts a `CharacterMotor` too. New: `Checkpoint`, the `enemy` role (`ENEMY_ROLE`), `knockBackFrom`, `drive3d`, `isPlayer`.
- **The Runtime Snapshot shows a 3D hit's push and the death sequence**: a `Health`'s state adds `knockback: { x, z, until }` while a push is pending (absent otherwise, so 2D snapshots read as before), and a `Respawnable` beside the `character` role reports `respawnPhase` (`'pose'`, `'fade-out'` or `null`) and `fadeOutSince`.
- **`game.query.area` in 3D** takes `colliders: 'all'` (solid colliders too; sensors only by default) and a box `yaw` in degrees. `Animator.clipProgress` reports how far the playing clip is.

## Migrating to 0.28.0: 3D editor

The editor edits 3D scenes (issue #173, ADR 0030). Scene files and game code are untouched; three engine seams become public, all additive:

- **`raycastPick(camera, at, entities, extra?)`** is exported with its types (`PickTarget`, `PickedTarget`, `RaycastPick`, `ViewportFraction`). It is the raycast the Pointer uses in a 3D scene: every live Model root and the optional `extra` targets (`{ object, entity }`, where `entity` is an `Entity` or `'camera'`, tested whatever their layers), nearest hit first, with the ground plane y = 0 as the fallback point. `Pointer` behaves as before.
- **`glbClipNames(bytes)`** returns a glb's animation clip names in file order (an unnamed clip is `animation_<index>`, as three names it), `[]` with none, and `null` for bytes that are not a glb or a JSON chunk that does not parse. It reads only the header and the JSON chunk, with no Node or DOM API beyond `TextDecoder`.
- **`CameraRig.setViewCamera(camera | null)` and `CameraRig.sceneCamera`.** A host can draw a 3D scene through a camera of its own: while one is set, `game.camera` returns it, so the frame, the Pointer and `game.worldToScreen` follow it; `sceneCamera` keeps returning the camera the scene JSON places, and `setSceneCamera` keeps updating it. A 2D scene ignores the call with one warning. A game never sets one; the editor sets it only in edit mode, where its Game does not simulate.

## Migrating to 0.27.0: 3D animation

A glTF's clips play (issue #166, ADR 0029): a `Model` keeps its `handle`, an `Animator` beside it plays the clips, a `StateMachine` drives either kind of Clip Target through one seam, and a 3D character turns to face its walk. Every 2D scene file loads as it did; the seam is additive, one type changes (`TriggerEnv.clipFinished`) and two behaviours change (`play` restarts a finished clip, a `CharacterMotor` turns by default):

- **The state machine plays through the Clip Target.** `StateMachine` no longer names `AnimatedSprite`: it plays each state's clip through the first sibling that satisfies `isClipTarget` (`{ current, clipNames, clipFinished, clipsPending?, play(name), setFlipX? }`), which is the `AnimatedSprite` in a 2D scene and the `Animator` in a 3D one. A project component that plays clips can be that target by exposing the same members. A target whose clips are pending (`clipsPending`: an Animator whose glb is still loading) is asked anyway and remembers the request; a sprite with no clips is not pending and still warns about its states. A mirrored directional clip on a target without `setFlipX` plays unmirrored and warns once per state.
- **`TriggerEnv.clipFinished`.** Code that builds a `TriggerEnv` for `evaluateTrigger` or `nextTransition` (tests of role graphs, mostly) adds `clipFinished: false`; the new `clip:end` trigger reads it.
- **`play(current)` restarts a finished clip.** `AnimatedSprite.play(name)` is still a no-op for the clip that is running, but once a `loop: false` clip has ended, playing it again restarts it from frame 0 (and clears `clipFinished`). A project that re-entered a state to keep holding a one-shot's last frame now sees the clip replay; keep the entity in its state instead.
- **A `CharacterMotor` turns by default.** `turnSpeed` (degrees per second, default 540) turns the entity's yaw toward where it walks; set `turnSpeed: 0` to snap, and keep the yaw out of your own code's hands or they will fight. The kinematic body is unaffected.

## Migrating to 0.26.0: 3D scenes

A scene can declare a 3D space (issue #154, ADR 0027). Nothing about a 2D scene changes — every existing scene file loads as it did — but a few types and one build setting do:

- **`game.camera` is a union.** It is `THREE.OrthographicCamera | THREE.PerspectiveCamera`: the orthographic one in every 2D scene, a perspective one in a 3D scene. Code that read `game.camera.left/right/top/bottom` narrows first (`camera instanceof THREE.OrthographicCamera`, or `isPerspectiveCamera(camera)`), or goes through `game.worldToScreen(point)`. `game.view` and `setViewHeight()` are the orthographic zoom: under a perspective camera they change nothing.
- **`SceneCameraJson` is a union.** The existing block (optionally `kind: 'orthographic'`) or `{ kind: 'perspective', position?, target?, fov?, near?, far? }`. `resolveSceneCamera` keeps returning the orthographic block with no `kind`; a perspective block gets its own defaults. A scene's camera must match its space (`validate_project` reports a mismatch).
- **Scene entities take 3-number positions.** `position` is `[x, y]` (z = 0, as before) or `[x, y, z]`, and an entity may declare `rotation: [x, y, z]` in degrees (Euler order XYZ) and `scale: [x, y, z]`. In a 2D scene `z` is still only draw order.
- **`ArchetypeArt.kind` and the editor's art `kind` gain `'model'`** (`.glb` and `.gltf`), and `ParamSpec.kind` gains `'model'` and `'vector3'`. Code that switches over these kinds handles the new member.
- **Components declare their space on the class (issue #159).** `Component` has an optional `static space: 'both' | '2d' | '3d'`, and `TWO_D_COMPONENTS` and `THREE_D_COMPONENTS` are no longer exported: `componentSpaceOf(Class)` and `componentSpaceMismatch(space, Class)` read the marker. The behaviors of `@waica/behaviors` that read or move x/y as the orthographic plane, or need a 2D sibling to work (the motors, `Chaser`, `Hazard`, `MeleeAttack`, `Interactable`, `Patrol`, `ClickToMove`, and the particle cues `DamagePuff`, `DustPuffs`, `DustTrail` and `SwingSparks`, which need a `ParticleEmitter`) are tagged `'2d'`, so a project that put one in a 3D scene now gets `component-space-mismatch` from `validate_project` where it used to validate clean. A project-owned component opts in with its own `static space`. 3D scenes also simulate (ADR 0028): the engine and the CLI depend on `@dimforge/rapier3d-deterministic-compat`, loaded only by a 3D scene, and a project's bundle gets one extra async chunk for it. `game.query`'s 2D forms throw in a 3D scene.
- **`Pointer.injectClick(x, y)` may return `null`.** In a 3D scene `x` and `y` are canvas pixels and a ray that meets neither a model nor the ground yields no pick; in a 2D scene it still always returns one.
- **One three.** `GLTFLoader` and `SkeletonUtils` import the bare `'three'`, the engine draws with `'three/webgpu'`. Every bundler of a project that uses `Model` (or any three addon) aliases the bare specifier to the WebGPU build, and only it:

  ```ts
  // vite.config.ts
  export default defineConfig({
    resolve: { alias: [{ find: /^three$/, replacement: 'three/webgpu' }] },
  })
  ```

  `three/webgpu`, `three/tsl` and `three/addons/*` are left alone. Projects created by `create_project` after this release carry the alias; an earlier project adds it by hand. The same alias goes in a project's Vitest config if its tests import plain `'three'`.

## Hitbox Collision Layers and Masks

Every `Hitbox` belongs to one named Collision Layer and declares the other layers in which it is interested through a Collision Mask:

```ts
import { Hitbox } from '@waica/engine'

entity.add(Hitbox, {
  layer: 'projectile',
  collidesWith: ['enemy'],
})
```

A layer must match `^[a-z][a-z0-9-]*$`. Layer names form an open, project-owned vocabulary; matching is exact and case-sensitive. `"*"` is valid only in a mask and matches every valid layer. An empty mask means no outgoing interest. Invalid layers cannot be targeted, and invalid or non-string mask entries are ignored without runtime coercion or warnings.

A pair reaches exact overlap testing when either side's mask names the other side's layer. After an overlap, only an interested side receives `onCollide`; a one-way projectile mask therefore does not notify its target. Omitted fields retain the compatibility defaults `layer: 'default'` and `collidesWith: ['*']`, so two unconfigured Hitboxes still notify both sides.

Layers and masks are read while the collision-pair snapshot is consumed. A component can change them during `onUpdate` or one callback and affect later pairs in that Simulation Step. Pair order remains the original lexicographic Entity order, component callbacks remain in insertion order, and destroyed entities are still skipped between sides.

### Shipped taxonomy and migration

Waica's shipped prefabs use this directional policy:

| Hitbox owner | `layer` | `collidesWith` |
| --- | --- | --- |
| Player | `player` | `['*']` |
| Slime, blob, or orc / `Hazard` | `enemy` | `['player']` |
| Coin, potion, or crate / `Collectible` | `collectible` | `['player']` |
| Overlap `SceneTransition` | `scene-transition` | `['player']` |
| Platformer projectile | `projectile` | `['enemy']` |

`Collectible`, `Hazard`, overlap `SceneTransition`, and the example projectile trust those masks and no longer recheck the other Entity's role inside `onCollide`. Existing external projects using any of these handlers must explicitly migrate their sibling Hitboxes before relying on the new behavior. The defaults preserve engine-level callback delivery, but a wildcard-backed migrated handler can act on unintended default-layer entities.

1. Assign `player` / `['*']` to player Hitboxes.
2. Assign the relevant row above to each shipped handler carrier, or choose equivalent project-owned names.
3. Run MCP `validate_project`; malformed values are errors and duplicate mask entries are warnings.
4. Keep `trigger: 'interact'` Scene Transitions unchanged—their Hitbox mask is relevant only to overlap mode.

The editor and MCP author explicit categories for newly generated player/enemy identities. NPCs, custom or identity-less characters, generic objects, and existing external project files are not inferred or rewritten. `public/waica.params.json` may override either field with the same exact values, including a `string[]` mask.

## Collision broadphase

The Game uses fresh internal uniform grids to accelerate automatic Hitbox dispatch, Hitbox-backed `area`/`point` queries, and Solid-backed `ray` queries. Hitboxes and Solids stay in separate domains. `nearest`, `DynamicBody` physical-contact solving, Pointer picking, navigation, and unrelated scans remain linear or otherwise unchanged.

The grid changes candidate discovery only: existing exact geometry is still authoritative. Each operation observes candidates alive at its start, preserves Entity or Solid source order and tie behavior, and recomputes after scene swaps, spawns, movement, shape edits, or Tilemap-derived Solid changes. Oversized bodies and query regions fall back conservatively, so they may cost more but cannot lose results. Grid sizing, occupancy limits, indices, and rebuild controls are deliberately package-internal and have no public tuning API.

## Logical spatial queries

Every `Game` owns one stable `game.query` service. Queries use logical XY coordinates, including in isometric scenes, and return typed live engine objects:

```ts
import { Component, type CollisionBody, type Entity, type Game } from '@waica/engine'

declare const game: Game
declare const player: Entity

class Faction extends Component {
  name = 'neutral'
}

const search: CollisionBody = { x: 0, y: 0, width: 8, height: 6 }
const nearby = game.query.area(search, {
  with: [Faction] as const,
  exclude: player,
  where: (entity) => entity.get(Faction).name !== 'friendly',
})

// `with` makes this non-optional at compile time.
nearby[0]?.get(Faction).name
```

| Method | Spatial domain | Result |
| --- | --- | --- |
| `area(body, filter?)` | Hitbox collision outlines | All overlapping Hitbox owners |
| `point(x, y, filter?)` | Hitbox collision outlines | All strict point containers |
| `nearest(x, y, filter?)` | Entity logical transforms | The nearest Entity or `null` |
| `ray(x, y, dx, dy, maxDistance, filter?)` | Direct and source-derived Solids | The first `RayHit` or `null` |
| `Pointer` picking | Sprite visuals in projected/render space | The front-most visual owner |

Every filter can require all classes in `with`, reject any class in `without`, exclude one Entity, a readonly Entity array, or a `ReadonlySet` by identity, and apply a final `where` predicate. `nearest` also accepts inclusive `maxDistance` and passes `{ distance }` to `where`. Filters compose conjunctively. Ray filters apply to each Solid's owner; for example, a generated Tilemap Solid can match `with: [Tilemap]`, but only an owner with a direct Solid matches `with: [Solid]`.

Calls eagerly snapshot candidates that are alive at call start. Results preserve scene/source order, and ties keep the first candidate. Later spawns do not enter a result and later destruction does not remove it. Returned Entity, Component, and Solid references remain live; a `RayHit`'s distance, point, and normal are detached query-time values.

Invalid inputs fail closed without throwing: invalid `area` bodies and non-finite point coordinates return `[]`; invalid nearest coordinates or radii return `null`; and ray returns `null` for non-finite values, a zero direction, or a negative distance. Nearest permits positive `Infinity`; ray distance must be finite and may be zero. Zero-area candidate geometry never matches.

Area and point intentionally use the collision system's polygonally approximated circle/ellipse outline. Ray queries intersect circle-shaped Solids as analytic ellipses and return their exact outward unit normal. Collision Layers and Masks never filter `area` or `point`; use a query filter when category-like eligibility is needed.

## CPU particle emitters

`ParticleEmitter` is the authorable 2D particle component. It simulates a fixed-capacity CPU batch in fixed-step time and renders the whole effect with one mesh, one geometry, and one material. Its complete authoring surface and defaults are:

| Props | Defaults |
| --- | --- |
| continuous | `rate: 0`, `emitting: true` |
| lifetime and spawn | `lifetime: 1`, `positionSpread: [0, 0]` |
| motion | `velocity: [0, 0]`, `velocitySpread: [0, 0]`, `gravity: [0, 0]` |
| coordinates and random stream | `space: 'world'`, `seed: 1` |
| storage | `capacity: 256`, `overflow: 'recycle-oldest'` |
| ownership | `destroyMode: 'clear'` |
| quad | `width: 1`, `height: 1`, `startScale: 1`, `endScale: 1` |
| tint | `startColor: 0xffffff`, `endColor: 0xffffff`, `startAlpha: 1`, `endAlpha: 0` |
| material | `texture: ''`, `pixelArt: false`, `blend: 'normal'` |
| draw band | `layer: 0` |

```ts
import { ParticleEmitter } from '@waica/engine'

const smoke = entity.add(ParticleEmitter, {
  rate: 12,
  lifetime: 0.8,
  positionSpread: [0.4, 0.1],
  velocity: [0, 2],
  velocitySpread: [0.5, 0.5],
  gravity: [0, -3],
  startColor: 0xffffff,
  endColor: 0x777777,
  startAlpha: 0.8,
  endAlpha: 0,
  texture: 'art/smoke.png',
  blend: 'additive',
  capacity: 256,
})
smoke.emit(20) // deterministic burst; returns the accepted count
```

A seeded Mulberry32 stream makes equivalent runs deterministic; `emit(count)` uses the same stream as continuous `rate` emission. `overflow: 'recycle-oldest'` (the default) replaces the oldest live particles at capacity, while `'drop-new'` rejects new ones without sampling. Resizing `capacity` clears the batch but does not reset the stream; changing `seed` or remounting does.

`space: 'world'` snapshots the entity's logical origin at spawn, while `'local'` keeps live particles attached to it. Logical simulation is projection-independent: orthographic and isometric scenes only change render projection. In `sort: 'y'` scenes every live particle contributes its own global depth entry alongside Sprites, AnimatedSprites, and draining batches; equal-Y ties preserve spawn order.

Textures use the Game's shared `AssetLoader`; `pixelArt` chooses nearest or linear filtering, and `blend` selects normal or additive blending. All three are reactive authoring props. A failed or empty texture falls back to the flat colored quad. Batching keeps one draw submission but does not promise order-independent or globally exact alpha composition between meshes. `destroyMode: 'clear'` removes the batch with its owner; `'drain'` transfers it to scene scope, stops emission, and simulates it until empty. Scene unload and `game.dispose()` always clear drains.

The three stock archetypes ship authored effects built on this component. In each case the emitter holds the look, and a small cue component from `@waica/behaviors` decides when it emits:

| Cue | What it does | Archetype |
| --- | --- | --- |
| `SwingSparks` | Bursts `count` particles when the sibling `StateMachine` enters `state`. | isometric (player sword sparks) |
| `DamagePuff` | Moves its entity to whatever `Health` reports on the `damage` event and bursts there. | isometric (`objects/hurt-smoke`) |
| `DustPuffs` | Puffs on a ground takeoff into `jump` and bursts on any grounded exit from `jump` or `fall`. | platformer (player dust) |
| `DustTrail` | Turns `emitting` on only while the machine is in `state`. | topdown (player walking dust) |

The cues that hook a `StateMachine` must come after it and after the `ParticleEmitter` in the component list. The isometric demo also places plain emitter objects: `objects/wind` in the meadow and `objects/cave-dust` in the cave.

`active`, `capacity`, and `emitting` are the only fields exposed by Runtime Snapshot. Particle arrays remain private. This first CPU implementation is intended for bounded 2D effects, not collision, per-particle scripting, GPU simulation, trails, rotation, or sub-emitters.

## Sprite Batches

`Sprite` and `AnimatedSprite` are drawn through **Sprite Batches** by default (ADR 0024). Every frame, after y-sort, the engine orders everything it draws exactly as three would without batching — layer bands, then y-sort, then spawn order, with particle batches, tilemaps and any other mesh in between — and each run of consecutive sprites that share a batch key becomes one instanced draw call. The key is the art and how it is sampled: the texture (an `AnimatedSprite`'s current sheet), `pixelArt` and `shape`. Each sprite is one instance carrying its own placement, color, frame and flip, so tinting, resizing, re-anchoring or animating a sprite never creates a material, and what is drawn in front of what never changes.

- **On by default.** A scene without a `render` block, or with `render.batch: true`, batches. Nothing to configure: sprites of one texture in a row draw in one call, a sprite of other art (or a particle batch, a tilemap) in between starts a new run.
- **Culling and Group order kept.** A sprite outside the camera is skipped for the frame, as three culls a sprite's own mesh, and an off-camera renderable never splits a run. A run hangs under a Group with its sprites' Group `renderOrder`, so `entity.node.renderOrder` orders batched sprites exactly as it orders their meshes without batching.
- **Shared art.** All live sprites of one key share one material and one texture clone, scene-scoped: released with the scene at `unloadScene()` and `game.dispose()`. A sprite whose texture fails moves alone to the untextured entry of its shape and keeps showing its `color`.
- **Reusable slots and buffers.** A destroyed sprite's slot goes to the next spawn of its key. Each run draws through a pooled instance buffer sized by that run: 16 instances at first, doubling when a longer run needs it, never shrinking during the scene. A key drawn as several runs keeps one buffer per run, so instance memory stays proportional to the sprites drawn. Once the buffers have grown to a scene's longest runs (and as many runs as it ever splits into), spawning, destroying and reordering sprites allocates no GPU objects.
- **Turning it off.** Scene JSON `"render": { "batch": false }` (the editor's **Sprite batching** toggle in the scene inspector) restores the per-sprite path: one mesh, one material and one draw call per sprite. Use it to rule batching out when a scene looks different than you expect, or while debugging draw order; the cost is one draw call per sprite, which is what dominates frame time with thousands of sprites.

Under batching, the object a sprite adds to its entity is a hidden placement anchor that is never drawn. Hide or show a batched sprite through its entity (`entity.node.visible`, as `Health` blinking does); the anchor's own `visible` is not read for the batched draw, and setting it to true makes three also draw the anchor as a plain quad (without the sprite's tint or frame) — leave it alone, or use `render.batch: false` when code needs one real mesh per sprite.

How much batching saves depends on how interleaved a scene is: one texture over the whole scene draws in one call, while a top-down scene that alternates many textures by y gains little. Runtime Snapshots are unchanged — batches are not entities, and sprites report the same state either way.

## Lighting and Post Effects

A scene can be lit (issue #78, ADR 0026). Without lighting and without a Post Effect a scene is drawn exactly as before: one render straight into the canvas, no render target.

```json
"render": {
  "lighting": { "ambient": { "color": "#5a6a9a", "intensity": 0.3 } },
  "post": {
    "vignette": { "intensity": 0.45, "radius": 0.35 },
    "colorGrade": { "tint": "#ffeedd", "contrast": 1.1, "saturation": 0.9 }
  }
}
```

- **Ambient Light.** `render.lighting.ambient` is where no light reaches: `color` (`#rrggbb`, default `#ffffff`) times `intensity` (0..1, default 1). `game.lighting.ambient` reads it and sets it at runtime, field by field (`game.lighting.ambient = { intensity: 0.2 }`), so a day/night cycle is a `game.time.tween` whose `onUpdate` sets it. Setting it lights a scene that declared none. It dies with its scene: a scene load or swap takes the next scene's value.
- **Light.** A component: `radius` (logical units), `color`, `intensity` (≥ 0), `bands` (0 smooth, up to 16 equal steps), `softness` (0 hard shadow edge, up to 1), `castShadows` (default true) and `offsetX`/`offsetY` from its entity. Its falloff is `1 − smoothstep(d / radius)`, measured in logical space, so on an isometric screen it is a 2:1 ellipse. Lights add to the Ambient Light and never darken; the sum clamps at 1. A scene with a live Light is lit even without `render.lighting`, but under full Ambient Light (`#ffffff`, 1) a light changes no pixel, so such a frame skips the light-map altogether. `game.lighting.lights` lists them.
- **Occlusion.** Only Tilemap `solidTiles` stop light: a point whose line to the light crosses a solid tile other than its own is in shadow, while the solid tile itself keeps the light that reaches it (its lit face). Every Tilemap of the scene contributes; the grid is rebuilt only when a Tilemap spawns, is destroyed or changes its tiles. Props with a `Solid` and moving entities cast no shadow.
- **Emissive.** `Sprite`, `AnimatedSprite` and `ParticleEmitter` take `emissive: true`: drawn after the light-map at full brightness (a flame, sparks), still in their own order and Sprite Batch runs. Every drawable discards its fully transparent texels, so an Emissive drawable behind a lit sprite shows through that sprite's transparent texels and stays hidden behind its opaque ones. Engine-wise they sit on `EMISSIVE_LAYER`; `setEmissive(object, true)` puts any three.js object there.
- **How a lit frame is drawn.** The scene without its Emissive drawables goes straight to the canvas as always; then a light-map — an 8-bit target the size of the fixed `resolution` (nearest upscale), or of the drawing buffer without one — cleared to the Ambient Light and lit by one quad per Light is multiplied over it; then the Emissive drawables. The multiply works on the canvas's sRGB values, so Ambient Light 1 with no light leaves the frame identical.
- **Post Effects.** `render.post.vignette` (`intensity` and `radius`, 0..1) darkens towards the corners; `render.post.colorGrade` (`tint`, `contrast` and `saturation` 0..2, 1 = unchanged) grades the frame. With either on, the frame (lighting and Emissive drawables included) renders into an 8-bit target at the light-map's size, drawn exactly as onto the canvas (sRGB-encoded, blending on sRGB values, so no sprite edge changes), and one full-screen pass grades it and writes it to the canvas. `game.post.vignette` and `game.post.colorGrade` read and set them field by field over the current values, like the ambient (null turns one off); they die with their scene. Camera Effects stay above and are never altered.
- **Validation and snapshots.** `validate_project` reports an out-of-range render field as `invalid-scene-render` and a Light param outside its range as `invalid-light-param`, naming it; at runtime out-of-range values are clamped. Every Runtime Snapshot carries `lighting: { ambient, lights: [{ entity, id, x, y, radius, color, intensity, bands, softness, castShadows }] }` in logical coordinates and `post: { vignette, colorGrade }` (null when off).

The CPU reference of a light-map texel — `lightFalloff`, `lightVisibility`, `lightMapValue` — is exported for tools and tests; the shader follows it.

## 3D scenes

A scene declares its space (ADR 0027): `render.space: '2d'` (the default) or `'3d'`. `game.space` reports the live scene's, `'2d'` with no scene. In a 3D scene `z` is a world axis (Y is up, the ground is the XZ plane, the default camera looks down −Z), the frame is drawn straight to the canvas with a depth buffer deciding what is in front, and there is no layer band, y-sort, isometric projection, Sprite Batch or light-map. `render.post` still works. `validate_project` rejects `render.sort`, `render.projection` and `render.batch` in a 3D scene, a 2D component on a 3D scene's entities and a 3D component in a 2D scene (`component-space-mismatch`). A component declares its space on its class, `static space = '2d' | '3d' | 'both'` (absent means both): `Sprite`, `AnimatedSprite`, `Tilemap`, `Solid`, `DynamicBody`, `Hitbox`, `Light`, `ParticleEmitter` and the behaviors of `@waica/behaviors` that read or move x/y as the orthographic plane or need a 2D sibling (the 2D motors, `Hazard`, `Interactable`, `ClickToMove`, and the particle cues `DamagePuff`, `DustPuffs`, `DustTrail`, `SwingSparks`) are `'2d'`; `Model`, `Sun`, `PointLight`, `Collider`, `RigidBody` and `CharacterMotor` are `'3d'`; `StateMachine`, the behaviors that only react to an overlap or read y as up, and a project-owned component without a marker are allowed in both (a project-owned component says otherwise with its own `static space`).

```json
{
  "waicaScene": 3,
  "render": { "space": "3d", "lighting": { "ambient": { "color": "#b8c8ff", "intensity": 0.6 } } },
  "camera": { "kind": "perspective", "position": [0, 5.5, 11], "target": [0, 0.8, 0], "fov": 50 },
  "entities": [
    { "name": "Ground", "scale": [24, 1, 24], "components": [{ "type": "Model", "props": { "shape": "plane", "color": 5081930 } }] },
    { "name": "Tree", "position": [4, 0, -1], "components": [{ "type": "Model", "props": { "src": "src/art/tree.glb" } }] },
    { "name": "Daylight", "components": [{ "type": "Sun", "props": { "direction": [-0.5, -1, -0.35], "intensity": 3 } }] },
    { "name": "Lamp", "position": [2.5, 0, 3.5], "components": [{ "type": "PointLight", "props": { "intensity": 14, "distance": 10, "offsetY": 1.2 } }] }
  ]
}
```

- **Camera.** `{ kind: 'perspective', position, target, fov, near, far }`, defaults `[0, 5, 10]`, `[0, 0, 0]`, 60, 0.1, 1000; the 2D fields other than `follow` are not accepted. A 3D scene without a camera block gets the defaults. Without `follow` the camera is fixed by the scene; game code may move `game.camera`. With `follow: '<entity>'` it is the Orbit Camera (ADR 0031): it looks at the entity plus `lookHeight` (1.2) from `distance` (6) at `yaw` (0: looking toward −z) and `pitch` (20) in degrees, turned by the step's locked mouse movement times `sensitivity` (0.2 °/px; `invertY`) and by the Actions `orbitLeftAction`, `orbitRightAction`, `orbitUpAction` and `orbitDownAction` (`look_left`… by default) at `orbitSpeed` (120 °/s), pitch clamped to `minPitch`..`maxPitch` (−10..70), the wheel moving `distance` within `minDistance`..`maxDistance` (2..12); once per Simulation Step a ray toward it keeps it 0.2 in front of fixed level geometry (never nearer than 0.5; entities with a `RigidBody` never block it) without changing the chosen distance. A click on the canvas takes the pointer lock while it plays. `game.cameraYaw` is its yaw, `null` without one. `resize()` keeps the letterbox and sets the camera's aspect from the letterboxed size. Camera Fade, Flash and Shake work in 3D.
- **Model.** Draws a glTF/glb from `src` (a `waica:` uri or a project path under `src/art/`, loaded once through `game.assets.model(uri)`) or a primitive `shape` (`'box'`, `'sphere'`, `'plane'` — the plane lies on the ground) of a `color` (`0xrrggbb`) and a uniform `size`, with a standard (lit) material. With both `src` and `shape`, `src` wins. The entity's `position`, `rotation` and `scale` place it; `color` and `size` follow the inspector live, a new `src` or `shape` rebuilds it. `handle` is the `ModelHandle` of the file it draws (null for a primitive): its clips play through an `Animator` beside it.
- **Animator.** Plays the glTF clips of the `Model` beside it (ADR 0029; mixing, ADR 0033): one `AnimationMixer` over the entity's own clone, advanced by the Simulation Step, nothing per render frame. It is the 3D Clip Target, so a `StateMachine` plays each state's clip through it and `clip:end` fires when a `loop: false` clip finishes. Params: `initialClip` (plays when the file settles, if nothing asked for a clip before it loaded — a `play` before the model loads is remembered and applied then; `clipsPending` is true meanwhile, so a `StateMachine` asks for its state's clip anyway) and `fade` (seconds of fade between clips, default 0.15; `0` cuts). The `clips` prop, authored in JSON like `AnimatedSprite.clips`, holds per-clip overrides keyed by the glTF clip name: `{ loop: false }` plays once and holds the last pose, `{ speed: 2 }` doubles the rate, and `clips.<name>.fade` is the fade into that clip in place of `fade` (`0` cuts into it); they are read when the actions are built, as the file settles. A fade moves the entering clip from its current weight to 1 and every other sounding clip from its current weight to 0, so an interrupted fade never jumps, and a clip asked for again while it still carries weight continues from its time (a silent one or a finished one-shot restarts). The `blends` prop holds 1D blends, `{ <Name>: { param, points: [{ clip, at }], smoothing } }`: each is a virtual clip that `play` and a state's `clip` accept (its name joins `clipNames` and it never finishes), mixing the two points around the value of its parameter linearly, every clip on one shared phase; `setParam(name, value)` aims a parameter (0 until written, kept when set before the file loads, smoothed over the blend's `smoothing` seconds, default 0.15; a non-finite value is ignored). A Model rebuild (a new `src` or `shape`) is noticed on the next step: the Animator drops the mixer over the old clone, attaches to the new one and asks for the clip it was playing. Clip names match the file exactly (a state's `clip` override maps `idle` to a pack's `Idle`); an unknown name warns once, as do a blend named like a clip of the file (the clip wins) and a blend point whose clip the file lacks (it is skipped). `inspect_runtime` shows `{ loaded, current, time, playing, poseHash, weights, params }`: `weights` is each glb clip's effective weight above 0 (the clips fading out included), `params` the smoothed values, and with a blend playing `current` is its name and `time` its phase in seconds of the interpolated cycle. In a 2D scene it creates nothing and `play` is a no-op; without a `Model` file beside it it warns once at runtime and `validate_project` reports `animator-without-model` per scene entity (an instance may complete its prefab with a `Model.src` override), while `missing-clip` checks its states, `initialClip`, override keys and blend points against the glb's clips (a blend's name counts as a clip; a point naming a blend does not), `invalid-clip-fade` reports a per-clip `fade` below 0 or not a number, and `invalid-blend`, `blend-name-collides-with-clip`, `blend-thresholds-not-increasing` and the warning `blend-point-one-shot` check its blends, on the prefab and again only on an instance that changes them (`clips`, `blends`, `initialClip` or the Model's `src`).
- **Lights.** The Ambient Light of a 3D scene drives one `THREE.AmbientLight` the Game owns (`render.lighting.ambient` and `game.lighting.ambient`, full white by default). `Sun` is a directional light: `direction` `[x, y, z]` in world space (default `[-1, -2, -1]`), `color`, `intensity`. `PointLight` shines from its entity plus `offsetX/Y/Z`: `color`, `intensity`, `distance` (0 = unlimited), `decay` (default 2). Both cast scene-scoped shadows by default, create nothing in a 2D scene, follow their props live and leave with their entity. three's lights are physically based: a point light of intensity 1 is dim, so a scene tunes intensities (the third-person demo uses 2.2 for the Sun and 14 for each torch).
- **`game.worldToScreen(point)`.** `{ x, y, z? }` in logical coordinates to canvas CSS pixels inside the letterbox, or `null` when a perspective camera cannot see the point (behind its near plane). Anchored Pieces and spatial audio go through the same projection: in 3D a piece behind the camera is hidden, sounds attenuate by the 3D distance from the camera and pan by where they land on screen.
- **Picking.** A click in a 3D scene casts a ray through the letterboxed point against every live `Model` (a glTF still loading is skipped) and resolves `PointerPick` with the nearest hit's entity and its world-space point (`point.z`). With no hit the entity is `null` and the point is where the ray meets the ground plane y = 0; a ray at the sky yields no pick.
- **Assets.** `game.assets.model(uri)` returns a `ModelHandle` at once: `root` is empty until the file settles, then holds your own clone of the cached glTF (skinned meshes cloned with `SkeletonUtils.clone`), `animations` its clips, `settled` resolves `'loaded'` or `'failed'`. One backend load per URL for the Game's life; `status` counts models with textures, `preload` routes `.glb`/`.gltf` to them, `GameOptions.models` replaces the real `GLTFLoader` backend (`ModelBackend { load(url) }`) for a project's own tests. Only a `.glb`, or a `.gltf` with every buffer and image embedded as a `data:` uri, works in the editor (which serves each file from a `blob:` url) and in a built project (which hashes every art file's name): a `.gltf` that points at an external `.bin` or textures loads empty there, and `validate_project` warns (`gltf-external-resource`).
- **Simulation.** A 3D scene gets one Rapier world (ADR 0028, `@dimforge/rapier3d-deterministic-compat` 0.21.0), stepped once per Simulation Step after every component's `onUpdate`. `simulation: { gravity: [x, y, z] }` in the scene sets its gravity (default `[0, -9.81, 0]`; a `simulation` block in a 2D scene is an error, `invalid-scene-simulation`). Rapier is imported dynamically by the first 3D scene that loads, counts as a pending asset (`game.assets.ready()` and `game.ready()` of a Game with a live 3D scene wait for it, and `game.ready()` rejects naming the package if it fails), and a 2D project never loads it. Steps taken while it loads run every component update and skip only the physics. `GameOptions.physics` replaces the import for a project's own tests.
- **Collider.** `shape` (`'box'`, `'sphere'`, `'capsule'`), `size` (a box's full extents), `radius`, `height` (a capsule's end-to-end height), `offset` (in the entity's local frame), `sensor`, `layer`, `collidesWith`, `friction`, `restitution`. Alone on an entity it is a fixed wall or floor, created at the entity's position and rotation and scaled by its `scale` (box size and capsule height per axis, a sphere's radius by the largest axis, a capsule's by the larger of x and z); moving the entity later does not move it. A capsule's `height` is at least twice its radius (a shorter one would be a taller sphere). `validate_project` reports `invalid-collider-param` for an unknown shape, a non-positive dimension, a radius or height under 0.01, a capsule shorter than twice its radius, an `offset` that is not three finite numbers, a bad layer or mask and a friction or restitution outside 0 to 1; at runtime such a Collider creates no body and warns once.
- **RigidBody.** `type` (`'dynamic'` or `'kinematic'`), `mass`, `gravityScale`, `linearDamping`, `angularDamping`, `lockRotations`, `velocity` (initial). It needs a `Collider` on the same entity (`rigid-body-without-collider`). A dynamic body is Rapier's: the engine writes the entity's position and rotation from it after every step; `linearVelocity` (get and set) and `applyImpulse` are its public API (`grounded` is always false on it). A kinematic body is a character: each step it moves through Rapier's character controller by `desiredVelocity` (`{ x, z }`, set by a motor) and its own vertical velocity under gravity, climbs steps up to `stepHeight`, stands on slopes up to `maxSlope` degrees and slides down steeper ones, sticks to the ground within `snapDistance`, pushes dynamic bodies, ignores sensors, and `jump(speed)` launches it while `grounded` and reports whether it did. Setting its entity's position teleports it, with no fall speed left. `validate_project` reports a `type` outside its options, a number outside its range or a `velocity` that is not three numbers as `invalid-rigid-body-param`; at runtime such a body is not created and one warning says why. `CharacterMotor` (`@waica/behaviors`) is the stock motor: `speed`, `jumpSpeed`, `turnSpeed` and five action names, walking on the world axes (`-z` is forward, diagonals at the cardinal speed), consuming the jump press only when it jumped; `character-motor-without-body` reports one without a kinematic `RigidBody` and a `Collider`, and `invalid-character-motor-param` a param outside the range its spec declares.
- **Character.** A 3D character faces where it walks by turning, not by directional clips or flips (issue #166): each step it has a non-zero desired velocity, `CharacterMotor` turns the entity's yaw toward it through `turnYawToward(node, dirX, dirZ, turnSpeed, dt)` (`@waica/behaviors`; the target yaw is `atan2(dirX, dirZ)`, so a glTF's +z front leads; the shortest arc, at most `turnSpeed` degrees per second), and with no input, or a `speed` of 0, the yaw holds. `turnSpeed` defaults to 540 (about a third of a second for a U-turn), `0` snaps, and the kinematic body is unaffected: it keeps the rotation it spawned with, so give a turning character a `Collider` that looks the same from every side — a capsule or a sphere with no x/z `offset` — or the model and a box or offset collider disagree about where it ends. The `character` role (`CHARACTER_ROLE`, `CHARACTER_STATE_GRAPH`, `characterUpdate`) is the 3D counterpart of `player`: `idle`, `walk`, `jump` and `fall` on the signals its update emits by reading the kinematic `RigidBody` — `land` plus `move` (planar speed above 0.1 u/s) or `stop` on the ground, `rise` or `fall` in the air once it has vertical speed (air with none — the spawn, the steps while Rapier loads, the step after a teleport — reports nothing) — while the motor keeps reading the input itself; an `Animator` beside the machine plays each state's clip (a per-state `clip` maps `idle` to a pack's `Idle`). Since issue #181 the motor also walks relative to the Orbit Camera (`relativeTo: 'camera'`), runs (`runAction`, `runSpeed` on the ground) and rolls (`dodgeAction`: `dodgeDuration` seconds at `dodgeSpeed` along the input or the facing, opening a beside Health's invulnerability without the blink, then `dodgeCooldown`), and the role adds `run`, `roll`, `attack` (on an attack press beside a `MeleeAttack`, striking once at 40 % of its clip and back to `idle` on `clip:end`) and `die` (on a Health death; beside a `Respawnable`, a fade out, the respawn with full health and a fade in). A project registers it with `defineRole('character', CHARACTER_ROLE)` in `src/roles/character.ts`; `validate_project` recognizes a `@waica/behaviors` role passed by reference there, so its states report no `no-state-code`.
- **Contacts and sensors.** Components on an entity with a solid `Collider` get `onBodyContact({ entity, other, normal, point })` once per step for each entity they touch, the normal pointing from the entity to the other; kinematic bodies included, so a character hears the floor and the walls it touches. A `Collider{ sensor: true }` is the 3D `Hitbox`: it fires `onCollide(other)` every step it overlaps another collider, on each side whose `collidesWith` names the other's `layer` (ADR 0016); a solid collider is told only if it declares its own mask, and a sensor with the default mask (`['*']`) is not told about fixed solid colliders (the level's walls and floors), as a Hitbox never sees a Solid — a mask naming their layer still is.
- **Queries.** `game.query` gains 3D forms told apart by argument shape: `ray(origin, direction, maxDistance, filter?)` returns the first solid collider (`{ entity, collider, distance, point, normal }`, sensors never block it), `area({ shape: 'box', center, size, yaw? } | { shape: 'sphere', center, radius }, filter?)` and `point(at, filter?)` return the entities whose sensor colliders intersect or contain them (an `area` volume with `colliders: 'all'` reads solid colliders too, and a box turns by `yaw` degrees about +y — how a 3D `MeleeAttack` finds its targets), `nearest(at, filter?)` the closest transform with `z`. The filter object is the 2D one; its `where` runs after Rapier has answered, so it may throw or change the scene, and `area` answers `[]` for a volume that is not a finite box or sphere. A form in the other space's scene throws an error naming the space. Rapier updates what queries read inside the step, so the engine refreshes it when bodies came or went.
- **Runtime Snapshot.** `space`, `view` (`{ kind: 'orthographic', position, zoom }` or `{ kind: 'perspective', position, target, fov }`, plus `follow`, `yaw`, `pitch`, `distance` and `distanceActual` for an Orbit Camera) and, in a 3D scene, `lighting.sun[]` and `lighting.pointLights[]`, and `physics: { state: 'loading' | 'ready' | 'failed', gravity, bodies: [{ entity, id, type: 'fixed' | 'dynamic' | 'kinematic', velocity, grounded }] }` (bodies in spawn order, never filtered).
- **Editor.** A 3D scene is edited through the Editor Camera (ADR 0030): in edit mode the viewport draws, picks and projects through an editor-owned perspective camera set with `game.cameraRig.setViewCamera(camera)` (`game.camera` returns it while set; `game.cameraRig.sceneCamera` keeps the one the JSON places; `null` restores it; a 2D scene ignores it with a warning). It starts at the scene camera's pose, orbits (middle button or Alt+left), pans (right button or Shift+middle), zooms (wheel), steps with the arrows, Shift+arrows, `+` and `-` on the focused viewport, frames the selection with `F`, and is remembered per scene; Play draws through the scene camera. A click picks through `raycastPick` (Models, and the icons of Suns, PointLights, meshless entities and the scene camera); `TransformControls` move, rotate and scale the selection (W, E, R; World or Local; Ctrl snaps to per-user steps), one undo per drag; a prefab drops where the ray meets a Model or the ground; an XZ grid and the helpers (the camera's frustum, each Sun's direction, each PointLight's range, each Collider's shape) draw in edit mode only. The inspector edits X/Y/Z, rotation and scale and a perspective camera's position, target and fov, and the Animator's clip fields list the glb's clips, read by `glbClipNames(bytes)`. In a 3D archetype the editor's New prefab writes the same 3D set as `scaffold_prefab`, and the "+ behaviour…" picker offers only the components that run in the edited scene's space.

### 3D shadows and migration

**Existing 3D scenes change appearance and render cost:** shadows default on, even without `render.lighting`. 2D lighting, simulation, physics and Game Time are unchanged. To restore the previous shadow-free render:

```json
{ "render": { "space": "3d", "shadows": { "quality": "off" } } }
```

`render.shadows` accepts `quality` and `maxDistance` (world units, default 40). Missing configuration means Medium. Only soft PCF is supported through the existing Three WebGPURenderer on WebGL2/WebGPU, without a separate backend pipeline or dependency.

| Quality | Sun map | PointLight map, per face |
|---|---|---|
| `off` | no active pass/map | no active pass/map |
| `low` | 1024² | 256² |
| `medium` | 2048² | 512² |
| `high` | 4096² | 1024² |

- **Participation:** `Model.castShadows` and `Model.receiveShadows` are independent booleans, both true. They apply to primitives and all cloned glTF meshes/SkinnedMeshes, including assets settling later, without changing cached resources or restarting Animator. Each Sun/PointLight has `castShadows: true`; disabling it leaves illumination intact. Global Off always wins.
- **Overrides:** light fields `shadowMapSize`, `shadowMaxDistance`, `shadowBias`, `shadowNormalBias`, `shadowRadius` default to `null`, inheriting scene/defaults. Explicit zero is valid for bias, normal bias and radius. Defaults: bias −0.0005, normalBias 0.02, PCF radius 1. Sizes: 256/512/1024/2048/4096; ranges: distance 0.01–1000, bias −0.1–0.1, normalBias 0–1, radius 0–8. Validation reports malformed authored values even when Off. Runtime clamps finite ranges, inherits unreadable numeric overrides, and defaults unreadable booleans to true without truthy coercion. An unsupported active map raises a capacity error, never a silent downgrade; live setters retain their last valid value.
- **Two inheritance levels:** scene 2048, prefab 1024, instance 512: “Inherit scene” stores explicit `null`, resolving 2048. “Reset to the prefab's value” removes the instance override and restores 1024. Opening writes no defaults; quality/Off changes preserve overrides. Advanced controls require single selection; basic multi-selection boolean editing remains.
- **Coverage:** Sun fits the active view, including the Editor Camera, from near to `min(camera.far, shadowMaxDistance)`, with caster-depth padding and texel-stable translation, not the entity/world origin. No cascades. PointLight follows its world emission position including transformed offset. Its Euclidean shadow radius is `min(positive light.distance, shadowMaxDistance)`; unlimited lighting (`distance: 0`) still has finite shadow reach. Illumination can extend beyond that radius, including cubemap diagonals.
- **Live/inspection:** `game.shadows.quality`, `.maxDistance`, `.policy`, `.resolve(sunOrPoint)` expose effective settings. Changes apply before the next render, even paused/editing. Snapshot `lighting.shadows` and each light's `shadows` distinguish effective and requested nullable values. Selected-light helpers are read-only, under the existing toggle, never in Play/game captures.
- **Cost/lifetime:** PointLight can add six shadow views; the demo's Sun plus four torches can add 25. No automatic light cap, FPS-based degradation or universal FPS promise. Off/destruction releases obsolete targets; resize retires GPU storage through native `RenderTarget.setSize` without disposing active cached nodes. Moving camera/light or changing bias/radius does not allocate targets per frame. Real renderer counters, not scene-material counts, test retained resources.
- **Materials:** preserve Three's opaque/alphaTest behavior. Unlit materials do not visibly receive lighting/shadows merely because their flag is true. No physical transparent shadow transmission or material conversion.
- **Three compatibility:** fixed-frame 3D stepping uses a checked, isolated Three 0.186 NodeFrame boundary to update cached shadows/skeletons on manual renders without advancing native RAF twice. An incompatible clock fails explicitly. Revalidate when upgrading Three.

See [benchmark notes](../bench/README.md). WebGL2 runtime/editor captures live in `.sdd/evidence/issue-203-3d-shadows/`. WebGPU pixels/resources are not positively verified on this host. The user withdrew those two acceptance gates (CA-18/21) from issue #203's delivery on 2026-10-17; the external protocol remains optional future verification. Support and strict assertions remain. Blank frames, WebGL2 fallback and the legacy issue-151 exception are not positive evidence.

Automatic `pnpm test:e2e` still requires the legacy scenarios on both backends and the new shadow pixels on WebGL2. Run `pnpm test:e2e --webgpu-shadows` to request the unchanged strict runtime/editor shadow pixel suites on WebGPU too. A requested unsupported/blank WebGPU result still fails; no automatic retry or weaker pixel threshold is added.

## State machines

A `StateMachine` owns a character's per-frame logic: its `states` and their `transitions` are prefab data, the state code comes from the role's logic set (`defineRole`, `defineStates`), and `current` names the active state. Each transition is `{ on, to }`; a trigger is one of:

- `input:<action>` — an unconsumed press of the action this Simulation Step; the transition spends it.
- `timer:<seconds>` — the state has been active for at least that long (exact at the fixed step: `timer:0.3` is 18 steps).
- `signal:<name>` — the state code queued `fsm.signal(name)` this step or the last.
- `clip:end` — the Clip Target reports the clip the current state asked for finished (issue #166). It fires on the step after the clip's last frame has been held for its whole duration, and never for a looping clip (`validate_project` warns `clip-end-on-looping-clip`, the directional `<state>-<dir>` clips and the contract's fallbacks included). A state whose clip the target lacks keeps the previous clip playing but never reads its end as its own. Re-entering a state whose one-shot clip already ended replays it.

Entering a state plays the clip of its name (or its `clip` override) through the entity's **Clip Target**: the first sibling component that plays clips — an `AnimatedSprite` in a 2D scene, an `Animator` in a 3D one — found by `isClipTarget` (a `play` function and a `clipNames` member), not by class. The directional contract resolves `<state>-<dir>` against the target's `clipNames` and mirrors only a target that defines `setFlipX`; a mirrored clip on a target without it plays unmirrored and warns once per state. A turn that only mirrors the running clip (west playing east flipped) re-applies the mirror and leaves the clip alone — a finished one-shot keeps its last frame — while a turn onto another clip name plays it. A clip the target lacks warns once and keeps the previous one; a target whose clips are pending (an `Animator` whose glb is loading) is asked anyway and remembers the request.

## Component lifecycle

Waica keeps the lifecycle boundaries distinct:

1. `Entity.add()` mounts a component and calls its `onReady` immediately. This remains component insertion order so setup behavior does not silently move.
2. During each simulated frame, entities keep their existing entity order. When an entity's turn begins, `Game` snapshots and resolves that entity's component `onUpdate` schedule, then dispatches only that schedule.
3. Physical `onContact` hooks run from `DynamicBody` while it updates. After all entity component updates a 3D scene's physics world steps and `onBodyContact` follows, then Hitbox `onCollide` hooks run, then sensor `onCollide` hooks. Their existing component dispatch order is unchanged.
4. `Game.onUpdate` callbacks run after component updates, collisions, and camera work; input end-of-frame handling follows them.
5. `Entity.destroy()` calls `onDestroy` in component insertion order.

Only classes whose prototype chain implements `onUpdate` participate in the update schedule. Passive components remain available to their siblings but receive no update position.

## Declaring update constraints

An updateable component can declare the sibling writes it must observe with inherited static `updateAfter` metadata:

```ts
import { Component, StateMachine } from '@waica/engine'

export class DamageFlash extends Component {
  static override componentName = 'DamageFlash'
  static override updateAfter: readonly string[] = ['StateMachine']

  override onUpdate(dt: number): void {
    const state = this.entity.get(StateMachine)?.current
    // This update observes StateMachine's state for the same frame.
    void state
    void dt
  }
}
```

The relation is conditional on co-presence. `DamageFlash` does not require a `StateMachine`; when that target is registered but absent from this entity, no edge and no issue are created. A subclass inherits `updateAfter` when it declares nothing and replaces the inherited list when it declares its own list.

Constraints always win over the tie-break. Whenever several components are ready simultaneously, Waica compares their case-sensitive `componentName` values in ascending Unicode code-unit order. It never uses locale collation, prefab order, scene order, or editor card grouping. Repeated names in one `updateAfter` list describe one edge.

## Invalid schedules fail closed

Component identity must be unique within an entity, and both sides of a present constraint must implement `onUpdate`. Waica rejects duplicate component names, unknown targets, passive declarers or present passive targets, self-edges, and multi-component cycles.

At runtime an invalid entity runs no partial update schedule and does not fall back to authored order. Other entities continue updating. The engine logs one diagnostic containing the entity and causes, then logs again only if that entity's composition changes.

Tools can inspect a composition without constructing components:

```ts
import { resolveComponentUpdateSchedule, type ComponentClass } from '@waica/engine'

const registry: Record<string, ComponentClass> = { DamageFlash, StateMachine }
const result = resolveComponentUpdateSchedule(
  ['DamageFlash', 'StateMachine'],
  registry,
)

if (result.ok) {
  console.log(result.order) // ['StateMachine', 'DamageFlash']
} else {
  console.error(result.issues)
}
```

The resolver is pure. Pass the effective component-name list and the complete class registry, including project-owned classes. A valid result contains `order` and no issues; an invalid result contains typed, actionable issues and no executable order.

## Runtime inspection

The engine owns Runtime Bridge protocol 1, but it is dormant during ordinary execution: there is no string-named global, network endpoint or per-frame bridge work. An MCP-owned browser context can install the symbol-keyed ephemeral activation hook before navigation. In that context `Game.start()` registers the fully constructed Game at a paused frame-zero baseline; `Game.dispose()` or page unload unregisters it.

Runtime Snapshots automatically inspect public own component fields and setter-backed accessors while excluding `_` fields, `entity`, `game` and functions. A component can replace automatic discovery with the optional public contract:

```ts
class PathFinder extends Component {
  inspectState(): unknown {
    return { target: this.target, remaining: this.path.length }
  }
}
```

The return value still passes through the bounded safe projector; it is not serialized with arbitrary `toJSON()`. The package root exports the Runtime Snapshot, projection marker, metadata, control and activation types plus `RUNTIME_BRIDGE_PROTOCOL_VERSION` and `RUNTIME_PROJECTION_LIMITS`.

## game.time: simulated timers and tweens

Every `Game` owns a `time: GameTime` service — `after`, `every`, a single-number `tween`, and a `now` reader — advanced only by Simulation Steps (ADR 0014), never by the wall clock:

```ts
const stun = game.time.after(0.3, () => fsm.goto('idle'), { owner: entity })
game.time.every(1, () => game.stats.set('clock', game.time.now), { scope: 'session' })
game.time.tween({
  from: 0, to: 1, seconds: 0.5, easing: 'quadOut',
  onUpdate: (v) => { overlay.opacity = v },
  onComplete: () => game.loadSceneByName('b'),
  owner: entity,
})
stun.remaining // seconds left, counting down
game.time.now  // seconds of Game Time since the Game started
```

- **`after(seconds, callback, options?)`** runs `callback` once, `seconds` of Game Time later (0 or a negative duration: the start of the next step). **`every(seconds, callback, options?)`** runs it every `max(seconds, 1/60)`, first one interval after creation, with no drift. **`tween(options)`** carries `from` to `to` over `seconds`, calling `onUpdate(value)` synchronously on creation and again on every later step, finishing with exactly `to` then `onComplete()`. Easing is `'linear'` (default), `'quadIn'`/`'quadOut'`/`'quadInOut'`, `'cubicIn'`/`'cubicOut'`/`'cubicInOut'`, `'sineInOut'`, or a custom `(t) => number`.
- All three return a `TimerHandle`: `cancel()`, `active`, `elapsed`, `remaining` (seconds of Game Time). `cancel()` — and owner/scene cancellation — leaves a tween's last applied value in place and never calls `onComplete`.
- **Step placement.** At the start of every Simulation Step, before the Component Update Schedule, `game.time` advances `now`, runs every due timer (due time, then creation order), then advances every tween that existed before that step (creation order). Work a callback creates is never run or advanced in that same step.
- **Scope.** A timer or tween is scene-scoped by default: `unloadScene()` and every scene load — including a Game's first — cancel it, running no callback. `{ scope: 'session' }` survives a scene change. `{ owner: entity }` cancels it immediately when that entity is destroyed, whatever its scope; an owner already dead at scheduling time yields an inactive handle. `game.dispose()` cancels everything in both scopes. This is the opposite default from `game.onUpdate`/`game.events` (ADR 0011), which survive a scene change by construction, and the same one `game.audio.play()` uses (ADR 0012) — see ADR 0017 for why timers follow audio's rule rather than the host-subscription one: a timer's callback almost always closes over the scene that scheduled it.
- **No Promises.** Nothing here returns one, and nothing is async — a `.then` continuation is not step-exact (it runs after the whole synchronous frame), which is exactly what `game.time` exists to avoid. Compose delays with `after`, not `await`.

## game.cameraEffects: shake, fade and flash

Every `Game` owns a `cameraEffects: CameraEffects` service beside `game.camera`, which stays the plain `THREE.OrthographicCamera` (ADR 0020). Effects advance only inside a Simulation Step, right after the scene camera, so nothing moves while the Game is not simulating, is stopped, or a Run Session is paused; `step { frames: N }` advances them by exactly N steps.

```ts
game.cameraEffects.shake({ intensity: 0.3, seconds: 0.25 })          // world units, decaying to 0
const out = game.cameraEffects.fade({ to: 'black', seconds: 0.4 })   // 'black' | 'white' | '#rrggbb' | 'clear'
game.cameraEffects.flash({ color: 'white', seconds: 0.15 })          // up to 1, back to exactly 0
out.cancel()                                                          // opacity stays where it was
await out.done                                                        // true: completed; false: cancelled or replaced
```

- **Shake.** An offset added to the camera only while drawing (the world render and Anchored Pieces), never to the base center that follow, deadzone and limits compute, so smoothing never feeds on it. Each axis stays within `intensity · (1 − ease(t / seconds))` (`easing` takes `game.time`'s names, `'linear'` by default) and is exactly `{0, 0}` from `seconds` on. Overlapping shakes apply the largest current amplitude. The jitter is deterministic per Simulation Step (no `Math.random`), so a Run Session reproduces it. It is not re-clamped to `limits`: at a map edge up to `intensity` beyond them can show. Under a fixed `resolution` the offset snaps to whole screen pixels; the base center is never snapped.
- **Fade.** Carries an HTML layer over the game viewport — inside the letterbox, above the world, UI Pieces and Anchored Pieces — from its current opacity to 1 in the given color, or to 0 with `'clear'`, and then holds. A new `fade` cancels a running one (its `done` resolves `false`) and starts from the current opacity.
- **Flash.** Its own layer above the Fade, shown at opacity 1 and returned to exactly 0 over `seconds`; it never changes the Fade.
- **Scope.** A Fade is session-scoped: it survives `unloadScene()` and every scene load with its color, opacity and any running progress, so it can cover a scene change. A Shake or Flash is scene-scoped: `unloadScene()` ends it, running no callback (its `done` resolves `false`). `game.dispose()` ends everything and removes the layers. This follows the audio and timer scope notes above (ADR 0011, ADR 0017): a transition fade is exactly the case that must cross a scene change.
- **Invalid arguments never throw.** A non-finite or negative `seconds`/`intensity`, an unknown color or an unknown easing logs one `[waica]` warning and returns a handle whose `done` resolves `false`; no effect changes.
- **Scene Transition.** `SceneTransition` takes `fadeSeconds` (default 0: a hard cut) and `fadeColor` (default `'black'`): it fades out over `fadeSeconds`, loads its destination, then clears over `fadeSeconds` in the incoming scene. Simulation and input keep running; the component ignores further triggers during its outgoing fade. The Runtime Bridge `scene` operation stays a hard cut.
- **Runtime Snapshot.** Every snapshot carries `camera: { shake: { x, y }, fade: { color, opacity }, flash: { color, opacity } }` from the last completed step, under the `'camera-effects'` capability.

A Fade to a color that nothing clears leaves the view covered; the engine does not warn.

## game.ui.attach: Anchored Pieces

A UI Piece shown with `game.ui.show(name)` is a screen-space singleton. `game.ui.attach(piece, entity, options?)` instead creates an **Anchored Piece**: a new instance of the piece that follows `entity` across the screen, with its own shadow root and its own values. Every call is a new instance — five orcs can each carry a `health-bar` — and the screen piece of the same name is never mounted, shown or changed by it.

```ts
const hit = game.ui.attach('damage-number', orc, { offset: [0, 1.2], seconds: 0.8, values: { amount: 3 } })
const bar = game.ui.attach('health-bar', orc, { offset: [0, 1.4], values: { current: 7, max: 10 } })
bar.set('current', 6) // {{current}} and --current update live
bar.remove()
```

```html
<style>
  .bar { position: absolute; transform: translate(-50%, -100%); width: calc(1.2 * var(--waica-unit)); height: 4px; background: #0008 }
  .fill { width: calc(var(--current) / var(--max) * 100%); height: 100%; background: #ef476f }
</style>
<div class="bar"><div class="fill"></div></div>
```

- **Options.** `offset: [x, y]` (default `[0, 0]`) is in world units, added to the entity's render point in render space: `[0, 1]` is one unit up on screen, under `projection: 'isometric'` too. `seconds` gives the instance its own lifetime (below). `values` are the instance's own values.
- **Handle.** `set(name, value)`, `remove()`, `alive` and `element` — the piece's content root inside the instance's shadow root, `null` once removed.
- **Placement.** Once per render frame — after the isometric projection and the camera step, before the render, never per Simulation Step — each instance's shadow host is placed as a zero-size box at its anchor point, converted to whole CSS pixels from the top-left corner of the game viewport; the piece's own CSS centres itself around that point (e.g. `transform: translate(-50%, -100%)`). A move therefore shows on the next frame, not before. All instances live in one layer fitted to the game viewport — the whole canvas, or the letterboxed rectangle under a fixed `resolution` — with `overflow: hidden`, so they never draw over the letterbox bars.
- **Per-instance values.** Inside an instance, `{{name}}` renders the instance's own value when it has one and the Game stat of that name otherwise (booleans as ✓/✕, missing as empty); `set` updates it in place, and a stat change still updates every placeholder with no instance value. Every number value is also published as the custom property `--name` on the instance (`values: { current: 7, max: 10 }` gives `--current: 7` and `--max: 10`), booleans as `1`/`0`; strings are text only. There are no binding expressions: arithmetic belongs in CSS `calc()`.
- **`--waica-unit`.** Every frame, the anchored layer carries `--waica-unit` inline, and every instance inherits it through its shadow host: CSS pixels per world unit, the game viewport's CSS height divided by the current view height. It follows camera zoom and the letterbox scale, so `calc(1.1 * var(--waica-unit))` sizes a piece in world units while everything else keeps its CSS pixel size. Under a perspective camera each instance's host carries its own unit, measured at its anchor's depth: a piece twice as far from the camera is half as wide (issue #181).
- **Draw order.** The anchored layer sits below every screen-space piece. Within it, every frame, the instance lower on screen draws on top, like y-sort; equal heights keep creation order, later on top.
- **Lifetime.** Without `seconds`, an instance is removed before its entity's `destroy()` returns. With `seconds: S`, it is removed exactly when a `game.time.after(S, …)` scheduled at the same moment would fire — it counts Game Time (ADR 0017), so it never runs out while the Game is paused or not simulating, and until then it counts in `game.time.pending`. If its entity is destroyed first, it lingers frozen where the entity was at `destroy()` time (still moving with the camera) until it expires. `unloadScene()`, every scene load that unloads and `game.dispose()` remove every instance: none outlives its scene. `remove()` is immediate; `set` and `remove` on a removed handle are silent no-ops. CSS animations and transitions inside an instance follow Game Time, not the wall clock: every frame each is paused at the Game Time since it started (the attach, for those the piece starts with), so a paused Game freezes a damage number mid-flight — it resumes from there, even after the overlay hid while not simulating — and `step { frames: N }` advances it by N/60 s.
- **Invalid attach never throws.** An undefined piece name logs one `[waica]` warning per name per Game; an entity that is no longer `alive` logs one per call. Both return a handle with `alive: false` and `element: null` that mounts nothing. To attach only when the project defines the piece, as `Interactable` does with `npc-bubble` and `interact-prompt`, check `game.ui.has(name)` first.
- **Runtime Snapshot.** Every snapshot carries `ui: { shown, anchored }`: the visible screen pieces by name, and each live instance in creation order as `{ piece, entity, x, y, clipped, values }`, with the pixel coordinates of its last placement; `values` are bounded like component state (a string over 4 KiB becomes a `$waica: 'truncated'` marker), and once every entity is cut the 1 MiB snapshot cap drops instances from the end.

The trade-off is ADR 0018's: Anchored Pieces are HTML drawn over the game view, not text rendered in the three scene. They always draw above the world — a label behind a tree draws over it — hide with the rest of the UI overlay while the Game is not simulating (including the editor's edit mode), and do not align to a pixel-art grid.

## game.assets: textures, preload and Assets Ready

Every `Game` owns an `assets: AssetLoader` — the engine's texture cache. `Sprite`, `AnimatedSprite` and `Tilemap` load through it: one fetch and one base texture per URL for the whole life of the Game, and every component gets its own clone of that base (three shares the GPU upload between clones with equal sampler parameters and reference-counts their disposal), so eight crates cost one image. A scene load never waits for images — `loadScene` stays synchronous — and **Assets Ready** is a promise beside it (ADR 0019):

```ts
game.registerSceneCatalog({ scenes, registry })
game.loadSceneByName('main')
await game.assets.ready() // every texture requested so far has loaded, or failed and been recorded
game.start()

await game.assets.preload(['waica:iso-crate', 'src/art/tree.png']) // ahead of a later scene
game.assets.status // { pending, loaded, failed } — a fresh object on every read
```

- **Cache rule.** Keyed by the URL as received: components pass what `resolveProps` resolved, `preload` resolves each uri through the registered scene catalog first (identity before `registerSceneCatalog`, and for a uri the resolver leaves unchanged). N requests of one URL call the backend once; `status.loaded` counts URLs, not requests. Keep-all: `unloadScene()`, `loadScene` and `loadSceneByName` never dispose, evict or reset an entry — `main → cave → main` re-downloads nothing — and only `game.dispose()` disposes every cached base, exactly once, leaving `status` at zeros. Components dispose only their own clone.
- **`ready()`.** Resolves the first time `pending` is 0 after the call: at once when nothing is pending, otherwise once every URL requested before or while waiting has settled. Readiness is relative to the moment it is awaited — a later spawn that requests new art reopens it until that art settles — and concurrent callers all resolve. It never rejects, and it has no timeout: a stalled image with no error event holds a host that awaits it (a Run Session is bounded by the MCP's session timeout instead).
- **`preload(uris)`.** Requests every uri and resolves once all of them settled, failures included. A component that later asks for the same resolved URL is a cache hit.
- **`status`.** `pending` is current; `loaded` and `failed` are cumulative for the Game and only grow until `dispose()`. A host that wants a loading bar reads it from `game.onUpdate`.
- **Failure rule.** A texture that fails to load is recorded, not thrown: `console.warn('[waica] assets: failed to load "<url>"', error)` once per Game per URL, `failed` counts it, `ready()` resolves, and every consumer falls back to its flat material — `Sprite` and `Tilemap` drop the failed map, dispose their clone and render their `color` again; `AnimatedSprite` never installs the failed sheet's clone, so that sheet's frames show a plain white quad. Asking for that URL again on the same Game is a cached failure — no retry, no second warning.
- **Models.** `game.assets.model(uri)` is the glTF half of the same cache (see [3D scenes](#3d-scenes)): one load per URL, `status` and `ready()` count it, `preload` routes `.glb` and `.gltf` to it.
- **`GameOptions.textures`.** Replaces the real `THREE.TextureLoader` backend for that Game (ADR 0013's seam, applied to textures): `happy-dom` decodes no images, so a project's own tests inject a backend that resolves at once. The Runtime Bridge reports `assets` in its metadata under the `'assets'` capability, and a Run Session waits for `pending === 0` at readiness, after a `scene` operation and before every screenshot.

## The host platform: quit, fullscreen and achievements

Every `Game` talks to the host it runs in through a replaceable platform seam (ADR 0032): the browser, or the desktop shell that `waica export desktop` packages the game into. A game asks the same questions on both and gets an honest answer:

```ts
if (game.canQuit) menu.add('Quit', () => game.quit())
await game.setFullscreen(!game.isFullscreen())
game.achievements.unlock('first-kill')
game.achievements.setStat('kills', 3)
const kills = await game.achievements.getStat('kills') // number | undefined
```

- **`game.canQuit` and `game.quit()`.** `canQuit` is `true` in the desktop shell, where `quit()` closes the app, and `false` on the web, where a page cannot close itself: there `quit()` does nothing (the loop keeps running and nothing throws), so a game hides its Quit button instead.
- **`game.setFullscreen(on)` and `game.isFullscreen()`.** On the web, the browser's Fullscreen API: `setFullscreen(true)` requests it for the page and `setFullscreen(false)` leaves it; `isFullscreen()` is `document.fullscreenElement !== null`. A browser refuses a request made without a user gesture: the promise still resolves, never rejects, and `isFullscreen()` stays `false`, so call it from a key or click handler. In the desktop shell both go to the window, and F11 and Alt+Enter toggle it too. There `isFullscreen()` is a synchronous round trip to the main process that blocks the page until it answers, so read it when a key is pressed or a menu opens, not in every `update`.
- **`game.achievements`.** Store-agnostic: `unlock(id)`, `setStat(id, value)`, `getStat(id): Promise<number | undefined>` and `available`. On the web, and in a desktop build exported without Steam, `available` is `false`, `unlock` and `setStat` do nothing and `getStat` resolves `undefined`. In a desktop build with Steam (`game.json`'s `desktop.steam`) and a running Steam client, `available` is `true` and each call reaches Steamworks; declare every id in `desktop.steam.achievements` or `desktop.steam.stats`.
- **`GameOptions.platform`.** Absent, the Game picks the desktop backend when `window.waicaDesktop` (the shell's preload bridge, `DesktopBridge`) exists, and `WebPlatformBackend` otherwise. A `window.waicaDesktop` of another shape (an engine and a shell whose versions disagree) falls back to the web backend with a console warning that names what it lacks. A project's own tests pass a fake `PlatformBackend` to observe every call. `new WebPlatformBackend(() => element)` fullscreens that element instead of the whole page: the editor's Play passes its Viewport's surface.
