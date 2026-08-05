# waica

The [waica](https://github.com/chichex/waica) editor, one command away:

```sh
npx @waica/cli
```

(The bare name `waica` is blocked by npm's name-similarity filter, so the
package lives under the author scope; the installed binary is still `waica`.)

That serves the editor at `http://localhost:5178` and opens your browser. From
there you can create a project from an archetype, drag entities around, edit
scenes and code, and play in place. Projects are saved straight to a folder on
your disk (Chromium browsers; elsewhere the editor runs in demo mode).

## MCP server

The same package serves the waica MCP server, so an agent can create projects,
introspect installed components, validate a project and write
editor-compatible scaffolds:

```sh
claude mcp add waica -- npx -y @waica/cli mcp
```

`waica mcp` speaks the Model Context Protocol on stdio and writes nothing else
to stdout. See [the server's
README](https://github.com/chichex/waica/blob/main/packages/mcp/README.md) for
the nine tools and the absolute `project_path` contract.

The `@waica/*` libraries a generated project depends on are published together
with this package, on the same version, so `npm install` inside a freshly
created project resolves them. The tools themselves never need that install —
the server answers from the copies bundled here.

## Options

| Flag | What it does |
| --- | --- |
| `--port <n>` | preferred port (default 5178; the next free one is used if taken) |
| `--no-open` | do not open the browser |
| `--version` | print the version |
| `--help` | show help |

The only positional argument is `mcp`.

## Behavior

- **Already running?** If the port is held by another waica instance (detected
  via its `/__waica.json` health endpoint), waica offers to stop it and take
  its place; if you decline — or there is no TTY — it reuses the running editor
  and just opens the browser. A port held by any other app falls back to the
  next free port.
- **Updates.** On start waica asks npm (1.5 s timeout, silent offline) whether
  a newer version exists. Global installs in an interactive terminal get an
  `update now? [y/N]` prompt that installs and restarts in place; under `npx`
  or without a TTY it prints the command to run instead.

## What's in the box

This package ships the pre-built editor (`dist/editor`), a tiny static server,
and the MCP server (`dist/mcp`) together with the `@waica` libraries it
introspects. Nothing phones home; everything runs locally.
