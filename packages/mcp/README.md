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
| `control_runtime` | Press, hold or release a semantic action; pause, resume or step simulation frames. |
| `capture_screenshot` | Capture the composited Game surface, including Waica HTML UI, as one PNG block. |

Scaffolds never overwrite existing files. `list_components` keeps project-owned TypeScript textual and does not execute it.

## Run Sessions

`start_project` validates the Project, package manager, installed dependencies and browser before starting resources. It invokes only `scripts.dev`, forces a loopback host and an MCP-allocated strict port, probes the emitted URL, installs the ephemeral Runtime Bridge before navigation, and waits for exactly one live `Game` plus an initial snapshot. `headless` defaults to true; `browser_executable_path`, viewport and timeout can be overridden.

A ready Run Session starts **paused** at frame 0 and simulation time 0. The Game surface and visible HTML UI remain rendered, but components, collisions, camera updates, callbacks and input end-of-frame work do not advance until `control_runtime` steps or resumes it.

- `press` is held for one simulation frame and releases automatically.
- `hold` stays down until `release`; repeated down operations do not create another edge.
- `step` defaults to one frame at `dt = 1/60` and accepts 1–600 frames with `0 < dt <= 0.1`.
- `resume` uses RAF-driven real time; `pause` returns to deterministic control without wall-clock catch-up.
- Only action names installed in the live Game bindings are accepted. Physical key codes, pointers and arbitrary DOM events are not exposed.

`inspect_runtime` returns stats plus live entities, stable opaque ids, transforms and safely projected component state. Filters are OR within `entity_ids`, `entity_names` or `component_types`, and AND across those categories. Projection is read-only and bounded; `Date`, `BigInt`, `Map` and `Set` have typed JSON representations, cycles/errors/truncation have `$waica` markers, and a component may provide `inspectState()`. There is no arbitrary JavaScript evaluation or runtime mutation tool.

`capture_screenshot` captures the canvas rectangle after browser compositing, so visible Waica HTML UI is included while unrelated full-page content and browser chrome are excluded. PNG bytes appear only in the MCP image block, never duplicated in text or structured metadata.

Full page reload reconnects to a fresh paused baseline. Runtime operations reject while reloading; a timeout, page/browser/dev-process failure or second simultaneous Game ends the session. `stop_project` and MCP transport close both clean every owned browser context and whole dev-process group; cleanup failure is reported rather than claimed as success.

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
