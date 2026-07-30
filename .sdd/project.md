# Contrato de autonomia — waica
<!-- Generado por /sdd-init el 2026-07-28 (modo --assume). Refrescar con /sdd-init --update. -->

## Stack
TypeScript (tsc 7.x) end to end. pnpm monorepo (`pnpm@11.4.0`, workspace of 7 projects): `packages/engine` (core: ECS-ish entities, components, physics, state machines, three.js render), `packages/editor` (browser editor, React + Vite + Monaco; owns the new-project template in `packages/editor/template/`), `packages/behaviors`, `packages/archetype-platformer`, `packages/cli` (npm package `waica`: `npx waica` serves the pre-built editor, bundled into its `dist/editor` at build time), plus `examples/platformer` (Vite app consuming the engine). Tests: vitest 4 + happy-dom, run from the repo root. Everything in the repo is written in English (see CLAUDE.md).

## Comandos
| Accion | Comando | cwd | Estado | Duracion | Notas |
|---|---|---|---|---|---|
| test | `pnpm test` | . | verificado 2026-07-30 | ~1s | vitest run: 424 tests in 50 files, all passing. Deterministic, no external services. |
| typecheck | `pnpm typecheck` | . | verificado 2026-07-30 | ~1s warm (first run slower) | `tsc --noEmit` in all 8 workspace projects, all clean. |
| build | `pnpm build` | . | verificado 2026-07-28 | ~3s | `tsc -p tsconfig.build.json` for libs + Vite bundle for editor/example. Warning: editor main chunk is 4.5 MB (>500 kB limit) — pre-existing, not a failure. |
| run (editor) | `pnpm editor` | . | verificado 2026-07-28 | up in <5s | Vite dev server. Alive when `curl -sf http://localhost:<port>` responds; port is printed by Vite (5174 when 5173 is busy, else 5173). |
| run (example) | `pnpm dev` | . | verificado 2026-07-28 | up in <5s | Platformer example on Vite (port 5173 by default). Same liveness check. |
| release | `pnpm release` | . | no probado (publishes to npm — mutates external state, never run autonomously) | — | Builds all packages then `pnpm -r publish`. Human-only. |

## Ambientes
- **Local only.** There is no staging, no prod service, no docker, no `.env` files, and no external services (DBs, APIs, queues). The app is fully client-side; dev servers need nothing but `pnpm install`.
- **Prerequisite**: `pnpm install` at the repo root (node_modules present as of 2026-07-28).
- **CI: none.** No `.github/workflows` — nothing runs remotely; the local ladder below is the only enforcement.
- **Git**: default branch `main`; remote `origin` = `ssh://git@github.com/chichex/waica.git`; `gh` authenticated as `chichex`. `/sdd-run` branches from `main` and CAN open PRs.

## Verificacion autonoma
Ladder for this repo, in increasing order of confidence:
1. **typecheck** — `pnpm typecheck` (~1s). Catches API misuse across all packages.
2. **unit/component tests** — `pnpm test` (~1s). 314 vitest tests, happy-dom, deterministic. The cheapest strong signal; TDD is viable here.
3. **build** — `pnpm build` (~3s). Proves the editor and example still bundle.
4. **live app smoke** — start `pnpm editor` (or `pnpm dev`) in background, wait for the Vite port line, `curl -sf` it, kill the process.
5. **browser e2e (semi-automated)** — the editor can be driven with the Playwright MCP tools when available in the session (`.playwright-mcp/` artifacts in the repo show this is established practice): navigate to the Vite URL, snapshot, click, screenshot. No scripted e2e suite exists (no Playwright/Cypress config) — this rung is interactive-agent-only, not a repeatable test suite.

**Not verifiable without a human**: game feel (jump tuning, camera feel, animation timing — the core product quality), visual correctness of sprites/rendering beyond screenshots, and anything involving `pnpm release`/npm.

## Limites
- No `pnpm release` / `pnpm publish` — ever — without explicit human confirmation (publishes to npm).
- No `git push` to `main`; work on branches, end in a PR.
- No deleting or rewriting published git history.
- Deploys/migrations/paid services: not applicable (none exist) — if one appears, it is human-only by default.

## Politicas de generacion
Sin politicas activas (corrida `--assume`: las politicas son elecciones humanas y no se asumen). Configurar con `/sdd-init --update`.

## Decisiones humanas
(ninguna — corrida `--assume` del 2026-07-28; no se hicieron preguntas)

## Gaps
- `[NEEDS-INPUT]` No CI exists. Assumed conservative: every PR must pass the full local ladder (typecheck + test + build) before opening. Decide whether to add GitHub Actions.
- `[NEEDS-INPUT]` No coverage tooling is configured (no `--coverage` script, no baseline measured) — a coverage policy is not activable until it exists.
- `[NEEDS-INPUT]` No scripted e2e suite; browser verification depends on Playwright MCP being available in the session. Decide whether a real Playwright suite is worth adding.
- `pnpm release` intentionally left `no probado` (external mutation).
- Editor bundle warning: main chunk 4.5 MB — informational, worth code-splitting eventually.
