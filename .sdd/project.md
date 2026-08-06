# Contrato de autonomia — waica
<!-- Generado por /sdd-init el 2026-07-28, actualizado el 2026-08-06. Refrescar con /sdd-init --update. -->

## Stack
TypeScript (tsc 7.x) end to end. pnpm monorepo (`pnpm@11.4.0`, workspace of 8 projects): `packages/engine` (core: ECS-ish entities, components, physics, state machines, three.js render), `packages/editor` (browser editor, React + Vite + Monaco; owns the new-project template in `packages/editor/template/`), `packages/behaviors`, `packages/archetype-platformer`, `packages/mcp` (private stdio MCP server for agents — 10 tools: create_project, list_components, describe_archetype, project_summary, validate_project and the five scaffolds for components, prefabs, roles, states and UI), `packages/cli` (npm package `@waica/cli`, which installs the plain `waica` binary; it was published as `@chichex/waica` through 0.3.0 and renamed when the `@waica` org was created), plus `examples/platformer` (Vite app consuming the engine). Tests: vitest 4 + happy-dom, run from the repo root (720 tests in 74 files). Everything in the repo is written in English (see CLAUDE.md). Published version at this refresh: 0.5.0.

**Four packages publish together, on one version: `@waica/cli` plus `@waica/engine`/`behaviors`/`archetype-platformer`.** Lockstep is enforced by `packages/cli/src/package.test.ts` — a generated project depends on `^<that version>` (read from `packages/engine/package.json` at build time, never hardcoded), so a partial release puts a CLI on npm that disagrees with the registry. `@waica/editor` and `@waica/mcp` stay `private` and ship inside the CLI. At build time the CLI bundles the pre-built editor into `dist/editor`, the built MCP server into `dist/mcp`, and vendored copies of the three libraries into `dist/mcp/node_modules/@waica/*` (published `exports` applied, same lowering as the real publish via `scripts/published-manifest.mjs`) so the server resolves them the way it resolves installed dependencies. `npx @waica/cli` serves the editor; `npx @waica/cli mcp` serves the MCP server on stdio.

## Comandos
| Accion | Comando | cwd | Estado | Duracion | Notas |
|---|---|---|---|---|---|
| test | `pnpm test` | . | verificado 2026-08-06 | ~2s | vitest run: 720 tests in 74 files, all passing. Deterministic, no external services. |
| typecheck | `pnpm typecheck` | . | verificado 2026-08-06 | ~2s | `tsc --noEmit` in the 7 workspace projects that declare the script (everything but the root), all clean. |
| build | `pnpm build` | . | verificado 2026-08-06 | ~2s | Cleans library dists, then builds libraries, editor, example and CLI. Warning: editor main chunk is 4.7 MB (>500 kB limit) — pre-existing, not a failure. |
| published-shape test | `pnpm test:dist` | . | verificado 2026-08-06 | ~11s | Runs a fresh build, proves each dist exactly matches source, packs the three libraries plus the CLI, checks the manifest `scripts/prepare-publish.mjs` hands to CI matches what `pnpm pack` produces, imports both platformer entry points with plain Node, and drives `waica mcp` over real stdio — from the packed CLI, from the checkout build, and against a project that owns its own `@waica` copies. |
| run (editor) | `pnpm editor` | . | verificado 2026-08-06 | up in <5s | Vite dev server. Alive when `curl -sf http://localhost:<port>` answers 200; port is printed by Vite (5174 when 5173 is busy, else 5173). |
| run (example) | `pnpm dev` | . | verificado 2026-08-06 | up in <5s | Platformer example on Vite (5173 by default). Same liveness check. |
| release | push a `vX.Y.Z` tag (see `/publish`) | . | no probado (publishes to npm — mutates external state, never run autonomously) | — | `.github/workflows/publish.yml` publishes the four packages in lockstep via OIDC. `pnpm release` refuses to run: publishing from a laptop skips the tag check and the trusted-publishing identity. Human-only. |

## Ambientes
- **Local only.** There is no staging, no prod service, no docker, no `.env` files, and no external services (DBs, APIs, queues). The app is fully client-side; dev servers need nothing but `pnpm install`.
- **Prerequisite**: `pnpm install` at the repo root (node_modules present as of 2026-08-06). A fresh git worktree needs its own `pnpm install` before any command runs.
- **CI: publish-only.** `.github/workflows/publish.yml` publishes the four packages when a `v*` tag is pushed — the three libraries first, then the CLI (npm trusted publishing via OIDC — no token, no 2FA, configured per package; it re-runs typecheck, unit tests and the fresh-build published-shape test first). No CI runs on PRs — the local ladder below is still the only pre-merge enforcement.
- **Git**: default branch `main`; remote `origin` = `ssh://git@github.com/chichex/waica.git`; `gh` authenticated as `chichex`. `/sdd-run` branches from `main` and CAN open PRs. Merged branches are deleted (`gh pr merge --delete-branch`), and PRs land as merge commits, not squashes.

## Verificacion autonoma
Ladder for this repo, in increasing order of confidence:
1. **typecheck** — `pnpm typecheck` (~2s). Catches API misuse across all packages.
2. **unit/component tests** — `pnpm test` (~2s). 720 vitest tests, happy-dom, deterministic. The cheapest strong signal; TDD is viable here.
3. **build** — `pnpm build` (~2s). Cleans library dists and proves the editor and example still bundle.
4. **published package shape** — `pnpm test:dist` (~11s). Rebuilds from clean library dists, rejects stale or extensionless output, pack-simulates the public libraries and loads their real exports with plain Node.
5. **live app smoke** — start `pnpm editor` (or `pnpm dev`) in background, wait for the Vite port line, `curl -sf` it, kill the process.
6. **browser e2e (semi-automated)** — the editor can be driven with the Playwright MCP tools when available in the session: navigate to the Vite URL, snapshot, click, screenshot. Exercised on 2026-08-06 to confirm an editor UI change end to end ("Try the demo" opens an in-memory project, so nothing touches disk). No scripted e2e suite exists (no Playwright/Cypress config) — this rung is interactive-agent-only, not a repeatable test suite.

**Not verifiable without a human**: game feel (jump tuning, camera feel, animation timing — the core product quality), visual correctness of sprites/rendering beyond screenshots, and anything involving `pnpm release`/npm.

## Limites
- No publishing to npm — ever — without explicit human confirmation. `pnpm release` refuses to run; the live path is pushing a `v*` tag, which is what actually publishes.
- No `git push` to `main`; work on branches, end in a PR. Pushing a release tag (`v*`) is allowed — it is how npm publishes are triggered (see `/publish`). Human-authorized exceptions happen (see `## Decisiones humanas`) but do not change the default.
- No merging PRs autonomously: the merge is the human's call.
- No deleting or rewriting published git history.
- Deploys/migrations/paid services: not applicable (none exist) — if one appears, it is human-only by default.

## Politicas de generacion
Sin politicas activas — ofrecidas el 2026-08-06 (tamaño de PR, dependencias nuevas, commits convencionales) y el usuario eligio no activar ninguna. Coverage no se ofrecio: no hay tooling que lo mida en este repo (ver `## Gaps`). Reabrir el menu con `/sdd-init --update`.

## Decisiones humanas
- 2026-07-28: contrato generado con `--assume`; no se hicieron preguntas.
- 2026-08-06: se ofrecieron las politicas de generacion por primera vez (la corrida original las salteo por `--assume`) y el usuario eligio **ninguna**: el criterio de terminado lo sigue definiendo la spec de cada `/sdd-run`, sin gates extra.
- 2026-08-06: el usuario autorizo explicitamente pushear este refresco del contrato directo a `main`. Es una excepcion puntual para un cambio doc-only; el limite de "no push a main" sigue vigente para todo lo demas.

## Gaps
- `[NEEDS-INPUT]` No CI on PRs (only the tag-triggered publish workflow exists). Assumed conservative: every PR must pass the full local ladder (typecheck + test + build + published-shape test) before opening. Decide whether to add a PR-triggered GitHub Actions check.
- `[NEEDS-INPUT]` No coverage tooling is configured (no `--coverage` script, no baseline measured) — a coverage policy is not activable until it exists.
- `[NEEDS-INPUT]` No scripted e2e suite; browser verification depends on Playwright MCP being available in the session. Decide whether a real Playwright suite is worth adding.
- `pnpm release` intentionally left untested (external mutation).
- Editor bundle warning: main chunk 4.7 MB — informational, worth code-splitting eventually.
