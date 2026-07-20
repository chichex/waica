# Waica — Archetype-driven web game engine

> Status: **living draft**. Decisions made on 2026-07-18 in the initial design session.
> Name: **Waica**, after Ayrton's childhood dog — she's the engine's natural mascot (logo).
> Handles verified 2026-07-18: `waica` and `create-waica` free on npm (`@waica` scope with no packages), `waica` org free on GitHub, `waica.dev` / `.io` / `.games` unregistered (`waica.org` taken by an unrelated third party).

## 1. Vision

An **open source (MIT)**, **web-first** engine for **2D and 3D** games, centered on user experience. Not a blank canvas: an engine **opinionated through game archetypes** that guides you to build what you actually need, with a clean exit to real code (TypeScript) when you want off the rails.

Explicit anti-goal: **not** being "Godot but web". Godot optimizes for generality (any possible game) at the cost that everything requires decisions and the entry curve is enormous. We optimize the happy path of concrete genres, with the hood open.

## 2. Product thesis: archetypes

The creation flow defines the product:

1. You pick **2D or 3D**.
2. You pick the **archetype** (genre + camera): platformer, top-down, isometric, flip screen, … (3D: third person, first person, …).
3. That choice **configures everything**: movement model, animation contract, physics, camera, input map, the assets the engine asks you for, and even the editor UI's vocabulary.

Examples of the cascade effect:

- **Isometric** → 8-direction movement → the engine asks you for 8-direction animations (and mirrors NE→NW when the asset is missing).
- **Top-down** → 4-direction movement → `idle/walk × N/S/E/W` animations, tile collision, no gravity.
- **Platformer** → left/right with automatic flip → `idle/run/jump/fall` clips, tuned gravity, camera with deadzone and lookahead.
- **Flip screen** → camera cuts at the screen edge (NES Zelda style).

Golden anti-trap rule: an archetype **is neither a boilerplate generator nor an engine fork**. It's a **living declarative package on top of the generic core**. If it were a template that vomits code at you, the user would be on their own after the first change (the RPG Maker cliff). Since it's living configuration, tweaking a slider and rewriting the behavior are the same system.

Pattern references: **GB Studio** (scene types that define controls and physics — living proof that it works, limited to Game Boy), **RPG Maker** (the power of a single archetype, and the ceiling of having no exit to code).

## 3. The three user levels (no cliffs)

1. **Rails**: you follow the archetype, tune parameters with sliders, replace placeholders with your art.
2. **Composition**: you mix and configure behaviors from the library, add entities of your own.
3. **Code**: you write your behaviors in TypeScript (embedded Monaco, hot reload).

The level-1 "jump height" slider edits the same TS behavior you could rewrite at level 3. Always the same project; never "export and never come back".

Strategic bonus: archetypes provide **semantic context for AI agents** ("this is a platformer; the player has these behaviors") — "add a double jump" works much better with that vocabulary. Plain-text project + small typed API + headless CLI = the most comfortable engine to work on with AI. None of the big ones has this as a founding principle.

## 4. Anatomy of an archetype

An archetype is a declarative (npm) package containing:

- **Preconfigured behaviors** with curated *game feel* defaults (e.g. platformer: coyote time, jump buffering, acceleration curves — what a beginner doesn't know they need).
- **Animation contract**: which clips each character needs; the editor shows the gaps ("you're missing walk-NW") and applies fallbacks (automatic mirroring).
- **CC0 placeholders** (e.g. Kenney): the game works from minute zero; the user replaces them piece by piece. There's never an empty screen.
- **Default input map** (WASD/arrows/gamepad pre-mapped).
- **Genre physics and camera presets**.
- **Initial scene/project template**.
- **Editor UI specialization** (vocabulary, panels, wizards with animated mini-demos).

The format is open so the community can publish archetypes of their own (shoot 'em up, roguelike deckbuilder, point & click, …).

Launch strategy: **2 excellent archetypes > 6 mediocre ones**. Each archetype is curated game design, not just code.

## 5. Competitive map and the gap (July 2026)

| Project | What it is | Its weakness |
|---|---|---|
| Godot | Dominant open source, desktop-first | Not web-native; enormous entry curve |
| GDevelop | Open source, web+desktop editor, no-code; since 5.6 (Dec 2025) with a real 3D editor and Jolt physics | Code = second-class citizen; event-sheets first; 2 renderers (Pixi+three) |
| Construct 3 | The reference in editor-in-browser UX | Closed, subscription |
| PlayCanvas | MIT 3D engine; editor frontend opened (Jul 2025) | The editor depends on their SaaS backend |
| three.js / Babylon | Render infrastructure | Not engines with an editor |
| Phaser | Popular code-first 2D | No 3D; separate editor |
| GB Studio | Archetypes done right, MIT | Limited to Game Boy |

**The empty quadrant we occupy**: code-first TS + an editor that lives in the browser and is local-first (your files, your git, no account, no backend) + unified 2D/3D + fully open source + **opinionated archetypes as a first-class concept**.

## 6. Decisions made

| # | Decision | Choice | Why |
|---|---|---|---|
| 1 | Editor strategy | Browser-first, local-first; packageable to desktop later | Market gap; "open a link and edit" |
| 2 | Render base | three.js — WebGPU with WebGL2 fallback, **a single 2D+3D pipeline** | 2D = quads + orthographic camera (like Unity: Hollow Knight/Cuphead); avoids maintaining 2 renderers like GDevelop; lights/post/2D+3D mixing for free; three stays an implementation detail behind the engine API (reversible) |
| 3 | User scripting | First-class TypeScript + parameterizable behaviors | Covers beginner to pro; 80% of visual scripting's value at 20% of its cost; AI-friendly |
| 4 | Initial scope | Unified 2D+3D core; first polish on 2D | Avoids the "2D first, 3D impossible later" rewrite |
| 5 | Product thesis | **Archetype-driven engine** ("rails with the hood open") | See §2 |
| 6 | Object model | Entity + Components (Unity-like) | Archetype = entities with plugged-in behaviors; maps 1:1 to the inspector; familiar |
| 7 | License | MIT | The niche's norm (three, Phaser, GB Studio); maximum adoption |
| 8 | First archetype | **Platformer** | The "my first game" genre; cheap assets (2 directions + flip); where game feel shines brightest |
| 9 | Milestone 1 shape | Game + **inspector overlay** (not the full editor yet) | Validates the play-tweak-save magic without the editor's cost |
| 10 | Name | **Waica** | Short, pronounceable in Spanish and English, with a real story behind it and a mascot included; npm/GitHub/domain handles free |

## 7. Tech stack

- **Language**: TypeScript everywhere (engine, editor, user games).
- **Render**: three.js (WebGPU → automatic WebGL2). Sprites via instancing/batching + atlases; pixel-perfect with NearestFilter and snapping; 2D layers with renderOrder; SDF text (troika).
- **Physics**: Rapier (Rust→WASM, Apache-2.0) — 2D and 3D with the same API; character controller for the platformer.
- **Audio**: Web Audio API behind a thin layer.
- **Dev**: Vite (dev server + behavior HMR); the overlay persists changes to disk via a dev-server plugin (File System Access API arrives with the standalone editor).
- **Project format**: JSON/plain text, git-friendly, clean diffs.
- **Export**: HTML = static bundle. Steam/Epic = Electron + steamworks.js. Mobile (future) = Capacitor.
- **Repo**: pnpm monorepo + Vitest + Playwright; changesets for versioning.

Target monorepo structure (milestone 1 can start with fewer packages and split when it hurts):

```
packages/
  engine/            # core: loop, scene, Entity+Components, assets, input, audio
                     # + render (three) + physics (Rapier) — split later if it grows
  behaviors/         # library: PlatformerMovement, Patrol, Health, Spawner…
  archetype-platformer/  # the first archetype (the archetype format is born here)
  overlay/           # in-game inspector overlay: edits behaviors live + persists
  create/            # create-waica: archetype wizard (`npm create waica`)
  exporter-html/     # static build
examples/            # includes a 3D smoke test of the unified core
docs/                # living docs with runnable examples
```

## 8. Milestone 1 — "Platformer end to end" (definition of done)

1. `npm create waica` → wizard: name, archetype (platformer; the rest "coming soon"), pixel art? → generated project.
2. `npm run dev` → in the browser: a **playable platformer with CC0 placeholders**: run, jump (coyote time + jump buffering), platforms, coins, one enemy, death/respawn, a couple of level screens.
3. **Overlay** (`~` key): entity tree + behavior parameters editable live (sliders) + **persistence to the project** through the dev server.
4. **Hot reload** of the user's TS behaviors.
5. `npm run build` → static folder ready for itch.io / any hosting.
6. `examples/` includes a minimal 3D scene using the same core (smoke test of the unified design; not a user feature yet).

Out of milestone 1 (explicit): visual level editing (template levels ship as JSON assets; Tiled import as a bridge for technical users). Visual editing arrives with the editor.

## 9. Roadmap

- **H1**: platformer end to end (§8).
- **H2**: local-first web editor — the game as viewport, hierarchy, a real inspector, level/tilemap editing, play-in-editor; File System Access API (fallback for Safari/Firefox).
- **H3**: second archetype (**top-down**) → forces generalizing the archetype format (only with two examples do you know what to abstract). 4-direction animation contract with mirroring.
- **H4**: desktop export (Electron + steamworks.js), expanded behavior library, animation-contract tooling.
- **H5**: first 3D archetype (third person), glTF pipeline, 8-direction isometric.
- **Ongoing**: living docs, templates, time-to-first-game < 5 min, an archetype community.

Cross-cutting strategy: **every layer useful on its own** (the framework works without the editor; the overlay works without the full editor) and **dogfooding** — making real games with the engine at every milestone.

## 10. Honest limits / non-goals

- **Consoles**: Switch/PlayStation have no official path for web tech; Xbox is possible via UWP/WebView2 with limitations. We promise: web, Steam, Epic, Itch, mobile. Not consoles.
- **Performance**: JS + WebGPU covers ~95% of indie games; AAA is not the target.
- **v1 does not include**: visual scripting (to evaluate post-editor), multiplayer, an asset store.
- The full editor is ~80% of the total effort: hence the order runtime → overlay → editor.
- Adoption is won by templates, docs and time-to-first-game — not by the technical core.

## 11. Pending

- [x] **Project name**: Waica (2026-07-18).
- [x] `git init` + public repo: `github.com/chichex/waica` (2026-07-18; migrate to the `waica` org once it's reserved).
- [x] Monorepo bootstrap (2026-07-18): `engine` (loop, Entity+Components, input, Sprite, Solid), `behaviors` (`PlatformerMovement` with coyote/buffer/jump-cut/squash, `CameraFollow`), `archetype-platformer`, `overlay` (in-game inspector with persistence; round-trip verified with a real browser).
- [ ] **Publish to npm** (Ayrton only): create the `@waica` org on npmjs + `npm login` + `pnpm release` (builds and publishes the 5 real packages, no longer placeholders). Then: `waica` org on GitHub and register `waica.dev` (optionally `.io`/`.games`).
- [x] Animation contract v0 (2026-07-18): `AnimationContract` + `resolveClip`/`missingClips` with fallbacks, `AnimatedSprite` (grid spritesheet, pixel-perfect), `PlatformerAnimator` (state→clip) and the mascot's placeholder spritesheet generated by script (`scripts/generate-dog-sheet.mjs`). Vitest running (14 tests). Verified e2e with a browser: idle→jump→fall→idle cycle and automatic flip.
- [x] Full archetype gameplay (2026-07-18): trigger system (`Hitbox` + `onCollide` hook in the core), `Collectible`/`Patrol`/`Hazard` (Mario-style stomp)/`Respawnable` behaviors, a level with a pit, coins and slimes (script-generated sprites), coin HUD. 22 unit tests; verified e2e: collecting, side damage→respawn, stomp and death by falling.
- [x] `create-waica` wizard (2026-07-18): CLI with @clack/prompts (bare = interactive; `create-waica <dir>` = power-user), full template, and the packages converted to **publishable** (tsc build to dist/ + d.ts, dual dev/publish exports via publishConfig, v0.1.0). Verified e2e with `pnpm pack` tarballs: the generated project installs, typechecks, builds and runs with the overlay. Manual pending: walk through the interactive flow once in a real terminal (rendering is verified; expect couldn't automate clack).
- [x] **Editor v0 — H2 kicked off** (2026-07-18, priority redefined by Ayrton: the app first): scenes serialized to JSON (`loadScene` + registry in the engine; `src/scenes/main.scene.json` as each project's source of truth), and the `@waica/editor` app (React + Monaco): create a project in a real folder (File System Access) / open / in-memory demo, file tree, entity hierarchy, viewport with selection + drag + pan + zoom + gizmo, draggable palette, full inspector (props, add/remove components, rename, delete), play-in-editor with a restoring Stop, autosave, and the Monaco code editor. Verified e2e with a browser: dragging persists to the JSON, dropping creates entities, play collects the created coin (🪙 1), Monaco shows the updated JSON. Manual test pending: the real-folder flow (the picker isn't automatable headless).
- [ ] **Editor next**: hot reload of user TS behaviors in the viewport (esbuild-wasm), user assets (folder PNGs as textures), HTML export from the editor, undo/redo, multi-selection.
- [ ] **Milestone 1 remaining**: reactive Sprite props; the 3D smoke test of the unified core; migration to WebGPURenderer with fallback.
- [ ] Define v0 of the archetype manifest format (born with `archetype-platformer`, generalized in H3).
- [ ] Pick the CC0 placeholder set (candidate: Kenney) and the animation-contract naming convention.
