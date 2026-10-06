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

## Component lifecycle

Waica keeps the lifecycle boundaries distinct:

1. `Entity.add()` mounts a component and calls its `onReady` immediately. This remains component insertion order so setup behavior does not silently move.
2. During each simulated frame, entities keep their existing entity order. When an entity's turn begins, `Game` snapshots and resolves that entity's component `onUpdate` schedule, then dispatches only that schedule.
3. Physical `onContact` hooks run from `DynamicBody` while it updates. Hitbox `onCollide` hooks run after all entity component updates. Their existing component dispatch order is unchanged.
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
- **`--waica-unit`.** Every frame, the anchored layer carries `--waica-unit` inline, and every instance inherits it through its shadow host: CSS pixels per world unit, the game viewport's CSS height divided by the current view height. It follows camera zoom and the letterbox scale, so `calc(1.1 * var(--waica-unit))` sizes a piece in world units while everything else keeps its CSS pixel size.
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
- **`GameOptions.textures`.** Replaces the real `THREE.TextureLoader` backend for that Game (ADR 0013's seam, applied to textures): `happy-dom` decodes no images, so a project's own tests inject a backend that resolves at once. The Runtime Bridge reports `assets` in its metadata under the `'assets'` capability, and a Run Session waits for `pending === 0` at readiness, after a `scene` operation and before every screenshot.

