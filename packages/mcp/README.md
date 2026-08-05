# @waica/mcp

MCP server for developing Waica games with an agent. It operates on the user's plain project files over stdio while the agent keeps using its normal file-editing and shell tools.

## Connect

After the first coordinated Waica publish:

```bash
claude mcp add waica -- npx @waica/mcp
```

From this repository before publication:

```bash
pnpm build
claude mcp add waica -- node /absolute/path/to/waica/packages/mcp/dist/cli.js
```

Pre-publish caveat: @waica/* packages are not available from npm until the first coordinated Waica publish.

## `project_path` model

Every tool takes `project_path`, and it must be an **absolute path** to the user's game. An MCP stdio process is launched by an agent host, so its working directory does not identify the game project reliably. Relative paths are rejected rather than interpreted against the host's directory.

`create_project` expects a missing target whose parent already exists, or an empty directory. Every other tool expects a Waica project marked by `src/game.json` or `src/scenes/main.scene.json`.

## Tools

| Tool | Description |
|---|---|
| `create_project` | Create the 12-file project chassis, optionally with the playable archetype demo. |
| `list_components` | List installed component metadata and textual project-owned code paths. |
| `describe_archetype` | Describe the active or requested archetype manifest and other installed archetypes. |
| `project_summary` | Summarize scenes, prefabs, code, UI, stats and controls from plain files. |
| `validate_project` | Return machine-readable findings for all project scenes, prefabs and configuration. |
| `scaffold_component` | Create the editor-compatible TypeScript starter for a component. |
| `scaffold_role` | Create the editor-compatible TypeScript starter for a custom role. |
| `scaffold_state` | Create the editor-compatible state-code starter for a role and state. |
| `scaffold_ui` | Create the editor-compatible HTML starter for a UI piece. |

Scaffolds never overwrite an existing file. Project-owned TypeScript is listed and scanned textually but never executed.

## Editor coexistence

The MCP and editor both operate on the same files; there is no live bridge or file watcher in v1. Reload the project in the editor after agent edits. If the editor already has stale content open, saving it may overwrite the agent's changes, so coordinate which side is writing before saving.

## Creating a project before the first publish

`create_project` deliberately returns the normal next steps (`npm install`, then `npm run dev`), but those commands cannot resolve the unpublished `@waica/*` packages yet. For a repository-local pre-publish test, change the generated `package.json`'s three `@waica/*` versions to `workspace:^`, add the project to this pnpm workspace, and install from the repository root.
