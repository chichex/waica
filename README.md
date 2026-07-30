# Waica 🐕

**An archetype-driven, open source game engine for the web.**

Pick what you're making — a platformer, a top-down adventure, an isometric game — and Waica sets up the movement, the camera, the physics and the exact animations you'll need. Opinionated rails for the common 90%, a real TypeScript engine underneath for everything else. 2D and 3D, one core.

**Status: the editor is the center of the product** (milestone 2, pulled forward; milestone 1's 3D/WebGPU leftovers still pending). The platformer archetype runs end to end with factory game feel — coyote time, jump buffering, jump cut, squash & stretch — and characters are data-first: states and transitions live in the prefab JSON, behavior code lives in **roles** (`player`, `patroller`, `chaser`, or your own scaffolded into `src/roles/`). A project is plain files — scenes, prefabs, controls, stats and UI pieces are JSON/HTML you can read, hand-edit and commit.

- Design doc: [DESIGN.md](./DESIGN.md)
- Stack: TypeScript · three.js (WebGPU → WebGL2 planned) · Vite
- Exports: web (static HTML) now; desktop via Electron (Steam/Epic) planned
- License: MIT

Named after a childhood dog. She was a good girl.

## The Editor

```bash
pnpm install
pnpm editor
```

The Waica Editor runs in your browser, local-first: create a project into any empty folder (File System Access API) from an archetype — demo level or blank chassis —, drag pieces from the palette into the viewport (grid, pan/zoom, multi-select, undo/redo), edit every component param in the inspector, wire state machines and animations in their own panels, bring your own art (with spritesheet detection), manage per-project controls and stats, press **Play** to test in place, and edit the code with Monaco. Scenes are plain JSON in your project — what you edit is what you commit.

## Run the example

```bash
pnpm dev   # platformer archetype — ← → move · space jump
```

## Packages

| Package | What it is |
|---|---|
| `@waica/engine` | Core: game loop, Entity + Components, scene JSON + prefab registry, `StateMachine` + role registry (`defineRole`/`defineStates`), `DynamicBody`/`Solid`/`Hitbox` collisions, input actions, sprites + animation contracts, scene camera, stats, HTML UI layer, `THREE` re-export |
| `@waica/behaviors` | Curated game-feel library: `PlatformerMotor` and the `player` role, plus `patroller`, `chaser` and `npc`, `Collectible`, `Hazard`, `Respawnable`, `Lifetime` |
| `@waica/archetype-platformer` | Opinionated platformer setup — playable from minute zero: default scene, prefabs, controls, HUD and stock art. The placeholder hero is Waica herself (pixel art, script-generated) |
| `@waica/editor` | The app: create/open projects (owns the new-project template), viewport with drag & drop, inspector, state machine & animation editors, controls/stats views, play-in-editor, Monaco |
