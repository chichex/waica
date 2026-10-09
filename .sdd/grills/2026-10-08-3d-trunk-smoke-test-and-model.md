# Grill — 3D in waica, block 1: the trunk (smoke test + Model)
<!-- Estado: finalized. Proyecto: /Users/ayrtonmarini/workspace/waica. Fuente: user request ("how far are we from 3D?"), no issue. -->
<!-- SDD-Tracking: version=1; type=grill; state=finalized; issue=none; grill=2026-10-08-3d-trunk-smoke-test-and-model; project=%2FUsers%2Fayrtonmarini%2Fworkspace%2Fwaica -->

## Hechos comprobados
(Verified 2026-10-08 at `main` 7423512, v0.25.0.)
- DESIGN.md commits to a unified 2D+3D core (§6 decisions 2 and 4), lists the 3D smoke test as milestone-1 work still pending (§8 item 6, §11), and places the first 3D archetype (third person, glTF pipeline) in H5 (§9) — `DESIGN.md:77-79, 120, 130, 157`.
- The editor's create-project picker already shows a 3D tab with "Third person" and "First person" marked 🚧 — `packages/editor/src/project/archetype.ts:85-100`.
- Render stack: three 0.186.1 through `three/webgpu` with node materials; `@waica/engine` re-exports `THREE` from that build (`packages/engine/package.json:33`, `packages/engine/src/index.ts:238-242`, ADR 0025). Nothing in the repo uses `GLTFLoader`, `AnimationMixer`, `SkinnedMesh`, `PerspectiveCamera` or `OrbitControls` (grep over packages/*/src, examples/*/src, scripts: empty).
- `game.camera` is a `THREE.OrthographicCamera` fixed at z=10 (`game.ts:130, 260-261`); the editor reads/writes it directly in 14 places (grep over `packages/editor/src`, non-test); the Pointer duck-types an orthographic camera (`pointer.ts:15-21`); Anchored Pieces and spatial audio project through 2D `renderPoint` (`game.ts:664, 832`).
- Scene JSON: `position?: [number, number]`, z forced to 0, no rotation or scale (`scene.ts:18, 211`). The Runtime Snapshot already reports position x/y/z, rotation (with Euler order) and scale (`runtime-inspection.ts:47-49`).
- `z` is draw order today: sprite layers map to `layer * 0.01` and the y-sort pass writes z (`components/sprite.ts:117-122`, `render-sort.ts:50-72`).
- Collision and physics are 2D and hand-rolled: rectangle/circle/polygon, AABB, Solid, DynamicBody, x/y solid axes, spatial queries, broadphase, Tilemap (`collision-shape.ts`, `aabb.ts`, `solid-axis.ts`). Rapier was planned and never adopted (`DESIGN.md:91`, `components/solid.ts:13` TODO(H1)). The fixed 1/60 s step is a contract (ADR 0014).
- 2D lighting: ambient at scene level (`render.lighting.ambient`) plus a `Light` component per entity (radius, color, intensity, bands, softness, castShadows, offsets) feeding a light-map multiplied over the drawn frame (`components/light.ts:18-43`, `scene-lighting.ts:85-87`, ADR 0026).
- `game.assets` is texture-only: `texture(url)`, `preload(uris)`, `ready()`, `dispose()`, `status`; one `TextureBackend { load(url): Promise<THREE.Texture> }` per Game, no registry by kind (`assets/asset-loader.ts:97-135`, `assets/texture-backend.ts:11-13`). `ArchetypeArt.kind` is `'image' | 'sound'` (`archetype.ts:22`); the editor derives the kind from the file extension (`editor/use-project-art.ts:153-154`) and filters on it (`EditorModals.tsx:73`, `EntityInspector.tsx:235`, `param-kind-rows.tsx:111`, `ref-targets-context.ts:52`, `ArtPanel.tsx:228`); the MCP checks only `kind === 'sound'` (`param-reference-resolution.ts:173`).
- StateMachine is coupled to `AnimatedSprite` by class: it imports the class (`state/state-machine.ts:8`), `playClip` does `entity.get(AnimatedSprite)` then `sprite.play(clip)` (`:238-251`), `playDirectionalClip` is typed against it (`:259-269`), and `reresolveOnFacingChange` repeats the lookup (`:289`). `animation/clip-player.ts` is a frame-index helper, not a playback interface; `animation/contract.ts` is data plus pure functions. No seam a non-sprite renderable could implement today.
- Unit-test renderer fake: each test opts in with `vi.mock('three/webgpu', ...)`; `withFakeRenderer` swaps only `WebGPURenderer` and `RenderTarget` (`test-renderer.ts:231-233`); the fake `render` records draws and never compiles materials; `FakeCamera` reads only `position.x/y` and `layers.mask`. Real `PerspectiveCamera`, `Mesh` and `MeshStandardNodeMaterial` need nothing from it.
- `three.webgpu.js` embeds the core (zero `from 'three'` imports in the build); `examples/jsm/loaders/GLTFLoader.js` imports from `'three'` (`GLTFLoader.js:67`), i.e. `three.module.js` by the exports map (`.` → `./build/three.module.js`, `./webgpu` → `./build/three.webgpu.js`, `./addons/*` and `./examples/jsm/*` → `./examples/jsm/*`). No Vite config in the repo aliases `three`. Decision D1 of the #140 grill wanted a single copy of three per bundle.
- Velocity calibration: recent features landed as PRs of 2k–6k lines in days (#150 lighting +6102, #141 WebGPU +2484/-1827, #136 batches +2457, #130 gamepad +2125); 862 commits since 2026-07-18. Topdown was two chained specs; isometric was a spike plus two specs.
- The real version is 0.25.0 (`packages/engine/package.json:3`); `.sdd/project.md` still says 0.19.0.
- Issue #151 (open): WebGPU on headless Linux CI draws lighting/post frames blank.
- Two earlier grills deferred 3D explicitly: isometric ("decoupled from 3D/glTF") and particles ("GPU/3D particles" as a future block).

## Decisiones resueltas
1. **Target:** the trunk first — the 3D smoke test plus a `Model` component — as block 1 of the third-person archetype, which is also the base the 2.5D (meshes inside 2D scenes) needs. One spec. No 3D editor, no physics, no skeletal animation playback in this block.
2. **2D invariance:** does not matter. Pre-1.0: existing 2D may change if 3D improves the core. Any observable 2D change is listed in the migration note.
3. **Declaring 3D:** two knobs. `render.space: '3d'` changes the semantics (z is a world axis, real depth buffer, no layer bands and no y-sort). `camera.kind: 'perspective'` picks the projection. This block exercises only 3d + perspective; an orthographic 3D camera stays open without touching the format.
4. **Model:** loads glTF/glb by `src` (a `waica:` uri or a URL) and also primitives (`box | sphere | plane` with a color). The glb's animations load but are not played.
5. **3D light:** mirror of 2D. `render.lighting.ambient` is reused; a sun (directional) and point lights are components on entities. No cast shadows in this block. Names are decided by the spec (the glossary reserves "point light" and "lamp" for the 2D `Light`).
6. **`game.camera`:** the union `OrthographicCamera | PerspectiveCamera`, one or the other per loaded scene. Consumers narrow; Pointer, Anchored Pieces, spatial audio and the editor go through a `worldToScreen` helper.
7. **Transform JSON:** `position` accepts 2 or 3 numbers (2 stays valid, z=0). `rotation: [x, y, z]` in Euler degrees and `scale: [x, y, z]`, both optional, in scenes and prefabs.
8. **Assets:** `game.assets.model(uri)` beside `texture()`, with a cache and a `ModelBackend { load(url) }` seam parallel to `TextureBackend`. Assets Ready counts models. `ArchetypeArt.kind` gains `'model'`; the editor maps `.glb` and `.gltf` to it.
9. **3D camera in this block:** fixed. `camera: { kind: 'perspective', position, target, fov }`. Game code may move it. Follow and orbit belong to the archetype block.
10. **Pointer in 3D:** raycast against the meshes of every `Model` (glb and primitives); returns the entity and the hit point, nearest wins. User's decision; the recommendation was to defer picking.
11. **2D components in 3D scenes:** `validate_project` rejects the engine's 2D components under `space: '3d'` (Sprite, AnimatedSprite, Tilemap, Solid, DynamicBody, Hitbox, Light, ParticleEmitter; the closed list is fixed by the spec).
12. **Example:** `examples/smoke-3d` with Vite, `pnpm dev:3d`, one CC0 glb, primitives, `window.__waica.game`. A new leg in `pnpm test:e2e`: a snapshot with 3D transforms and a screenshot on both backends.
13. **Editor:** read-only for a 3D scene. The viewport draws it with the perspective camera (the same Game Play uses), no selection, drag or gizmos; the inspector and Play work. The editor compiles against the `game.camera` union by narrowing.
14. **One three:** alias `three → three/webgpu` in every bundler (examples, editor, bench, the project template) and in vitest, plus a test that asserts a single copy. Earlier projects that want `Model` add the alias; it goes in the migration note.
15. **Roadmap after this block:** simulation → animation → 3D editor → archetype. 2.5D stays a derived block without a date.

## Ramas pendientes
None inside this block. The following blocks are listed in the handoff.

## Handoff

### Topic and scope
Bring 3D into waica starting with the trunk shared by the 3D archetype and the 2.5D: scenes with a 3D space and a perspective camera, a `Model` component (glTF and primitives), 3D lights, models in `game.assets`, and a fourth example with an e2e leg. It pays the milestone-1 debt (DESIGN.md §8 item 6) and is block 1 of a five-block roadmap. One spec.

### Distance assessment (the question that started this grill)
This block is one spec away: the core is 3D-ready (entities are `THREE.Group`s, the snapshot carries x/y/z and rotation, WebGPU with node materials). What blocks it is the fixed orthographic camera, `z` doubling as draw order, and nothing loading glb. The complete third-person archetype is four more blocks, together about the size of the topdown, isometric and lighting efforts combined.

### Decisions
The fifteen above.

### Constraints and non-goals
- No 3D physics or collision, no clip playback, no editable 3D viewport, no archetype package, no follow or orbit camera, no shadows, no spot lights, no 2.5D coexistence rules, no migration of the three existing archetypes.
- No new dependency: `GLTFLoader` ships with three.
- Existing 2D scenes keep loading with no format change; the existing e2e legs stay green.
- The simulation is untouched: the fixed step (ADR 0014) and the Component Update Schedule stay as they are.

### Explicit assumptions
- Minor bump with a migration note, as #140 did. [inference: precedent of that grill's decision F1]
- The Runtime Snapshot exposes `space`, the perspective camera and the 3D lights; `validate_project` knows `Model`, the lights and their ranges (fov). [inference: precedent of #78 D1]
- A small CC0 glb exists for the example, with its license and an `ATTRIBUTION.md` as in the other archetypes. [inference: Kenney and Quaternius catalogs; verify in the spec]
- `THREE.Raycaster` from the webgpu build works on meshes with node materials. [inference: raycasting is geometric; verify with a test]
- three's own WebGPU examples alias `three` to the webgpu build through an importmap. [inference: by their importmap; confirm when writing the spec]
- Primitives: whether they are a mode of `Model` (`src` or `shape`, a discriminated union) or a separate `Mesh` component is the spec's call.

### Risks and deliberately deferred questions
- **#151:** the WebGPU e2e leg on headless Linux may draw a lit 3D frame blank, like lighting/post. The spec defines what that leg does until #151 is resolved.
- 3D light registry: extend `GameLighting` or a separate service; the spec decides.
- Camera Effects in 3D: Fade and Flash are HTML and work; Shake moves the camera's x/y. In 3D the spec decides whether it applies in camera axes or is a no-op.
- Names for the 3D light components (glossary conflict with the 2D `Light`).
- Bundle: `GLTFLoader` adds weight on top of the existing >500 kB warning.
- Transparency in 3D: three orders by distance; the sprite `alphaTest` does not apply.
- `.sdd/project.md` is stale (0.19.0 vs 0.25.0): refresh with `/sdd-init --update` before the spec.

### Pending blocks (order decided in decision 15)
1. **3D simulation:** collision and motor (Rapier vs hand-rolled, with a spike), determinism, 3D queries, navigation.
2. **Animation:** glTF clips through `AnimationMixer`; extract a `play(clip)` contract from StateMachine at `state-machine.ts:239, 259, 289`; a skeletal animation contract per state; facing in 3D.
3. **3D editor:** orbit viewport, raycast picking, move/rotate/scale gizmos, 3D inspector, grid.
4. **Third-person archetype:** follow/orbit camera, lockstep package (a row in `known-archetypes.ts`, the ~12 touchpoints from the isometric grill), CC0 glTF art, demo, MCP scaffold.
5. **Derived, undated:** 2.5D (Model inside 2D scenes: ordering under the orthographic camera, two light systems, 2D-viewport picking), orthographic 3D, shadows, spot lights.

### Recommended context for the spec session
- This handoff; `DESIGN.md:77-79, 120, 130`; `CONTEXT.md` (Render Backend, Assets Ready, Light, Ambient Light); ADRs 0019, 0020, 0025, 0026.
- Molds: `.sdd/grills/2026-10-03-issue-140-webgpu-renderer.md` (a migration with a note), `.sdd/grills/2026-10-03-issue-78-lighting-post.md` (lights in JSON + component + snapshot).
- Engine: `game.ts` (constructor, `renderSurface`, `resize`, `setSceneRender`, `setSceneCamera`), `camera.ts`, `scene.ts`, `entity.ts`, `pointer.ts`, `anchored-pieces.ts`, `assets/asset-loader.ts`, `assets/texture-backend.ts`, `render-sort.ts`, `render-layers.ts`, `lit-frame.ts`, `scene-lighting.ts`, `components/light.ts`, `runtime-inspection.ts`, `test-renderer.ts`, `archetype.ts`.
- Editor: `editor/viewport-game.ts`, `viewport-space.ts`, `Viewport.tsx`, `use-viewport-pointer.ts`, `use-project-art.ts`, `inspector/SceneInspector.tsx`, `inspector/CameraInspector.tsx`, `template/vite.config.ts`.
- MCP: `validation.ts`, the scene-render checks, `runtime-browser.ts`. Scripts: `runtime-e2e.mjs`, `test-dist.mjs`. Vite configs of `examples/*` and `packages/bench`; the root `vitest.config.ts`.
- Glossary terms to propose in the spec (this grill writes none): **Space** (`render.space`), **Model**, and the name chosen for the directional light.
