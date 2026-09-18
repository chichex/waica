# Grill — Issue #72 Anchored Pieces
<!-- Status: finalized. Project: /home/chiche/workspace/waica. Source: chichex/waica#72 "No world-space text: the UI layer cannot anchor anything to an entity". -->
<!-- SDD-Tracking: version=1; type=grill; state=finalized; issue=chichex/waica#72; grill=2026-09-18-issue-72-anchored-pieces; project=%2Fhome%2Fchiche%2Fworkspace%2Fwaica -->

## Mode

domain-modeling

## Verified facts

- **F1 — UI pieces are singletons by name.** `GameUi` (`packages/engine/src/ui.ts`) keeps one mounted `Piece` per name; `show('health')` mounts exactly one. Nothing can show five health bars from one piece.
- **F2 — Bindings are global.** `{{stat}}` resolves against `Game.stats`, a single map per Game. There is no per-entity or per-instance binding.
- **F3 — The overlay covers the whole host.** It mounts on the canvas parent with `position:absolute; inset:0; z-index:9000`. Under a `fixed` resolution the game renders into a letterboxed viewport (`Game.resize()`), and the overlay ignores it.
- **F4 — The overlay hides while not simulating.** `renderSurface()` calls `ui.setActive(this.simulate)`, so it is hidden in pause and in the editor's edit mode, while the three scene keeps rendering.
- **F5 — Render order and no post-render seam.** `renderSurface()` runs the isometric projection of every entity, then `applyYSort()`, then `renderer.render()`. The scene camera moves inside the Simulation Step (`updateSceneCamera`). Nothing lets project code run after projection and camera.
- **F6 — Y-sort seam.** `YSortParticipant` (`render-sort.ts`) exposes `layer` + `setSortZ(z)`; `Sprite` implements it.
- **F7 — No text rendering anywhere.** No `CanvasTexture`, `fillText` or troika in `packages/*/src`; the engine depends only on `three`. `DESIGN.md` once planned "SDF text (troika)".
- **F8 — Pixel art is only texture filtering.** `Sprite.pixelArt` sets `NearestFilter`; the renderer runs at `devicePixelRatio` with antialias; `pixelsPerUnit` is editor-only. There is no low-resolution framebuffer.
- **F9 — The workaround.** `Interactable` publishes its line through the `npcLine` stat and shows the fixed bottom-centre `npc-line` piece, scene-scoped (`interactable.ts`). `ClickToMove` shows the same piece on arrival (`click-to-move.ts:261`).
- **F10 — Damage signal and death timing.** `Health.damage()` emits `damage { entity, amount, current, source }` before `die()`. Without a death state, `die()` destroys the entity in the same step as the killing blow, before any render.
- **F11 — Screenshots include the overlay; snapshots have no UI.** `capture_screenshot` takes a page screenshot clipped to the canvas rect (`runtime-browser.ts`), so HTML overlay pixels are captured. The Runtime Snapshot has no UI section.
- **F12 — Component registration.** Components authored in JSON are registered in each archetype's `registry-data.ts` (three registries).
- **F13 — Domain artifacts.** `CONTEXT.md` and ADR-0001 through ADR-0017 are maintained. During this grill `CONTEXT.md` gained **UI Piece** and **Anchored Piece**.
- **F14 — Projects own copies of their pieces.** Project creation (`editor/src/project/template.ts`) and `scripts/sync-scene.mjs` write the archetype's `registry.ui` into `src/ui/*.html`; the game loads those files (`examples/*/src/main.ts`). An existing project carries its own `npc-line.html` with bottom-centre CSS.
- **F15 — Interact bindings.** `interact` is bound in the project's `controls.json` (`["KeyE", "Space"]` in the topdown and isometric examples) and is user-editable.
- **F16 — Who uses Health and Interactable.** `Health` is registered in all three archetypes; in the demos the player, the platformer slime and the isometric orc carry it. `Interactable` is registered in topdown and isometric.
- **F17 — Examples are materialized from their archetype.** `scripts/sync-scene.mjs` writes each archetype's scene, prefabs and `registry.ui` into its example. `INTERACTABLE_UI` is shared by the topdown and isometric archetypes.
- **F18 — Param reference precedent.** `Health.stat` and `Health.hurtSound` are string params where `''` means off, declared with `ref: 'stat' | 'sound'`. The `ref` union (`component.ts`) is `'prefab' | 'stat' | 'action' | 'clip' | 'sound'`; the MCP validates references (`param-reference-resolution.ts`) and the editor offers pickers (`ref-targets.ts`). The MCP already warns `unknown-ui-piece` for a scene `ui` list entry.

## Resolved decisions

1. **Approach.** Anchored HTML: extend `GameUi` so a piece can follow an entity. A world-space `Text` component rendered in the three scene is out of scope.
2. **Instances.** Every `game.ui.attach(piece, entity, options)` call creates a new instance and returns a handle. Several instances of one piece can coexist on one entity or on many. Screen-space pieces keep their singleton model.
3. **Offset.** The anchor offset is in world units, applied in render space: "up" is up on screen, under isometric projection too. Pixel fine-tuning belongs in the piece's CSS.
4. **Zoom.** Anchored pieces keep their CSS pixel size. The engine publishes a `--waica-unit` custom property (CSS pixels per world unit) so a piece can size itself in world units.
5. **Clipping.** Anchored instances live in a layer clipped to the game viewport rectangle; they never draw over letterbox bars. Screen-space pieces are unchanged.
6. **Per-instance data.** An instance carries its own values. `{{name}}` resolves from the instance's values first, then from the Game's stats. `handle.set(name, value)` updates it live. The binding language gains no expressions.
7. **Lifetime.** An instance dies with its entity. An instance created with `seconds` removes itself after that much Game Time and, if its entity dies first, lingers frozen at the entity's last anchor point until then. Every instance dies when its scene unloads.
8. **Draw order.** The anchored layer draws below every screen-space piece. Among anchored instances, the one whose entity is lower on screen draws on top, matching y-sort.
9. **Term.** The concept is an **Anchored Piece**. `CONTEXT.md` defines **UI Piece** and **Anchored Piece**.
10. **Authoring.** Code API only. No declarative JSON component and no follow-up issue for one; static signs and name tags stay out.
11. **Adoption.** Four behaviors adopt Anchored Pieces in this issue: the `Interactable` speech bubble, the `Interactable` interact prompt, `Health` floating damage numbers and a `Health` health bar.
12. **Values as CSS.** Every instance value is also published as a custom property on the instance root (`values { hp: 7, max: 10 }` gives `--hp: 7` and `--max: 10`), so a bar can use `width: calc(var(--hp) / var(--max) * 100%)`.
13. **Snapshot.** The Runtime Snapshot gains `ui: { shown: [...], anchored: [{ piece, entity, x, y, clipped, values }] }`, with `x`/`y` in CSS pixels inside the game rectangle.
14. **Compatibility.** The bubble is a new piece, `npc-bubble`. When the project defines it, the line is shown anchored to the NPC; when it does not, `Interactable` falls back to today's fixed `npc-line`.
15. **Bubble and prompt.** Entering an Interactable's radius shows the prompt over the nearest NPC only. Interacting replaces the prompt with the bubble. Leaving every radius removes both.
16. **Prompt key.** The prompt receives a `key` value derived from the first code bound to `interact` (`KeyE` gives `E`, `Space` gives `Space`); the piece says `Press {{key}}`.
17. **Opt-in (delegated to the agent: "whatever is most consistent").** Each behavior follows its own precedent. `Interactable` uses fixed piece names (`npc-bubble`, `interact-prompt`) enabled by the project defining them, like `npc-line` today and consistent with decision 14. `Health` gains params that name a piece, like `stat` and `hurtSound`: `damageNumber` and `healthBar`, `''` meaning off. They are declared with a new `ref: 'ui'` kind, so MCP validation and the editor picker treat them like `sound` and `stat`. All-by-presence was discarded because it would show damage numbers on the player (decision 19); all-by-params was discarded because it contradicts decision 14's presence-based fallback.
18. **Health bar visibility.** Hidden at full health. It appears on the first damage, updates live, hides again after a full heal and is removed at death.
19. **Demos.** Isometric: bubble and prompt on the villager; damage numbers and health bar on the orc. Platformer: damage numbers and health bar on the slime. No demo turns them on for the player.

## Pending branches

None inside issue #72.

## Handoff

### Scope

Add Anchored Pieces to `@waica/engine`'s `GameUi`: instances of a UI Piece that follow an entity, carry their own values and live in a viewport-clipped layer below screen-space pieces. Adopt them in `@waica/behaviors` (`Interactable` bubble and prompt, `Health` damage numbers and health bar), add a `ui` section to the Runtime Snapshot, add a `ref: 'ui'` param reference kind, and turn the features on in the isometric and platformer demos.

```ts
const hit = game.ui.attach('damage-number', orc, { offset: [0, 1.2], seconds: 0.8, values: { amount: 3 } })
const bar = game.ui.attach('health-bar', orc, { offset: [0, 1.4], values: { hp: 7, max: 10 } })
bar.set('hp', 6) // {{hp}} and --hp update live
```

```html
<style>
  .bar { width: calc(var(--waica-unit) * 1px); height: 3px; background: #0008 }
  .fill { width: calc(var(--hp) / var(--max) * 100%); height: 100%; background: #ef476f }
</style>
<div class="bar"><div class="fill"></div></div>
```

### Restrictions and non-goals

- No text rendered in the three scene: no SDF, no bitmap font, no troika dependency.
- No declarative Anchored Piece component and no static signs or name tags.
- The screen-space piece API (`show`, `hide`, `toggle`, `element`, `define`) and its singleton model do not change.
- Anchored Pieces are not visible in the editor's edit mode.
- No pixel-grid alignment with pixel-art sprites.
- The player gets no damage numbers or health bar in any demo.
- Repo policies apply: no touched `.ts` file above 950 lines (`game.ts` is at 743, so the new logic belongs in its own module), tests in the same package as new `src` files, kebab-case file names, no `any`, `@ts-ignore`, `enum` or `export default` in new lines.

### Explicit assumptions

- **S1 — Frame timing.** Anchor positions are computed once per render frame inside `renderSurface()`, after the isometric projection and with the camera already stepped, just before `renderer.render()`; never per Simulation Step. Under the Runtime Bridge this makes them frame-exact.
- **S2 — Whole pixels.** Screen positions are rounded to whole CSS pixels to avoid subpixel shimmer.
- **S3 — Hidden while not simulating.** Anchored Pieces hide with the rest of the overlay in pause and edit mode.
- **S4 — Game Time.** `seconds` counts Game Time through `game.time` (ADR 0017): a paused Game freezes a damage number mid-flight.
- **S5 — Invalid attach.** Attaching to a dead entity or attaching an undefined piece logs a `[waica]` warning and returns an inert handle, mirroring the invalid-input rule of issue #71.
- **S6 — `--waica-unit` freshness.** It is recomputed every frame and reflects both camera zoom and the letterbox scale.
- **S7 — `npcLine` survives.** `Interactable` keeps publishing the `npcLine` stat on both the bubble and the fallback path; the bubble receives the line as its `line` value.
- **S8 — ClickToMove parity.** The arrival interaction in `click-to-move.ts` takes the same bubble-or-fallback path as the interact key.
- **S9 — Topdown inherits.** The topdown archetype and example inherit `npc-bubble` and `interact-prompt` through the shared `INTERACTABLE_UI` and `sync-scene`. Decision 19 only chooses where browser e2e coverage extends; topdown gets unit coverage only.
- **S10 — Health pieces ship everywhere.** `damage-number` and `health-bar` ship in all three archetypes' `registry.ui` (Health is in all three), so a new project can turn them on; only decision 19's demo prefabs do.
- **S11 — No number without damage.** Hits rejected during invulnerability show no damage number; heals show none.
- **S12 — Exact API shape.** The handle's exact members (e.g. `set`, `remove`, `element`, `alive`), option names and the damage number's default duration are for the spec.

### Risks and deliberately deferred questions

- **R1 — Per-frame DOM cost.** Every anchored instance is a shadow root repositioned each frame. Fine at demo scale; pooling belongs to #77.
- **R2 — No layout in happy-dom.** Unit tests assert the computed projection math; real placement and clipping are proven by the browser e2e and screenshots.
- **R3 — Nearest NPC changes mid-conversation.** Recommended default: an open bubble is removed when its NPC stops being the nearest in range. The spec decides.
- **R4 — Always above the world.** A label behind a tree draws over it; accepted with decision 1.
- **Deferred:** a world-space `Text` component in three. No follow-up issue was decided.

### Recommended context for the spec session

- Issue #72 and this handoff.
- `CONTEXT.md`: UI Piece, Anchored Piece, Session-scoped, Game Time, Logical Coordinates.
- ADR 0009 (logical coordinates), ADR 0011 (one scene at a time, UI scope), ADR 0017 (timers die with their scene).
- `packages/engine/src/ui.ts`, `game.ts` (`renderSurface`, `resize`), `pointer.ts` (the inverse screen-to-world mapping, letterbox aware), `projection.ts`, `component.ts` (`ref` union), `runtime-inspection.ts`.
- `packages/behaviors/src/interactable.ts`, `click-to-move.ts`, `health.ts`.
- `packages/mcp/src/param-reference-resolution.ts`, `packages/mcp/src/validation.ts`, `packages/editor/src/editor/ref-targets.ts`, `packages/mcp/README.md` and `packages/cli/README.md` (snapshot docs), `scripts/runtime-e2e.mjs`.
- `packages/archetype-*/src/ui.ts`, `scripts/sync-scene.mjs`.
