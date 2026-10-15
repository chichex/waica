# waica

The [waica](https://github.com/chichex/waica) editor, one command away:

```sh
npx @waica/cli
```

The package is scoped because the bare npm name is unavailable; its installed binary is still `waica`. The command serves the editor at `http://localhost:5178` and opens a browser. Projects are plain files saved directly to a selected folder.

Waica is pre-1.0: a minor release may break projects created with the previous one, and individual breaks are not announced until 1.0.

## MCP server

The same package includes the Waica MCP server:

```sh
claude mcp add waica -- npx -y @waica/cli mcp
```

`waica mcp` speaks MCP on stdio and writes no protocol-external output to stdout. Every tool requires an absolute `project_path`.

| Tool | Description |
|---|---|
| `create_project` | Create a demo or blank Waica Project. |
| `list_components` | List installed and project-owned component information. |
| `describe_archetype` | Describe an installed archetype. |
| `project_summary` | Summarize a Project's plain files. |
| `validate_project` | Return structured validation findings. |
| `scaffold_component` | Create a component starter. |
| `scaffold_prefab` | Create an object, tile or character prefab starter. |
| `scaffold_role` | Create a custom role starter. |
| `scaffold_state` | Create state code for a role. |
| `scaffold_ui` | Create an HTML UI-piece starter. |
| `start_project` | Start or reuse a browser-backed Run Session at a paused frame-zero baseline. |
| `stop_project` | Stop a Run Session and clean its browser, process group and port. |
| `inspect_runtime` | Read a filtered live Runtime Snapshot. |
| `control_runtime` | Inject semantic actions or pause, resume and step simulation frames. |
| `capture_screenshot` | Return a PNG of the composited Game canvas and Waica HTML UI. |

See the [MCP README](https://github.com/chichex/waica/blob/main/packages/mcp/README.md) for schemas, result contracts and projection limits.

`validate_project` follows the active archetype's animation contract: under a `DirectionalAnimation` (top-down, isometric) a clip counts as present when it resolves for every declared direction, mirrors and state fallbacks included, instead of being matched literally against the sheet. It also reports an error-severity `missing-sound` finding, symmetric with `broken-prefab-ref`, when a `ref: 'sound'` param (`MeleeAttack.swingSound`, `Health.hurtSound`) names a uri that is neither the active archetype's own declared sound art nor a `.ogg` file directly in the project's `src/art/` — not recursive, and not other extensions, because the hosts glob `./art/*` and a sound in a subfolder would 404 at runtime; `describe_archetype`'s `art` entries each carry `kind: 'image' | 'sound'` so a caller can tell them apart. A `ref: 'ui'` param (`Health.damageNumber`, `Health.healthBar`) naming a piece with no `src/ui/<name>.html` is a warning-severity `unknown-ui-piece`, and the `{{bindings}}` of a piece named that way, or of a stock Anchored Piece (`npc-bubble`, `interact-prompt`, `damage-number`, `health-bar`), are not reported as undeclared stats, since an Anchored Piece may bind its own values.

### Runtime prerequisites and security

Runtime tools support macOS and Linux; `start_project` rejects Windows while the ten static/scaffold tools remain available. They require already installed Project dependencies, the Project's declared npm/pnpm/Yarn/Bun executable and a compatible system Google Chrome or Chromium. This package depends on `playwright-core`, which does not download or bundle a browser.

`start_project` executes trusted Project code and its declared `scripts.dev` with normal local user permissions. It is **not a sandbox**. It never installs dependencies, mutates lockfiles or accepts an arbitrary shell command.

A Run Session starts paused at frame 0, and — when the Project's `@waica/engine` reports the `assets` Runtime Bridge capability — only once the booted scene's textures are Assets Ready (`assets.pending === 0`); `control_runtime` with `operation: 'scene'` and `capture_screenshot` wait the same way, bounded by the session timeout, and every runtime result carries `assets: { pending, loaded, failed }` (absent for an older engine, which never waits). `control_runtime` can queue action names and step exact frames, or resume RAF-driven real time and pause again without catch-up. `inspect_runtime` is read-only and returns bounded stats/entity/component state plus an unconditional `audio` section (`{ master, channels: { <name>: { volume, muted } }, playing: [{ uri, channel, scope }] }`, sorted deterministically — `playing` means "the mixer accepted these calls", not "these were audible": a Run Session keeps the output suspended throughout, and the list also carries loops retained before the autoplay unlock and sounds still loading) and an unconditional `time` section (`{ pending, nextInSteps }`, next to `audio`): `pending` counts active `game.time` timers plus tweens across both scopes, and `step { frames: nextInSteps }` makes the next one run or complete (`null` when nothing is pending) — that only holds while the Run Session is simulating, since `step` runs zero Simulation Steps on a Game with `simulate === false`; next to `audio` and `time`, an unconditional `ui` section (`{ shown, anchored }`) lists the visible screen-space UI pieces by name in `shown`, and in `anchored` every live Anchored Piece (`game.ui.attach`) in creation order as `{ piece, entity, x, y, clipped, values }` — `x`/`y` are whole CSS pixels inside the game viewport, `clipped` flags an anchor point outside it, and `values` holds the instance's own values, bounded like component state (a string over 4 KiB becomes a `$waica: 'truncated'` marker); `capture_screenshot` includes visible HTML UI without duplicating base64 into metadata.

`stop_project` and MCP transport close both clean all browser and dev-process resources owned by the server. A reload reconnects to a fresh paused Game; failures terminate and clean the session.

## Desktop export

`waica export desktop` packages a Project as an Electron app, one folder and one `.zip` per platform, ready for Steam, itch.io or Epic:

```sh
cd my-game && npm install
npx @waica/cli export desktop .                       # linux, win32 and darwin
npx @waica/cli export desktop . --platform linux,win32
```

It runs the Project's own `vite build` and writes `export/<name>-linux-x64/`, `<name>-win32-x64/` and `<name>-darwin-arm64/`, each with its `.zip`, into the Project (or `--out <dir>`). Re-exporting one platform replaces only that platform's folder and zip. The app's name and version come from the Project's `package.json` (`--name` overrides the name), its icon is `--icon <png>`, else `src/art/icon.png`, else waica's own. The window opens at `game.json`'s `resolution` times `desktop.scale` (2 by default), `desktop.fullscreen` opens it fullscreen, and F11 or Alt+Enter toggles it. The game reaches the app through `game.quit()`, `game.canQuit`, `game.setFullscreen()` and `game.isFullscreen()` (see the engine README). With Steam declared in `game.json` (`"desktop": { "steam": { "appId": 480, "achievements": ["first-kill"], "stats": ["kills"] } }`) or `--steam-app-id <n>`, the export installs `steamworks.js` 0.4.0 into the app (this needs the network) and writes `steam_appid.txt`; the game's `game.achievements` then reaches Steam for the declared ids, and runs without achievements when no Steam client is running. `--no-steam` leaves Steam out, for itch.io for example. Builds are unsigned: see [the signing and store guide](https://github.com/chichex/waica/blob/main/docs/desktop-export.md). The first export of each platform downloads that platform's Electron zip into Electron's cache.

## Editor options

| Flag | What it does |
|---|---|
| `--port <n>` | Preferred editor port (default 5178; the next free one is used if occupied). |
| `--no-open` | Do not open the editor in a browser. |
| `--version` | Print the version. |
| `--help` | Show help. |

The only commands are `mcp` and `export desktop`.

## Editor behavior

- **Already running?** If the selected port belongs to another Waica editor, an interactive process can stop and replace it. Without a TTY it reuses that editor. A port held by another application falls back to the next free port.
- **Updates.** Startup performs a short, offline-tolerant npm version check. Interactive global installs can update in place; npx and non-interactive runs print the update command instead.

## What's in the box

The published CLI contains the pre-built editor (`dist/editor`), its static server, the desktop export with its Electron shell (`dist/export-desktop`) and default icon (`assets/`), the built MCP server (`dist/mcp`) and vendored published-shape copies of `@waica/engine`, `@waica/behaviors`, `@waica/archetype-platformer`, `@waica/archetype-topdown`, `@waica/archetype-isometric` and `@waica/archetype-third-person`. Normal package installation supplies `@modelcontextprotocol/sdk`, `playwright-core`, `three`, `@electron/packager`, `png2icons`, `yazl` and their transitive dependencies. No browser binary is bundled and nothing phones home.
