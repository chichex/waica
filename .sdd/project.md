# Contrato de autonomia — waica
<!-- Generado por /sdd-init el 2026-07-28 (modo --assume). Refrescar con /sdd-init --update. -->

## Stack
TypeScript (tsc 7.x) end to end. pnpm monorepo (`pnpm@11.4.0`, workspace of 7 projects): `packages/engine` (core: ECS-ish entities, components, physics, state machines, three.js render), `packages/editor` (browser editor, React + Vite + Monaco; owns the new-project template in `packages/editor/template/`), `packages/behaviors`, `packages/archetype-platformer`, `packages/cli` (npm package `@chichex/waica` — bare `waica` is blocked by npm's similarity filter; `npx @chichex/waica` serves the pre-built editor, bundled into its `dist/editor` at build time), plus `examples/platformer` (Vite app consuming the engine). Tests: vitest 4 + happy-dom, run from the repo root (444 tests in 52 files). Everything in the repo is written in English (see CLAUDE.md).

## Comandos
| Accion | Comando | cwd | Estado | Duracion | Notas |
|---|---|---|---|---|---|
| test | `pnpm test` | . | verified 2026-08-04 | ~2s | vitest run: 444 tests in 52 files, all passing. Deterministic, no external services. |
| typecheck | `pnpm typecheck` | . | verified 2026-08-04 | ~2s | `tsc --noEmit` in all 6 runnable workspace projects, all clean. |
| build | `pnpm build` | . | verified 2026-08-04 | ~3s | Cleans library dists, then builds libraries, editor, example and CLI. Warning: editor main chunk is 4.6 MB (>500 kB limit) — pre-existing, not a failure. |
| published-shape test | `pnpm test:dist` | . | verified 2026-08-04 | ~5s | Runs a fresh build, proves each library dist exactly matches source, packs all three public libraries, and imports both platformer entry points with plain Node. |
| run (editor) | `pnpm editor` | . | verificado 2026-07-28 | up in <5s | Vite dev server. Alive when `curl -sf http://localhost:<port>` responds; port is printed by Vite (5174 when 5173 is busy, else 5173). |
| run (example) | `pnpm dev` | . | verificado 2026-07-28 | up in <5s | Platformer example on Vite (port 5173 by default). Same liveness check. |
| release | `pnpm release` | . | untested (publishes to npm — mutates external state, never run autonomously) | — | Runs the published-shape test, then `pnpm -r publish`. Human-only. |

## Ambientes
- **Local only.** There is no staging, no prod service, no docker, no `.env` files, and no external services (DBs, APIs, queues). The app is fully client-side; dev servers need nothing but `pnpm install`.
- **Prerequisite**: `pnpm install` at the repo root (node_modules present as of 2026-07-28).
- **CI: publish-only.** `.github/workflows/publish.yml` publishes `@chichex/waica` when a `v*` tag is pushed (npm trusted publishing via OIDC — no token, no 2FA; it re-runs typecheck, unit tests and the fresh-build published-shape test first). No CI runs on PRs — the local ladder below is still the only pre-merge enforcement.
- **Git**: default branch `main`; remote `origin` = `ssh://git@github.com/chichex/waica.git`; `gh` authenticated as `chichex`. `/sdd-run` branches from `main` and CAN open PRs.

## Verificacion autonoma
Ladder for this repo, in increasing order of confidence:
1. **typecheck** — `pnpm typecheck` (~1s). Catches API misuse across all packages.
2. **unit/component tests** — `pnpm test` (~2s). 444 vitest tests, happy-dom, deterministic. The cheapest strong signal; TDD is viable here.
3. **build** — `pnpm build` (~3s). Cleans library dists and proves the editor and example still bundle.
4. **published package shape** — `pnpm test:dist` (~5s). Rebuilds from clean library dists, rejects stale or extensionless output, pack-simulates the public libraries and loads their real exports with plain Node.
5. **live app smoke** — start `pnpm editor` (or `pnpm dev`) in background, wait for the Vite port line, `curl -sf` it, kill the process.
6. **browser e2e (semi-automated)** — the editor can be driven with the Playwright MCP tools when available in the session (`.playwright-mcp/` artifacts in the repo show this is established practice): navigate to the Vite URL, snapshot, click, screenshot. No scripted e2e suite exists (no Playwright/Cypress config) — this rung is interactive-agent-only, not a repeatable test suite.

**Not verifiable without a human**: game feel (jump tuning, camera feel, animation timing — the core product quality), visual correctness of sprites/rendering beyond screenshots, and anything involving `pnpm release`/npm.

## Limites
- No `pnpm release` / `pnpm publish` — ever — without explicit human confirmation (publishes to npm).
- No `git push` to `main`; work on branches, end in a PR. Pushing a release tag (`v*`) is allowed — it is how npm publishes are triggered (see `/publish`).
- No deleting or rewriting published git history.
- Deploys/migrations/paid services: not applicable (none exist) — if one appears, it is human-only by default.

## Politicas de generacion
Sin politicas activas (corrida `--assume`: las politicas son elecciones humanas y no se asumen). Configurar con `/sdd-init --update`.

## Decisiones humanas
(ninguna — corrida `--assume` del 2026-07-28; no se hicieron preguntas)

## Gaps
- `[NEEDS-INPUT]` No CI on PRs (only the tag-triggered publish workflow exists). Assumed conservative: every PR must pass the full local ladder (typecheck + test + build + published-shape test) before opening. Decide whether to add a PR-triggered GitHub Actions check.
- `[NEEDS-INPUT]` No coverage tooling is configured (no `--coverage` script, no baseline measured) — a coverage policy is not activable until it exists.
- `[NEEDS-INPUT]` No scripted e2e suite; browser verification depends on Playwright MCP being available in the session. Decide whether a real Playwright suite is worth adding.
- `pnpm release` intentionally left untested (external mutation).
- Editor bundle warning: main chunk 4.6 MB — informational, worth code-splitting eventually.
