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
npx @waica/cli   # no clone needed — serves the editor and opens your browser
```

Or install it globally to keep the `waica` command around:

```bash
npm install -g @waica/cli
waica
```

> Published as `@chichex/waica` up to 0.3.0, before the `@waica` org existed.
> That name is deprecated and frozen at 0.3.0 — switch to `@waica/cli`.

Or from a checkout:

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
| [`@waica/engine`](./packages/engine/README.md) | Core: game loop, Entity + Components, scene JSON + prefab registry, `StateMachine` + role registry (`defineRole`/`defineStates`), `DynamicBody`/`Solid`/`Hitbox` collisions, input actions, sprites + animation contracts, scene camera, stats, HTML UI layer, `THREE` re-export |
| `@waica/behaviors` | Curated game-feel library: `PlatformerMotor` and the `player` role, plus `patroller`, `chaser` and `npc`, `Collectible`, `Hazard`, `Respawnable`, `Lifetime` |
| `@waica/archetype-platformer` | Opinionated platformer setup — playable from minute zero: default scene, prefabs, controls, HUD and stock art. The placeholder hero is Waica herself (pixel art, script-generated) |
| `@waica/archetype-topdown` | Opinionated Zelda-like overhead setup: 8-direction movement, y-sorted depth, NPC dialogue via `interact`, village demo scene and CC0 stock art (Kenney) |
| `@waica/editor` | The app: create/open projects (owns the new-project template), viewport with drag & drop, inspector, state machine & animation editors, controls/stats views, play-in-editor, Monaco |
| `@waica/mcp` | Stdio MCP server for agents: project creation, introspection, validation, scaffolds, and browser-backed Run Sessions with deterministic control, Runtime Snapshots and screenshots. Not published on its own — it ships inside `@waica/cli` |
| `@waica/cli` | One-command launcher: `npx @waica/cli` serves the pre-built editor and opens your browser, `waica mcp` serves the MCP server. The package is scoped; the binary it installs is plain `waica` |

The engine, behaviors and archetype libraries are published to npm together with `@waica/cli`, always on the same version — that is what a generated project installs. `@waica/editor` and `@waica/mcp` are not published on their own; they ship inside the CLI.

## Agentic development

```bash
claude mcp add waica -- npx -y @waica/cli mcp
```

See [`packages/mcp/README.md`](./packages/mcp/README.md) for all 15 tools, the absolute `project_path` contract, runtime trust boundary, system Chrome prerequisite, deterministic pause/step semantics, cleanup guarantees, editor-coexistence guidance, and how to run a generated Project against the workspace.
