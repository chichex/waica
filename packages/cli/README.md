# waica

The [waica](https://github.com/chichex/waica) editor, one command away:

```sh
npx waica
```

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

## What's in the box

This package ships the pre-built editor (`dist/editor`) plus a tiny static
server — no dependencies, nothing phones home, everything runs locally.
