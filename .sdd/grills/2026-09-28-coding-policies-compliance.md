# Grill — Coding policies compliance

<!-- Status: finalized. Project: /Users/ayrtonmarini/workspace/waica. Source: request to make waica fully compliant with .sdd/coding-policies.md in one autonomous run (no issue). -->
<!-- SDD-Tracking: version=1; type=grill; state=finalized; issue=none; grill=2026-09-28-coding-policies-compliance; project=%2FUsers%2Fayrtonmarini%2Fworkspace%2Fwaica -->

## Mode

standard

## Verified facts

On `main` at `68c52de` (v0.19.0). Line numbers `Lnn` refer to `.sdd/coding-policies.md` (clean-code, typescript, react, node; all references version 2026-09-14). Facts marked (spot-checked) were re-verified by the orchestrator; the rest come from four read-only audit agents run in this session, with the commands they reported.

### Tooling and gates
- F1 — No linter at all: no eslint, typescript-eslint, oxlint or biome in `node_modules/.pnpm` (spot-checked). Every policy rule whose gate is a lint rule is ungated today. No `lint` script in any `package.json`.
- F2 — `tsconfig.base.json`: `strict` and `noUncheckedIndexedAccess` on; `verbatimModuleSyntax`, `isolatedModules` on; `skipLibCheck: true` at line 13 with no written reason (spot-checked); `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch` absent; `lib` includes `DOM` and is inherited by `packages/cli` and `packages/mcp` (Node-run); `moduleResolution: "bundler"` everywhere; `packages/mcp/tsconfig.json` includes `../editor/src/types.d.ts`.
- F3 — `vitest.config.ts` has no `restoreMocks`; 17 test files use `vi.spyOn`/`vi.mock`/`vi.fn`.
- F4 — CI: only `.github/workflows/publish.yml` (tags) and `claude-review.yml` (dispatch). No PR/push CI, no `pnpm audit`, no Dependabot/Renovate. Release runs on `ubuntu-latest` already exercise a Chrome browser leg in `test:dist`.
- F5 — Contract gates today (`.sdd/project.md` → Politicas de generacion): higiene-ts-diff, tests-acompañan-src, max-lineas-archivo (950 physical lines, `.ts` only), naming-archivos, plus the `coding-policies` guia row.
- F6 — Uncommitted on `main`: `.sdd/project.md` (0.19.0 refresh + coding-policies row), `CLAUDE.md` (English rule removed, `@.sdd/coding-policies.md` import added), `.sdd/coding-policies.md` (new).

### TypeScript (typescript section)
- F7 — 0 `any` in source; 0 suppressions outside tests (5 `@ts-expect-error` with reasons in `game-time.test.ts`).
- F8 — L96: ~15 `JSON.parse(...)` results cast to concrete types without validation: `packages/cli/src/cli.ts:45`; `packages/editor/src/fs/prefab-fs.ts:34`; `packages/editor/src/editor/Editor.tsx:454,849,1034` (then `migrateScene`, `packages/editor/src/scene/ops.ts:49`, uses `scene.entities` unchecked); `CodePane.tsx:75`; `Explorer.tsx:402`; `packages/editor/src/project/{stats,game,editor-settings,controls}.ts`; `packages/mcp/src/runtime-preflight.ts:140,205,247`; `package-resolver.ts:72,85`; `server.ts:723`. Good pattern already exists in `packages/mcp/src/validation.ts:116`, `introspection.ts:212`, `archetypes.ts:29,60`.
- F9 — L98: 17 non-test `as unknown as` (spot-checked): `packages/engine/src/game.ts:365,686,710`, `runtime-inspection.ts:317,392`, `component-registry.ts:20`, `authoring-defaults.ts:30`; `packages/mcp/src/project-component-loader.ts:301`, `project-component-runner.ts:226`, `introspection.ts:39`; `packages/editor/src/editor/Viewport.tsx:118,314,788`, `Editor.tsx:2092`; `window` casts in the three `examples/*/src/main.ts`.
- F10 — L105: closed unions without `never` exhaustiveness at `Editor.tsx:333` and likely `:1585`; `packages/engine/src/runtime-bridge.ts:228` shows the correct pattern.
- F11 — L122: unhandled `void` promises: `void main(canvas)` in `examples/*/src/main.ts`; `packages/engine/src/audio/web-audio-backend.ts:94-102` (suspend/resume/close).
- F12 — The only `as never` (`packages/engine/src/scene.ts:153`) casts props read from scene JSON; strict L96 reading flags it. Definite assignments `entity!:`/`game!:` (`component.ts:66-67`) are not covered by the policy.

### React (react section, `packages/editor`)
- F13 — No `<StrictMode>` in `packages/editor/src/main.tsx` (spot-checked); `ErrorBoundary` wraps `App`.
- F14 — L183: 14 `ref.current = …` writes in the render body of `Viewport.tsx` (~388-401), read by the game loop.
- F15 — L203: `eslint-disable react-hooks/exhaustive-deps` without reasons at `Viewport.tsx:746,774`; missing deps without disables at `Explorer.tsx:296` (`openFolder`) and `CodePane.tsx:98` (`onSaved`).
- F16 — L199/L200/L193/L209: effects that only shuffle state: `Editor.tsx:249` (`setEpoch` on art change), `Explorer.tsx:286` (reset → use `key={openScenePath}`), `Explorer.tsx:291` (event as prop), `UiPane.tsx:26-32` (props copied to state and re-synced).
- F17 — L202: stale async responses unguarded at `CodePane.tsx:53` (`fs.readText(path).then(setValue)`) and `packages/editor/src/home/Home.tsx:65` (`listRecents().then(setRecents)`).
- F18 — L224: clickable `div`s acting as controls at `AnimationEditor.tsx:429` and `Inspector.tsx:1205`.
- F19 — L222: render tests use `createRoot` + `querySelector` (72 calls, 0 role queries); no Testing Library.
- F20 — L215: React Compiler not configured; 12 manual memo calls.

### Node (node section)
- F21 — L290/L279: MCP stdio server has no SIGTERM/SIGINT/stdin-end handling (`packages/mcp/src/stdio.ts:9-14`, `cli.ts`; spot-checked); cleanup only via `server.onclose` (`server.ts:775`); dev servers spawn `detached: true` (`runtime-dev-server.ts:198`) and are likely orphaned.
- F22 — L268: no timeout on `<pm> --version` spawn (`runtime-preflight.ts:62-73`); also `cli.ts:90` `spawnSync(npm install -g)` and `project-component-loader.ts:362` `execFileAsync(tsc)`.
- F23 — L269: host `signal` reaches only `validateProject` (`server.ts:545`); runtime tools never receive it.
- F24 — L283: `packages/cli/src/cli.ts:216` `void main()` without `.catch` (spot-checked).
- F25 — L284: message-regex fallback after code checks at `project-component-runner.ts:191`.
- F26 — Security: registry `latest` flows unvalidated into `npm install -g pkg@${latest}` (`cli.ts:90-92`, `shell: true` on Windows).

### Clean code (baseline section)
- F27 — L40: files over 600 logical lines (LL): `packages/editor/src/editor/Inspector.tsx` 2196 (24 components; 2373 physical, spot-checked), `Editor.tsx` 1925, `Viewport.tsx` 1216, `Explorer.tsx` 1109, `AnimationEditor.tsx` 934, `StateMachinePanel.tsx` 609, `packages/mcp/src/validation.ts` 790, `server.ts` 750, `project-component-loader.ts` 700.
- F28 — L23: 72 functions over 60 LL (47 after removing JSX). Worst: `Editor` (`Editor.tsx:132`, ~1799 LL, owns persistence, undo, ~60 CRUD handlers at `:375-1114`, play/stop), `Explorer` (`:71`), `Viewport` (`:332`; effect at `:403` 292 LL; `onUpdate` at `:544` 179 LL, cx 46), `AnimationEditor` (`:59`) and `SheetPane` (`:582`), `validateProject` (`validation.ts:675`), `execute` (`server.ts:484`), `runEntry` (`project-component-loader.ts:518`, linear), `createGridPlayerRole` (`packages/behaviors/src/grid-player-role.ts:39`, linear).
- F29 — L25–L27 (SHOULD): 88 functions over complexity 10 (top: `validateRuntimeArguments` `server.ts:327` cx 72, duplicating the `TOOLS` schemas at `server.ts:62`); 5 functions deeper than 4 (`sheet-detect.ts:114`, `play-code.ts:129`, `Viewport.tsx:544`, `validation.ts:284,491`); 82 functions with more than 3 params (`aabbOverlap` in `packages/engine/src/aabb.ts:2` takes 8).
- F30 — `Inspector.tsx:458` contains a raw control character in a string literal (tools treat the file as binary).
- F31 — Already compliant: no speculative layers, DI at real boundaries, engine deterministic (no `Math.random`/`Date.now` in engine/behaviors), child-process teardown, stdout discipline, fs path guards, lockfile/`--frozen-lockfile`, OIDC publishing.

## Resolved decisions

The user asked for all decisions at once with defaults and accepted all seventeen explicitly.

1. **Compliance target.** Every MUST rule is enforced at `error`. SHOULD rules run at `warn` with a ratchet: the PR diff adds no new warnings. Every exception is written in the policies' "Ajustes de este proyecto" section. Rejected: 100% literal (SHOULDs as errors).
2. **Linter.** ESLint flat config with `typescript-eslint` type-checked rules, `eslint-plugin-react-hooks` (including its compiler-derived purity/refs rules) and `eslint-plugin-jsx-a11y`; root `pnpm lint` script. Rejected: oxlint/biome (fewer type-aware rules than the policies name).
3. **Thresholds.** Error: 60 logical lines per function and 600 per file (skip blank lines and comments). Warn: 40 per function, 300 per file, complexity 10, depth 3, 3 parameters.
4. **Tests.** Type and promise rules apply to tests too; size/complexity limits in `*.test.ts` are warn-only, recorded in Ajustes.
5. **Contract.** Add a generation policy `lint-clean` (gate: `pnpm lint` exit 0) and extend the 950-line ratchet to `.tsx`.
6. **Size refactors in this run.** Split editor `Editor`, `Inspector`, `Viewport`, `Explorer`, `AnimationEditor`, `StateMachinePanel`, and MCP `validation.ts`, `server.ts`, `project-component-loader.ts`. A documented suppression is allowed only for linear, cohesive functions such as `runEntry` and `createGridPlayerRole`.
7. **Safety net.** Add `@testing-library/react` and `@testing-library/user-event`, and write role-based characterization tests for each editor component before splitting it (also satisfies L222).
8. **TypeScript flags.** Enable `noImplicitOverride` and `noFallthroughCasesInSwitch`. Decline `exactOptionalPropertyTypes` with the reason written down (wide blast radius, public engine types); L92 asks for an explicit decision, not activation.
9. **`skipLibCheck`.** Try removing it; if third-party types fail, keep it with the reason documented.
10. **Node.** A Node tsconfig base without `DOM` for `cli` and `mcp`; `NodeNext` module/moduleResolution for Node-run builds.
11. **StrictMode.** Enable it and fix what it surfaces.
12. **React Compiler.** Do not enable the build plugin; rely on its lint rules and write the decision in Ajustes (L215).
13. **PR CI.** New workflow on `pull_request` running `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:dist`, `pnpm test:e2e` on `ubuntu-latest`.
14. **Supply chain.** `pnpm audit --audit-level high` in PR CI; Dependabot weekly for npm and GitHub Actions.
15. **Language.** Code, comments, tests and commits stay in English as a convention written in Ajustes (not in `CLAUDE.md`); the policies text stays in Spanish.
16. **Delivery.** One branch, one PR, commits per phase, each phase leaving the full ladder green. The three uncommitted files (F6) go in the first commit. Then `/sdd-review-loop` chained without questions (3 rounds, level high, reviewer Opus, corrector Sonnet). Merge stays human.
17. **Release.** No publish in this run; decided after merge.

## Pending branches

None.

## Handoff

### Topic and scope

Make waica compliant with `.sdd/coding-policies.md` (clean-code, typescript, react, node @ 2026-09-14) in one autonomous `/sdd-run`, with "done" machine-checked by `pnpm lint` plus the full verification ladder.

### Verified facts

F1–F31 above.

### Resolved decisions

Decisions 1–17 above.

### Suggested phases

1. Gates: ESLint config (all target rules at `warn`), `lint` script, `restoreMocks`, PR CI workflow, audit, Dependabot, contract rows (`lint-clean`, `.tsx` ratchet), Ajustes entries.
2. MUST bugs: F21–F26, F17, F11.
3. Types and JSON: F8–F10, F12.
4. React: F13–F16, F18, F20.
5. tsconfig: F2 decisions 8–10.
6. Characterization tests, then size refactors: F27–F29, F30.
7. Flip every MUST rule to `error`; SHOULD rules stay `warn` with no new warnings.

### Constraints and non-goals

- Refactors preserve behavior; no weakened tests, no `skip`/`only`.
- No public engine API changes beyond internal types.
- No React Compiler plugin, no `exactOptionalPropertyTypes`, no publish, no merge.

### Explicit assumptions (adjustable when the spec is written)

- "Split or document" MUSTs (L23, L40) are satisfied by a suppression with a written reason (L64).
- Chrome is available on `ubuntu-latest` for `test:e2e`, as it is for the release workflow's `test:dist` leg.
- The four audit reports' line numbers may drift as earlier phases land; each phase re-measures.

### Risks and deferred questions

- Editor refactors are the longest and riskiest phase; their safety net is characterization tests plus e2e.
- The PR will be large for human review.
- Type-checked ESLint over ~400 files may be slow; measure and record its duration in the contract.
- Dependabot only opens PRs after merge.
- Judgement-call rules (cohesion of `game.ts`, `validation.ts`, `server.ts`) need human review.

### Recommended context for the spec

`.sdd/coding-policies.md`, `.sdd/project.md`, `tsconfig.base.json`, `vitest.config.ts`, `packages/editor/src/main.tsx`, `packages/mcp/src/stdio.ts`, `packages/cli/src/cli.ts`, `.github/workflows/publish.yml`, and the files cited in F8–F30.
