# AGENTS.md — waica

How to build, run, test and verify this repository, and what never happens without a
person. Code rules are in [docs/coding-policies.md](./docs/coding-policies.md); the
domain glossary is [CONTEXT.md](./CONTEXT.md); decisions are in [docs/adr/](./docs/adr/);
the product vision is [DESIGN.md](./DESIGN.md). Code, comments, docs and commit
messages are written in English.

## Stack

TypeScript (tsc 7) end to end, in a pnpm monorepo (`pnpm@11.4.0`, Node `>=22.18`;
CI runs Node 22). Sixteen workspace projects: the root, eleven under `packages/` and
four under `examples/`.

| Package | What it is |
|---|---|
| `packages/engine` | The engine: entities and components, fixed 1/60 s Simulation Steps, scenes, collisions and physics (Rapier in 3D, loaded on demand), state machines, animation, audio, input, the Runtime Bridge and rendering through three.js `WebGPURenderer` (WebGPU, with a WebGL2 fallback). |
| `packages/behaviors` | Motors, roles, combat, interaction, grid navigation, point-and-click, checkpoints. |
| `packages/archetype-{platformer,topdown,isometric,third-person}` | The four archetypes: manifest, prefabs, controls, art and demo scene. |
| `packages/editor` | The browser editor (React 19, Vite, Monaco). Owns the project template. |
| `packages/mcp` | A stdio MCP server: file tools (create, introspect, validate, scaffold, configure desktop) and browser-backed Run Session tools. `src/known-archetypes.ts` lists the archetypes it can bundle. |
| `packages/cli` | The `waica` binary (`@waica/cli`): serves the editor, bundles the MCP server and the public libraries, and `waica export desktop` packages a Project as an unsigned Electron app ([guide](./docs/desktop-export.md)). |
| `packages/lint` | Private ESLint 9 toolchain, on a lint-only TypeScript 6. Never published. |
| `packages/bench` | Private render and spawn benchmark. Never published. |
| `examples/*` | One Vite example per archetype. |

Seven packages publish together at one version: `@waica/cli`, `@waica/engine`,
`@waica/behaviors` and the four `@waica/archetype-*`. `@waica/editor` and `@waica/mcp`
are private and carry the same version because they ship inside the CLI.

Tests use Vitest 5 and happy-dom from the repository root; editor tests use Testing
Library under StrictMode.

## Commands

Every command runs from the repository root. A fresh clone or Git worktree needs
`pnpm install` first.

| Action | Command | Notes |
|---|---|---|
| Install | `pnpm install` | CI uses `pnpm install --frozen-lockfile`. |
| Typecheck | `pnpm typecheck` | `tsc --noEmit` in every workspace project. A few seconds. |
| Lint | `pnpm lint` | ESLint over `packages/*/src`, `examples/*/src` and `scripts/`. Exit 0 means no errors and no new warnings against `packages/lint/lint-baseline.json`. About 20 s. |
| Unit and component tests | `pnpm test` | Vitest, deterministic and network-free. About 20–30 s. Add a path to run one file: `pnpm test packages/engine/src/point-shadow.test.ts`. |
| Build | `pnpm build` | Cleans and builds the libraries, the editor, the examples, the MCP server and the CLI. Vite's >500 kB chunk warnings are informational. |
| Published-package shape | `pnpm test:dist` | Builds, then checks source/dist parity, the packed packages, plain Node imports, the packed CLI over stdio and a packed browser Run Session. Needs system Chrome. |
| Scripted browser e2e | `pnpm test:e2e` | Builds, then drives the CLI over real MCP stdio and system Chrome, once per Render Backend (WebGL2 and WebGPU). `--group <name>` (repeatable: `core`, `third-person`, `third-person-combat`, `third-person-respawn`, `shadows`, `editor`) runs part of it; `--webgpu-shadows` adds the strict WebGPU shadow suites. A missing browser is a failure, never a skip. Minutes, not seconds. |
| Desktop export smoke | `pnpm test:desktop` | Exports two Projects with `waica export desktop` and drives the packaged app through Electron. `--cross` exports all three platforms, `--steam` adds the Steamworks leg. Needs the network for the Electron zips. |
| Editor | `pnpm editor` | Vite dev server; ready when its printed URL answers HTTP 200. |
| Examples | `pnpm dev`, `pnpm dev:topdown`, `pnpm dev:isometric`, `pnpm dev:third-person` | Platformer, top-down, isometric and third-person. Vite dev servers. |
| Benchmark | `pnpm bench` | Linux only (`--local` overrides the macOS refusal). `--backend=webgl2\|webgpu\|both`, `--check` compares counters with `packages/bench/baselines/`, `--update-baseline` rewrites them, `--gpu` renders on the host GPU. Not part of CI. |
| Benchmark on the Linux host | `WAICA_BENCH_HOST=chichex-linux pnpm bench:remote` | Same flags. Runs at the current commit, which must be pushed. |
| Release | push a `vX.Y.Z` tag | See [.claude/skills/publish/SKILL.md](./.claude/skills/publish/SKILL.md). Never from a laptop: `pnpm release` refuses on purpose. A person does this. |

Practical notes:

- The MCP's `list_components` tests and the third-person `create_project` and
  `validate_project` tests read built `dist` directories. After adding an engine
  component, run `pnpm build` before `pnpm test`.
- Two timing assertions can miss under full-suite load on a many-core machine without
  built `dist`s (`packages/mcp/src/project-component-process.test.ts` and the 1 MiB
  lighting snapshot test). They pass with built `dist`s and with
  `pnpm test --maxWorkers=4`, which is close to CI.

## Environments

- **Local only.** There is no staging or production service, database, queue, `.env`
  file or secret. `import.meta.env.DEV` (from Vite) is the only environment lookup.
- **Browser.** `pnpm test:e2e` and the browser leg of `pnpm test:dist` need a system
  Google Chrome or Chromium from the fixed macOS/Linux list in
  `scripts/runtime-e2e.mjs`; `playwright-core` downloads none.
- **DEV hooks.** In DEV the examples expose `window.__waica.game` and the editor exposes
  `window.__waicaEditor` (`openMemoryProject`, `readText`, `viewportGame`) for
  browser-driven checks. Production builds drop them.
- **Benchmark host.** `chichex-linux`, reached over SSH in batch mode: Linux x86_64,
  8 cores, Chrome 150.0.7871.186, pnpm in `~/.local/bin`. It renders WebGL2 with
  SwiftShader by default and reaches its NVIDIA GPU with `--gpu`. `pnpm bench:remote`
  runs in its dedicated clone `~/waica-bench`, never in other checkouts. The committed
  baselines come from there. It is not a CI runner.
- **CI.** `.github/workflows/ci.yml` runs on every pull request against `main` (Ubuntu,
  Node 22): typecheck, lint and tests; `test:dist` and `pnpm audit --audit-level high`;
  `test:e2e` as one job per group; `test:desktop` on Ubuntu, Windows and macOS. The
  `verify` job aggregates them and is the required check. A pull request whose base is
  not `main` runs none of it. `publish.yml` runs only on release tags.
  `claude-review.yml` is an on-demand review. Dependabot proposes npm and Actions
  updates weekly.
- **Git.** Default branch `main`, remote `origin` = `github.com/chichex/waica`. Pull
  requests land as merge commits and merged branches are deleted.

## How to verify

From cheapest to strongest:

1. `pnpm typecheck`.
2. `pnpm lint`.
3. `pnpm test`: the main seam for engine, behavior, editor and MCP behavior.
4. `pnpm build`.
5. `pnpm test:dist`: the packed packages behave like the published ones.
6. `pnpm test:desktop`: the exported desktop app starts, reads its parameters and quits.
7. `pnpm test:e2e`: the scripted browser e2e, with real Chrome and deterministic Run
   Sessions (movement, collision, combat, audio, scene swaps, screenshots, the
   third-person demo, the editor's 3D view).
8. A live smoke: start the editor or an example and drive it through its DEV hook.

Known limits:

- On the Linux benchmark host (Chrome 150.0.7871.186, `--enable-unsafe-webgpu`) the
  WebGPU leg of `pnpm test:e2e` fails in the top-down leg (issue #262); the WebGL2 leg
  passes. CI runs both legs.
- There are no WebGPU benchmark baselines.
- Game feel, art direction and anything on npm cannot be verified by a script.

## Code rules

- [docs/coding-policies.md](./docs/coding-policies.md) holds the coding policies.
  `pnpm lint` runs every MUST rule that names a lint rule at `error` and every SHOULD
  rule at `warn`, held by a per-file, per-rule ratchet
  (`packages/lint/lint-baseline.json`): a change may remove warnings, never add them.
  `packages/lint/README.md` maps each policy line to its rule.
- New lines in `packages/*/src` and `examples/*/src` `.ts` files (tests and `.d.ts`
  excepted) add no `any`, `as any`, `@ts-ignore`, `@ts-expect-error`, `export default`
  or `enum`.
- A package that adds a new `.ts` file under `src/` adds or changes a `.test.ts` in the
  same package.
- No `.ts` or `.tsx` file goes over 950 physical lines.
- New files under `src/`: `.ts` in kebab-case; `.tsx` in PascalCase or kebab-case.
- Editor `.tsx` files: at most 100 hex colors outside the stylesheet's tokens and at
  most 3 inline `style={{`. Colors belong in `packages/editor/src/styles.css`.

## Never without a person

- Publishing to npm. Pushing a `v*` tag publishes the seven packages; `pnpm release`
  refuses on purpose.
- Pushing to `main`. Work on a branch and open a pull request.
- Merging a pull request.
- Force-pushing, deleting or rewriting published Git history.
- Deploys, migrations of shared data and paid services. None exist today; if one
  appears, it needs a person too.
