# Grill — Block 5 of the 3D roadmap: the third-person archetype
<!-- Estado: finalized. Proyecto: /home/chiche/workspace/waica. Fuente: pedido del usuario (bloque 5 del roadmap 3D, .sdd/grills/2026-10-12-3d-editor.md:105-107). -->
<!-- SDD-Tracking: version=1; type=grill; state=finalized; issue=none; grill=2026-10-13-archetype-third-person; project=%2Fhome%2Fchiche%2Fworkspace%2Fwaica -->

## Hechos comprobados
- Three archetypes are registered today; registering one more touches ~12 manual points (MCP row + `loadBundledModule` + `FALLBACK_PACKAGES`, editor catalog + `script-sources.ts`, conformance `MANIFESTS`, `PUBLISHED_LIBRARIES`, CLI lockstep, 4 points of `test-dist.mjs`, `sync-scene.mjs` TARGETS + example + `dev:*`, publish SKILL.md + READMEs) [verified: `packages/mcp/src/known-archetypes.ts:17-33`; `.sdd/grills/2026-08-21-archetype-isometric.md:15`].
- The perspective scene camera is fixed (`position`, `target`, `fov`, `near`, `far`) and declares `follow?: never` [verified: `packages/engine/src/scene-camera-3d.ts:6-33`]. The existing follow is orthographic only and runs once per Simulation Step [verified: `packages/engine/src/camera-rig.ts:129`].
- `CharacterMotor` moves on world axes with `-z` forward, "not to the camera", and turns toward its walk with `turnSpeed` [verified: `packages/behaviors/src/character-motor.ts:9-60`].
- The engine has no pointer lock, no mouse delta and no mouse-button binding codes [verified: grep `requestPointerLock|movementX|Mouse` in `packages/engine/src`]. The right stick is already a binding [verified: `packages/engine/src/gamepad.ts:36`].
- `MeleeAttack`, `Patrol`, `Chaser`, `Hazard` and `Interactable` declare `space: '2d'`; `Health`, `Respawnable`, `Lifetime`, `Npc` and `Collectible` declare none [verified: grep `space:` in `packages/behaviors/src`]. `Collectible` relies on a 2D `Hitbox` [verified: `collectible.ts:4`].
- `MeleeAttack` lays a `range` × `width` rectangle along the facing in logical space [verified: `melee-attack.ts:12-22`]. Knockback and hurt stun exist only in the grid role [verified: `grid-motor.ts:24`, `grid-player-role.ts:34`].
- `Health` has an invulnerability window with a 10 Hz blink [verified: `health.ts:20, 85`].
- A sensor `Collider` dispatches `onOverlap` in 3D [verified: `packages/engine/src/component.ts:105`].
- The stock `health-bar` Anchored Piece is "one world unit wide (`--waica-unit`) at any zoom" [verified: `packages/behaviors/src/health-ui.ts:9-10`].
- `create_project` takes `start: 'demo' | 'blank'` [verified: `packages/mcp/src/create-project.ts:15`]; scaffolded characters adopt only the active archetype's roles [verified: `packages/mcp/src/scaffolds.ts:194`].
- The editor's picker already has a 3D tab with a `thirdperson` card (`soon`, 🎥, "Orbit camera behind the character, camera-relative movement.") beside `firstperson` (`soon`) [verified: `packages/editor/src/project/archetype.ts:85-99`]. `CameraInspector.tsx` already edits the perspective block (fov) [verified: `CameraInspector.tsx:27, 216`].
- `examples/smoke-3d` is used by `scripts/runtime-e2e-smoke-3d.mjs`, `runtime-e2e-animation.mjs`, `runtime-e2e-editor-3d.mjs`, `runtime-e2e.mjs` and `test-dist.mjs` [verified: grep `smoke-3d` in `scripts/`].
- KayKit Character Pack Adventures 1.0, Skeletons 1.0 (Minion, Warrior, Rogue, Mage) and Dungeon Remastered 1.0 (203 glTF models) are CC0 [verified: each repo's `LICENSE.txt` and tree under `github.com/KayKit-Game-Assets`].
- The source `Knight.glb` (commit `672074b`) has 76 clips including `1H_Melee_Attack_Chop`, `Dodge_Forward`, `Running_A`, `Hit_A`, `Death_A`; `Skeleton_Minion.glb` (4,814,296 bytes, 95 clips) has `Walking_A`, `Running_A`, `1H_Melee_Attack_Chop`, `Hit_A`, `Death_A`, `Idle` [verified: reading each glb's JSON chunk].
- Asset sizes today: isometric `assets/` 1.2 MB; the trimmed Knight 499,496 bytes [verified: `du -sh`; `examples/smoke-3d/ATTRIBUTION.md`]. `scripts/trim-character-glb.mjs` trims clips and nodes [verified: same file].
- Open issues: #151 (WebGPU on headless Linux draws blank), #152 (lighting follow-ups) [verified: `gh issue list`].

## Decisiones resueltas
**Scope and shape**
1. One spec, stacked PRs, combat included.
2. Id `third-person`, package `@waica/archetype-third-person`, published in lockstep.
3. The demo is an adventure with combat.
4. The new example replaces `examples/smoke-3d`, which is deleted.
5. Enemies use `Patrol` + `Chaser` in 3D, with no pathfinding.
6. smoke-3d's e2e invariants (glb load, light, depth, physics, animation, editor-3d) are rewritten against the demo; the bench `skinned-characters` scenarios keep their rig fixture.

**Camera**
7. Free orbit around the player; it stays where the user left it.
8. Declared in the scene's perspective `camera` block (`follow`, `distance`, orbit params); `follow?: never` goes away.
9. Camera collision: a Rapier ray from the player to the camera pulls the camera in front of what blocks it.
10. It moves once per Simulation Step (deterministic).
11. The mouse orbits under pointer lock, taken on click and released with Esc; the engine gains pointer lock and mouse delta.
12. It also orbits through Actions named in the `camera` block (right stick, `Q`/`E`).
13. Wheel zoom between `minDistance` and `maxDistance`.

**Controls**
14. `CharacterMotor.relativeTo: 'world' | 'camera'`, default `'world'`; `'camera'` rotates the input by the camera's yaw.
15. The character faces where it walks (existing `turnSpeed`).
16. Moveset: walk, jump, melee attack, held run, roll. No block.
17. Bindings: move WASD/arrows + left stick; jump `Space` / A; attack left click, `J` / X; run `Shift` / LB; dodge `C` / B; orbit mouse (locked), `Q`/`E` / right stick. The engine gains `Mouse:Left` and `Mouse:Right` as an Action source; the first click only takes the pointer lock.
18. The roll is a dash along the input (forward without input) for its clip; it opens `Health`'s invulnerability window and has a cooldown.
19. The `character` role gains `run`, `attack` and `roll` states; unbound Actions change nothing.

**3D combat**
20. `MeleeAttack` becomes `space: 'any'`; in 3D it queries a `range` × `width` × `height` box in front of the yaw through `game.query`.
21. Enemies strike with their own `MeleeAttack` after a visible wind-up.
22. One enemy kind: a melee skeleton.
23. Hit feedback: knockback, Model blink during i-frames, camera shake on the perspective camera. No stun.
24. `Patrol` and `Chaser` work in both spaces; in 3D through the kinematic `RigidBody` on xz and `turnYawToward`; waypoints accept `[x, z]` or `[x, y, z]`.
25. A new `enemy` role in behaviors: patrol, chase, windup, attack, hurt, die. The MCP scaffold can adopt it.
26. Player death: death clip, fade, respawn at the last checkpoint with full health.

**Art**
27. KayKit Adventurers (Knight), Skeletons (Warrior) and Dungeon Remastered.
28. The enemy is `Skeleton_Warrior`.
29. The package's assets total at most 3 MB; characters are trimmed to their role's clips with `trim-character-glb.mjs`; a `test-dist` check pins the cap.

**Demo, MCP and e2e**
30. One scene: a dungeon courtyard (walls, steps, platforms), three skeletons, two checkpoints, torches with Point Lights, a goal chest that shows "You win".
31. HUD: player health on screen, `health-bar` over enemies, damage numbers, a controls hint until the first input. Anchored Pieces scale with depth in 3D.
32. Blank scene: ground, Sun, the playable Knight with `character`, Rapier, the orbit camera following the Player.
33. Prefabs: Player, Skeleton, Checkpoint, Goal chest, level pieces (wall, floor, step, column, torch with Point Light).
34. The e2e leg adds: camera-relative movement (orbit 90° through Actions, then `up` moves where the camera looks), camera collision (snapshot distance below `distance` behind a wall), full combat (a skeleton reaches `die`; a hit during the roll does not lower the player's health) and respawn at the checkpoint.
35. `control_runtime` gains `look: { dx, dy }`, a mouse delta injected without pointer lock; snapshots expose the camera's yaw, pitch and distance.

**Design**
36. Diseño: the editor card is renamed to `third-person` and becomes `ready`, same 🎥 icon and blurb; `firstperson` stays `soon`.
37. Diseño: `CameraInspector` gains a "Follow" section built from existing controls (entity select, numeric rows, Action selects); with no `follow` the camera is fixed.
38. Diseño: in the editor's Play, a click in the viewport takes the pointer lock and Esc releases it without leaving Play; edit mode never locks.

## Ramas pendientes
None.

## Diseño
- **Surface:** the editor web app (`packages/editor/src`), with a design system (state per `.sdd/project.md` is unrecorded: the contract lacks `## Diseño`; run `/sdd-init --update`).
- **Screens and flows:** new-project picker → 3D tab → `third-person` card (`ready`) → start Demo/Blank, as for the 2D archetypes. Scene inspector → Camera → new "Follow" section. Viewport in Play → click captures the pointer, Esc releases it.
- **Reuse:** `ArchetypePicker` card, `CameraInspector`, `PropRow` and the existing param-kind rows and Action selects. No new components.
- **Visual direction:** not applicable (existing system).
- **Platform and accessibility:** desktop browsers; pointer lock is a mouse affordance, with `Q`/`E` and the right stick as non-mouse orbit paths. No mobile or webview support.
- **Reference captures:** none (no renderable mock for these screens).

## Handoff
### Topic and scope
A new 3D archetype, `@waica/archetype-third-person`: an orbit camera following the player, camera-relative movement, 3D melee combat with enemies, KayKit CC0 art, a dungeon-courtyard adventure demo, MCP and editor registration. One spec in stacked PRs. The new example replaces `examples/smoke-3d`.

### Confirmed decisions
The 38 above; the spec takes them as confirmed and does not re-ask them.

### Constraints and non-goals
- No 3D pathfinding or navmesh, stun, block, ranged enemies, 3D projectiles, strafe or lock-on.
- No second scene or scene swap in the demo.
- No first-person archetype (stays `soon`), no 2.5D.
- No new dependency.
- 2D behavior is untouched: `MeleeAttack`, `Patrol` and `Chaser` keep their 2D behavior and the 2D tests pass unchanged; `CharacterMotor` defaults to `'world'`.

### Explicit assumptions (the spec lists them as `[ASSUMED]`)
- Next minor (0.29.0) with a migration note: smoke-3d removed; `MeleeAttack`, `Patrol`, `Chaser` become `space: 'any'`; the perspective camera accepts `follow`; mouse binding codes and pointer lock.
- `Skeleton_Warrior` carries the same clip names as `Skeleton_Minion` [inference: same pack and rig].
- `Health`'s blink can toggle a Model's visibility.
- `cameraEffects.shake` works on a perspective camera.
- Pitch limits, sensitivity and `invertY` defaults are the spec's call.
- Pixel assertions of the demo run only where the frame draws (#151); state and JSON assertions run on both backends.

### Risks and deliberately deferred questions
- Stack size: likely 7–8 PRs (engine camera + mouse input; behaviors motor, combat, AI, roles; art; archetype package; MCP; editor; e2e).
- Esc may collide with editor shortcuts during Play.
- Depth scaling of Anchored Pieces under perspective touches the `--waica-unit` contract.
- e2e wall time grows with four new assertion groups.
- `.sdd/project.md` lacks `## Diseño`: `/sdd-init --update` before or alongside the spec.
- Out of scope: the MCP's duplicated glb parser, #151, #152.

### Recommended context for the spec session
- This handoff; `.sdd/grills/2026-10-08-3d-trunk-smoke-test-and-model.md`, `2026-10-09-3d-simulation-rapier.md`, `2026-10-12-3d-animation.md`, `2026-10-12-3d-editor.md`, `2026-08-21-archetype-isometric.md` (the 12 touchpoints); ADRs 0002, 0020, 0023, 0027–0030; `CONTEXT.md`.
- Engine: `scene-camera-3d.ts`, `camera-rig.ts`, `input.ts`, `gamepad.ts`, `components/collider.ts`, `camera-effects.ts`.
- Behaviors: `character-motor.ts`, `character-states.ts`, `facing-3d.ts`, `melee-attack.ts`, `patrol.ts`, `chaser.ts`, `health.ts`, `health-ui.ts`, `respawnable.ts`.
- MCP: `known-archetypes.ts`, `create-project.ts`, `scaffolds.ts`, `archetypes.ts`. Editor: `project/archetype.ts`, `home/ArchetypePicker.tsx`, `editor/inspector/CameraInspector.tsx`, `editor/Viewport.tsx`.
- Scripts: `runtime-e2e*.mjs`, `test-dist.mjs`, `sync-scene.mjs`, `trim-character-glb.mjs`. Example: `examples/smoke-3d`, `examples/isometric` (archetype example shape).
