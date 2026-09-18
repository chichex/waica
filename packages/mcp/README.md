# @waica/mcp

MCP server for developing Waica games with an agent. It operates on a Project's plain files and can own a temporary browser-backed Run Session for deterministic runtime observation and control.

This package is private and is never published on its own. It ships inside `@waica/cli`, together with the built server and fallback `@waica/*` libraries.

## Connect

```bash
claude mcp add waica -- npx -y @waica/cli mcp
```

From this repository, against the built checkout:

```bash
pnpm build
claude mcp add waica -- node /absolute/path/to/waica/packages/cli/dist/cli.js mcp
```

## Prerequisites and trust boundary

All tools require Node 22.18 or newer. Runtime tools additionally require:

- macOS or Linux. `start_project` rejects Windows; the ten file-oriented tools continue to work there.
- The Project's dependencies already installed and its declared npm, pnpm, Yarn or Bun executable available.
- A compatible system Google Chrome or Chromium installation. The server uses `playwright-core`; it never downloads or bundles a browser.

`start_project` executes the trusted Project's declared `dev` script and loads the Project in a real browser. Trusted Project code runs with the user's normal local permissions; this is **not a sandbox**. The server never runs install, changes a lockfile, accepts an arbitrary command, or exposes a network control endpoint.

## `project_path` model

Every tool takes an absolute `project_path`. An MCP stdio process belongs to the agent host, so its working directory does not identify the Project reliably. Relative paths are rejected.

`create_project` expects a missing target whose parent exists, or an empty directory. File-oriented and runtime tools expect a Waica Project marked by `src/game.json` or `src/scenes/main.scene.json`. Run Sessions canonicalize real paths, so symlink aliases identify the same session. No public session id is exposed.

## Tools

| Tool | Description |
|---|---|
| `create_project` | Create the Project chassis, optionally with the playable archetype demo. |
| `list_components` | List installed component metadata and textual project-owned code paths. |
| `describe_archetype` | Describe the active or requested installed archetype manifest. |
| `project_summary` | Summarize scenes, prefabs, code, UI, stats and controls from plain files. |
| `validate_project` | Return machine-readable findings for every Project file and typed reference. |
| `scaffold_component` | Create the editor-compatible TypeScript starter for a component. |
| `scaffold_prefab` | Create an object, tile or character prefab without overwriting an existing file. |
| `scaffold_role` | Create the editor-compatible TypeScript starter for a custom role. |
| `scaffold_state` | Create state code for a role and state. |
| `scaffold_ui` | Create the editor-compatible HTML starter for a UI piece. |
| `start_project` | Start or reuse a browser-backed Run Session and return its paused initial Runtime Snapshot. |
| `stop_project` | Stop a Run Session and prove its browser, process group and loopback port are gone. |
| `inspect_runtime` | Read a filtered Runtime Snapshot without mutating the live Game. |
| `control_runtime` | Press, hold or release a semantic action; click the game canvas; pause, resume or step simulation frames. |
| `capture_screenshot` | Capture the composited Game surface, including Waica HTML UI, as one PNG block. |

Scaffolds never overwrite existing files. `list_components` keeps project-owned TypeScript textual and does not execute it.

## Run Sessions

`start_project` validates the Project, package manager, installed dependencies and browser before starting resources. It invokes only `scripts.dev`, forces a loopback host and an MCP-allocated strict port, probes the emitted URL, installs the ephemeral Runtime Bridge before navigation, and waits for exactly one live `Game` plus an initial snapshot. `headless` defaults to true; `browser_executable_path`, viewport and timeout can be overridden.

A ready Run Session starts **paused** at frame 0 and simulation time 0. The Game surface and visible HTML UI remain rendered, but components, collisions, camera updates, callbacks and input end-of-frame work do not advance until `control_runtime` steps or resumes it.

- `press` is held for one simulation frame and releases automatically.
- `hold` stays down until `release`; repeated down operations do not create another edge.
- `step` advances whole Simulation Steps of 1/60 s each: `frames` (1–600, default 1) says how many. There is no `dt` — the step size is an engine constant, so a request reproduces the same simulation everywhere — and a call that sends one is rejected by input validation naming `frames`. `simulationTime` is `frame × 1/60`, never a running sum.
- `resume` uses RAF-driven real time; `pause` returns to deterministic control without wall-clock catch-up.
- Only action names installed in the live Game bindings are accepted for `press`/`hold`/`release`. Physical key codes and arbitrary DOM events stay unexposed, but a primary-button click is: `{ operation: 'click', x, y }` (`x`/`y` are logical-space coordinates, not screen pixels) resolves through the engine's own Pointer — the same camera/letterbox/projection conversion and entity picking a real click on the canvas uses — and is queued the same way a press is, taking effect on the next stepped frame. A Project whose `@waica/engine` build predates this (no `click` in the Runtime Bridge's reported capabilities) gets `runtime-incompatible` instead of a silently ignored click.

`inspect_runtime` returns stats plus live entities, stable opaque ids, transforms and safely projected component state. Filters are OR within `entity_ids`, `entity_names` or `component_types`, and AND across those categories. Projection is read-only and bounded; `Date`, `BigInt`, `Map` and `Set` have typed JSON representations, cycles/errors/truncation have `$waica` markers, and a component may provide `inspectState()`. There is no arbitrary JavaScript evaluation or runtime mutation tool.

The snapshot also carries an `audio` section: `{ master, channels: { <name>: { volume, muted } }, playing: [{ uri, channel, scope }] }`, reporting the mixer's master volume, every channel's volume/mute (factory `music`/`sfx` plus any runtime-created channel, sorted by name), and every sound currently registered with the mixer, with its channel and `'scene' | 'session'` scope, sorted by uri then channel. Unlike the entity filters above, `audio` is emitted unconditionally — no section of the Runtime Snapshot is filterable except entities.

Read `playing` as "the mixer accepted these calls", not "these made sound". A sound enters the list when `play()` is called and leaves only once the backend reports it ended, so the list also carries a loop retained before the autoplay unlock (nothing has reached the audio device yet), a sound whose load has not resolved, and even one whose fetch is about to fail — that last one drops out a tick later. Under a Run Session the output is suspended for the session's whole life, so nothing in `playing` is ever audible there by construction; the list is still the only way to verify audio over the bridge.

Next to `audio`, the snapshot carries a `time` section: `{ pending, nextInSteps }` — `pending` counts every active `game.time` timer plus tween across both scopes, and `nextInSteps` is the smallest positive integer n such that `step { frames: n }` makes the next one run or complete, or `null` when `pending` is 0. That only holds while the Game is simulating: `step` runs zero Simulation Steps on a Game with `simulate === false`, so `nextInSteps` is still reported but never consumed by stepping in that case. Also emitted unconditionally, and present on entity-filtered snapshots too.

Next to `audio` and `time`, the snapshot carries a `ui` section: `{ shown, anchored }`. `shown` lists the screen-space UI pieces whose visibility flag is on, sorted by name. `anchored` lists every live Anchored Piece (`game.ui.attach`) in creation order as `{ piece, entity, x, y, clipped, values }`: `entity` is the anchor entity's name, kept while an instance given `seconds` outlives its destroyed entity; `x`/`y` are the whole CSS pixels the last render frame placed it at, measured from the top-left corner of the game viewport (inside any letterbox bars); `clipped` is true when its anchor point lies outside that viewport; and `values` holds only the instance's own values, after every `set`, bounded like component state (a string over 4 KiB becomes a `$waica: 'truncated'` marker; once every entity is cut, the 1 MiB snapshot cap drops instances from the end). With nothing attached, `anchored` is `[]`. An instance given `seconds` expires through a `game.time` timer, so it also counts in `time.pending` until it does. Also emitted unconditionally, and present on entity-filtered snapshots too.

`capture_screenshot` captures the canvas rectangle after browser compositing, so visible Waica HTML UI is included while unrelated full-page content and browser chrome are excluded. PNG bytes appear only in the MCP image block, never duplicated in text or structured metadata.

Full page reload reconnects to a fresh paused baseline. Runtime operations reject while reloading; a timeout, page/browser/dev-process failure or second simultaneous Game ends the session. `stop_project` and MCP transport close both clean every owned browser context and whole dev-process group; cleanup failure is reported rather than claimed as success.

## Collision-category validation

`validate_project` checks every authored `Hitbox` block in prefab props, inline scene components, changed instance overrides, and `public/waica.params.json`. Invalid `layer` values produce `invalid-collision-layer`; a non-list mask or invalid/non-string entry produces `invalid-collision-mask`; repeated exact entries produce the warning `duplicate-collision-mask-entry`. Empty masks and syntactically valid project-owned names are accepted. A scene instance does not repeat findings inherited from its prefab—the finding stays at the source that must be edited.

These authoring diagnostics complement the engine's quiet fail-closed runtime behavior. They do not create a layer registry, normalize values, or rewrite Project files. See `@waica/engine`'s Hitbox migration table before upgrading a Project that uses `Collectible`, `Hazard`, overlap `SceneTransition`, or the platformer example projectile.

## Animation clip validation

`validate_project` reports a `missing-clip` finding when a `StateMachine` state, or a component param declared `ref: 'clip'`, names an animation the sibling `AnimatedSprite` does not ship — a warning when the state falls back to its own name, an error when the clip is written out.

The check follows the active archetype's animation contract. Archetypes whose characters face more than one way (top-down, isometric) declare a `DirectionalAnimation`: their sheets are named `<state>-<dir>` and the engine resolves the plain state name at runtime. Under such a contract a clip counts as present when it resolves for **every** declared direction — mirrored facings and the contract's state fallbacks included, the same rule the archetype conformance suite applies to the shipped manifests. An archetype that declares no contract keeps the literal check: the name must be a key of the sheet.

One consequence is deliberate: a state that only resolves through a state fallback (`attack` degrading to `idle`) is accepted, so a character with no attack art is not reported here — it plays its idle instead.

## Sound reference validation

`validate_project` reports an error-severity `missing-sound` finding — symmetric with `broken-prefab-ref` — when a component param declared `ref: 'sound'` (e.g. `MeleeAttack.swingSound`, `Health.hurtSound`) names a uri that resolves to neither the active archetype's own declared sound art nor a `.ogg` file sitting **directly** in the project's `src/art/`. Both constraints are deliberate and match what the runtime can actually reach: the hosts glob `./art/*`, which never crosses a `/`, so a sound nested in a subfolder resolves to nothing and 404s; and a non-`.ogg` file would never decode as one. Validation refuses to bless either. An unset prop reports nothing. `describe_archetype`'s `art` entries each carry a `kind: 'image' | 'sound'`, so a caller can tell which of an archetype's stock-art uris are valid sound refs without inspecting file extensions.

## UI piece reference validation

`validate_project` reports a warning-severity `unknown-ui-piece` finding — the same code and severity as an unknown entry in a scene's `ui` list — when a component param declared `ref: 'ui'` (e.g. `Health.damageNumber`, `Health.healthBar`) names a piece with no `src/ui/<name>.html` file. An unset prop reports nothing. A piece that some prefab or scene component names this way is attached to an entity as an Anchored Piece, whose `{{bindings}}` may be the instance's own values rather than Game stats, so its bindings are not reported as `undeclared-stat`; every other piece's bindings still are.

## Project module execution during validation

The `validate_project` parent owns validation and executes each direct `.ts` entry under `src/components`, then `src/roles`, then `src/states` in its own short-lived OS child. Entries are sorted within each directory and attempted sequentially, with a five-second deadline per direct entry and no aggregate timeout. The child returns only typed-reference and update-scheduling metadata; constructors, instances and methods do not cross IPC. Every validation starts fresh children, so module scope executes again and helpers imported by multiple direct entries may execute once per entry.

Module-scope code still runs with the user's local permissions. This boundary is not a filesystem or network sandbox: trusted Project code can modify files, use the network, exhaust host resources or spawn descendants. Waica force-terminates and observes only the direct validation child on timeout, request cancellation or MCP shutdown; it does not own or clean descendants deliberately spawned by Project code.

One broken entry becomes a file finding and does not prevent later entries from contributing metadata:

- `component-load-failed` means the child timed out, exited abnormally or observed a runtime defect such as invalid syntax, a broken import or a module-scope throw.
- `component-load-unsupported` means valid browser-oriented code cannot be evaluated by Node's strip-only loader; it is informational.

## Editor coexistence

The MCP and editor can edit the same files, but Run Sessions execute standalone Projects and do not integrate with editor Play or editor file watching. Reload the editor after agent edits and coordinate saves so stale editor content does not overwrite external changes.

## Running a generated Project

`create_project` returns the normal next steps: `npm install`, then `npm run dev`. Generated dependencies use the same version as the CLI release. To run against uncommitted workspace libraries, place the Project in this pnpm workspace, change its `@waica/*` ranges to `workspace:^`, and install from the repository root.
