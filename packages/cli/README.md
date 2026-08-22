# waica

The [waica](https://github.com/chichex/waica) editor, one command away:

```sh
npx @waica/cli
```

The package is scoped because the bare npm name is unavailable; its installed binary is still `waica`. The command serves the editor at `http://localhost:5178` and opens a browser. Projects are plain files saved directly to a selected folder.

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

### Runtime prerequisites and security

Runtime tools support macOS and Linux; `start_project` rejects Windows while the ten static/scaffold tools remain available. They require already installed Project dependencies, the Project's declared npm/pnpm/Yarn/Bun executable and a compatible system Google Chrome or Chromium. This package depends on `playwright-core`, which does not download or bundle a browser.

`start_project` executes trusted Project code and its declared `scripts.dev` with normal local user permissions. It is **not a sandbox**. It never installs dependencies, mutates lockfiles or accepts an arbitrary shell command.

A Run Session starts paused at frame 0. `control_runtime` can queue action names and step exact frames, or resume RAF-driven real time and pause again without catch-up. `inspect_runtime` is read-only and returns bounded stats/entity/component state; `capture_screenshot` includes visible HTML UI without duplicating base64 into metadata.

`stop_project` and MCP transport close both clean all browser and dev-process resources owned by the server. A reload reconnects to a fresh paused Game; failures terminate and clean the session.

## Editor options

| Flag | What it does |
|---|---|
| `--port <n>` | Preferred editor port (default 5178; the next free one is used if occupied). |
| `--no-open` | Do not open the editor in a browser. |
| `--version` | Print the version. |
| `--help` | Show help. |

The only positional argument is `mcp`.

## Editor behavior

- **Already running?** If the selected port belongs to another Waica editor, an interactive process can stop and replace it. Without a TTY it reuses that editor. A port held by another application falls back to the next free port.
- **Updates.** Startup performs a short, offline-tolerant npm version check. Interactive global installs can update in place; npx and non-interactive runs print the update command instead.

## What's in the box

The published CLI contains the pre-built editor (`dist/editor`), its static server, the built MCP server (`dist/mcp`) and vendored published-shape copies of `@waica/engine`, `@waica/behaviors`, `@waica/archetype-platformer`, `@waica/archetype-topdown` and `@waica/archetype-isometric`. Normal package installation supplies `@modelcontextprotocol/sdk`, `playwright-core`, `three` and their transitive dependencies. No browser binary is bundled and nothing phones home.
