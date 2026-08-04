# Spec — Standard ArchetypeManifest export (ADR-0002)
<!-- Generada por /sdd-spec el 2026-08-04. Fuente: pedido libre (contrato de diseño @waica/mcp, sesión grill 2026-08-03). Estado: implementada -->
<!-- Spec A de 2 encadenadas: esta primero, luego .sdd/specs/waica-mcp.md (Spec B, depende de esta). -->

## Contexto

ADR-0002 (`docs/adr/0002-standard-archetype-manifest-export.md`) decide que cada package de arquetipo exporta un `ArchetypeManifest` estándar bajo el nombre convenido `ARCHETYPE`, y que el tipo se muda del editor al engine. Hoy el manifest vive en `packages/editor/src/project/archetype.ts:27-41` (13 campos), ensamblado a mano desde 10 exports `PLATFORMER_*` de `@waica/archetype-platformer` más dos piezas editor-locales (`label`, `PLATFORMER_ENTITY_ICONS`). Dos tipos miembros (`EntityTemplate`, `ArchetypeArt`) están definidos en el package de arquetipo (`registry.ts:61-67`, `art.ts:9-14`) — moverlos al engine es forzoso (un import engine→archetype sería un ciclo). Restricción dura descubierta: el barrel del archetype importa PNGs a scope de módulo (`registry.ts:24-26`) que solo Vite resuelve, así que un consumidor Node (el MCP de Spec B) necesita una entrada data-only. Segundo hallazgo estructural: los `dist/` actuales de `@waica/*` NO son cargables por Node pelado (imports relativos sin extensión; `scripts/sync-scene.mjs:19-33` instala `registerHooks` precisamente para esquivarlo) — esta spec arregla el emit porque Spec B lo requiere en producción.

## Comportamiento esperado

- **CA-A1** (BAJA): `@waica/engine` exports `ArchetypeManifest`, `EntityTemplate` and `ArchetypeArt` from its barrel (new one-concept file `src/archetype.ts`, matching the flat layout). Clean break: the types are removed from the archetype package's barrel (no compat re-exports — nothing is published to npm) and no version bump. Pass/fail: `pnpm typecheck` green with a typed `ArchetypeManifest` literal fixture in engine source (tsc checks all of `src/`); type exports have no runtime-observable behavior, hence BAJA by the contract ladder.
- **CA-A2** (ALTA): `@waica/archetype-platformer` exports `ARCHETYPE: ArchetypeManifest` from the root barrel AND a Node-safe subpath export (`@waica/archetype-platformer/manifest`) whose module graph contains no PNG/asset imports — art listed as package-relative paths under `assets/` (already shipped via `files: ["dist", "assets"]`); bundler-bound `artUrls` stays out of the Node-safe entry. `label`, `entityIcons` and `actionLabels` fold into `ARCHETYPE` as data. Pass/fail: vitest unit test (bare `pnpm test`) deep-equaling `ARCHETYPE` content against the `PLATFORMER_*` pieces; Node-safety of the subpath is verified in the `test:dist` rung (CA-A6), not here.
- **CA-A3** (ALTA): the editor assembles its manifest from the package's `ARCHETYPE` export; `archetype.ts` no longer hand-assembles from the 10 `PLATFORMER_*` imports (grep-decidable: those named imports gone). `ArchetypeContext`/`useArchetype`, `ARCHETYPE_CATALOG` (with its 'soon' entries) and `resolveArchetype`'s silent platformer fallback stay editor-side unchanged. Pass/fail: new unit test asserting the editor-resolved manifest field-by-field equals the package's `ARCHETYPE` (including folded `label`/`entityIcons`/`actionLabels`) + `pnpm typecheck` (existing `archetype.test.ts` alone is near-vacuous — it only reads `.id`).
- **CA-A4** (ALTA): behavior preservation — `projectFiles(name, start)` output is byte-identical pre/post refactor. Pass/fail: golden snapshot of `projectFiles('fixture-name', 'demo')` and `('fixture-name', 'blank')` (the full `Record<string, string>`) captured from main BEFORE the refactor, asserted byte-equal after; plus full ladder green. The 7 existing `template.test.ts` assertions do NOT decide this claim on their own.
- **CA-A5** (ALTA): `scripts/sync-scene.mjs` still runs and is idempotent. Pass/fail: the exact sequence `pnpm build && node scripts/sync-scene.mjs && git diff --exit-code -- packages/editor/template/src examples/platformer/src` exits 0 (build inlined: the script hard-requires fresh dists — header line 5, dist imports at lines 35-38).
- **CA-A6** (ALTA, build-coupled): published-shape dists of `@waica/engine`, `@waica/behaviors` and `@waica/archetype-platformer` are plain-Node-loadable — fix the emit (tsc `rewriteRelativeImportExtensions`, or explicit `.js` specifiers) so relative imports carry extensions. Introduces the `test:dist` rung: a script OUTSIDE the root vitest include, run after `pnpm build`, that HARD-FAILS when dist is missing (never skips): `pnpm pack` the three packages → untar into a tmp `node_modules` (publishConfig exports applied, simulating publish) → spawn plain `node` importing `@waica/engine`, `@waica/behaviors` and the real specifier `@waica/archetype-platformer/manifest` (exit 0) → assert `publishConfig.exports` maps the subpath to exactly the packed dist file. Bare `pnpm test` stays green and buildless.
- **CA-A7** (BAJA): `docs/adr/0002` amended so the recorded manifest shape includes the folded fields (`entityIcons`, `actionLabels`) — the design record must not diverge from the shipped shape on day one. Pass/fail: the ADR file names both fields.

## Fuera de alcance

- The MCP package itself (Spec B).
- Generalizing the editor to dynamic multi-archetype resolution: the `ARCHETYPES` record stays a hardcoded single entry built from the package export; catalog 'soon' entries, template `main.ts` (still importing `PLATFORMER_BUNDLE`/`PLATFORMER_REGISTRY` directly), `sync-scene.mjs` and `examples/platformer` unchanged.
- `AnimationContract` data for archetypes (validate uses the per-character stateIssues model — see Spec B).
- Version bumps or compat re-exports (nothing `@waica/*` was ever published; first publish already includes the manifest).

## Inferencias

| # | Inferencia | Elección | Resolución |
|---|---|---|---|
| 1 | ¿Un solo PR o partición? | Dos specs encadenadas (A: refactor, B: MCP), cada una pasa la escalera sola | confirmada |
| 9 | ¿Campos del manifest / cómo se hace Node-importable? | Sin `artUrls` en la entrada Node-safe; subpath export data-only; arte como paths de `assets/` | confirmada |
| 10 | ¿Refactor del editor generaliza? | Estrictamente behavior-preserving | confirmada |
| 11 | ¿Re-exports de compat para EntityTemplate/ArchetypeArt? | Clean break, sin bump (nada publicado) | confirmada |
| — | ¿Emit de dists cargable por Node pelado? | Sí, en esta spec (prerequisito de producción de B) | elegida por usuario (mecanismo: fix emit + test:dist) |
| — | ¿ADR-0002 se enmienda con los campos plegados? | Sí (CA-A7) | [PANEL] derivada del completeness critic |

## Verificabilidad

Mixto: **CA-A2..A6 ALTA** — todo se observa con tests deterministas que el contrato corre hoy (`pnpm test` ~1s verde, 434 tests) más el rung nuevo `test:dist` anclado en `pnpm build` (~3s, verificado); **CA-A1 y CA-A7 BAJA** — tipos y docs solo tienen señal indirecta (`pnpm typecheck` / grep). El panel adversarial refutó y corrigió: A1 no es ALTA (vitest no chequea tipos — probado en vivo), A4 exige snapshot dorado (los asserts existentes no observan "sin cambios"), A5 exige el build inlined, y la pata Node de A2 no puede correr dentro del `pnpm test` pelado sin romper el comando verificado del contrato en un clon fresco — por eso `test:dist` es un rung separado post-build que hard-failea en vez de skipear.

## Plan de verificación

1. `pnpm typecheck` — CA-A1, y soporte de A2/A3.
2. `pnpm test` (pelado, sin build) — CA-A2 (deepEqual de contenido), CA-A3 (igualdad campo a campo editor↔package), CA-A4 (snapshot dorado byte-igual).
3. `pnpm build` — prerequisito de 4 y 5.
4. `node scripts/sync-scene.mjs && git diff --exit-code -- packages/editor/template/src examples/platformer/src` — CA-A5.
5. `pnpm test:dist` (nuevo script, hard-fail sin dist) — CA-A6: pack-simulación + spawn de Node pelado importando los tres packages y el subpath `/manifest` + assert del mapping de `publishConfig.exports`.
6. Grep del ADR — CA-A7.

## Riesgos y gaps

- El snapshot dorado de CA-A4 debe capturarse desde main ANTES de empezar el refactor (si se captura después, no observa nada).
- `test:dist` es infraestructura nueva: mantenerlo fuera del include del vitest raíz (`packages/**/src/**/*.test.ts`) — un test dist-dependiente dentro del suite rompería el `pnpm test` del contrato en clon fresco, o skipearía (verde que no observa).
- Cambiar el emit de tsc (`rewriteRelativeImportExtensions`) toca los tres builds de libs a la vez; el snapshot de A4 + suite verde acotan la regresión.
- `.sdd/project.md` records 424 tests (2026-07-30); the suite had 434 before this run and now has 438 — minor contract drift, not blocking.

## Resultado de ejecución (2026-08-04)

| CA | Estado | Evidencia |
|---|---|---|
| CA-A1 | verificado | `pnpm typecheck` completed successfully across all 6 runnable workspace projects; the engine fixture satisfies `ArchetypeManifest`. |
| CA-A2 | verificado | `manifest.test.ts` deep-equal passed; root `ARCHETYPE` includes all folded fields and the `/manifest` entry remained asset-free under the packed Node probe. |
| CA-A3 | verificado | `archetype.test.ts` passed package-to-editor field equality; grep confirmed manual `PLATFORMER_*` assembly imports are absent. |
| CA-A4 | verificado | Both pre-refactor full `projectFiles('fixture-name', start)` golden snapshots passed byte-for-byte under `pnpm test`. |
| CA-A5 | verificado | `pnpm build && node scripts/sync-scene.mjs && git diff --exit-code -- packages/editor/template/src examples/platformer/src` exited 0. |
| CA-A6 | verificado | `pnpm test:dist` packed all three packages, asserted the published `/manifest` mapping, and loaded engine, behaviors, and the manifest subpath in plain Node. |
| CA-A7 | verificado | ADR-0002 contains both `entityIcons` and `actionLabels`. |

Full regression: `pnpm test` passed 438/438 tests in 51 files; `pnpm build` passed with the pre-existing editor chunk-size warning. Autonomous ladder ceiling: editor live smoke returned HTTP 200 and the process was stopped cleanly. Deviations: none.
