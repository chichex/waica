# waica

The [waica](https://github.com/chichex/waica) editor, one command away:

```sh
npx @chichex/waica
```

(The bare name `waica` is blocked by npm's name-similarity filter, so the
package lives under the author scope; the installed binary is still `waica`.)

That serves the editor at `http://localhost:5178` and opens your browser. From
there you can create a project from an archetype, drag entities around, edit
scenes and code, and play in place. Projects are saved straight to a folder on
your disk (Chromium browsers; elsewhere the editor runs in demo mode).

## Options

| Flag | What it does |
| --- | --- |
| `--port <n>` | preferred port (default 5178; the next free one is used if taken) |
| `--no-open` | do not open the browser |
| `--version` | print the version |
| `--help` | show help |

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

This package ships the pre-built editor (`dist/editor`) plus a tiny static
server — no dependencies, nothing phones home, everything runs locally.
