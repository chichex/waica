# Spec — Standard ArchetypeManifest export (ADR-0002)
<!-- Generada por /sdd-spec el 2026-08-04. Fuente: pedido libre (contrato de diseño @waica/mcp, sesión grill 2026-08-03). Estado: implementada -->
<!-- Spec A de 2 encadenadas: esta primero, luego .sdd/specs/waica-mcp.md (Spec B, depende de esta). -->

## Contexto

ADR-0002 (`docs/adr/0002-standard-archetype-manifest-export.md`) decide que cada package de arquetipo exporta un `ArchetypeManifest` estándar bajo el nombre convenido `ARCHETYPE`, y que el tipo se muda del editor al engine. Hoy el manifest vive en `packages/editor/src/project/archetype.ts:27-41` (13 campos), ensamblado a mano desde 10 exports `PLATFORMER_*` de `@waica/archetype-platformer` más dos piezas editor-locales (`label`, `PLATFORMER_ENTITY_ICONS`). Dos tipos miembros (`EntityTemplate`, `ArchetypeArt`) están definidos en el package de arquetipo (`registry.ts:61-67`, `art.ts:9-14`) — moverlos al engine es forzoso (un import engine→archetype sería un ciclo). Restricción dura descubierta: el barrel del archetype importa PNGs a scope de módulo (`registry.ts:24-26`) que solo Vite resuelve, así que un consumidor Node (el MCP de Spec B) necesita una entrada asset-import-free. Segundo hallazgo estructural: los `dist/` actuales de `@waica/*` NO son cargables por Node pelado (imports relativos sin extensión; `scripts/sync-scene.mjs:19-33` instala `registerHooks` precisamente para esquivarlo) — esta spec arregla el emit porque Spec B lo requiere en producción.

## Comportamiento esperado

- **CA-A1** (BAJA): `@waica/engine` exports `ArchetypeManifest`, `EntityTemplate` and `ArchetypeArt` from its barrel (new one-concept file `src/archetype.ts`, matching the flat layout). Clean break: the types are removed from the archetype package's barrel (no compat re-exports — nothing is published to npm) and no version bump. Pass/fail: `pnpm typecheck` green with a typed `ArchetypeManifest` literal fixture in engine source (tsc checks all of `src/`); type exports have no runtime-observable behavior, hence BAJA by the contract ladder.
- **CA-A2** (ALTA): `@waica/archetype-platformer` exports `ARCHETYPE: BrowserArchetypeManifest` from the plain-Node-loadable root barrel AND an asset-import-free subpath export (`@waica/archetype-platformer/manifest`) typed as the base `ArchetypeManifest` — art resolves to package-relative paths under `assets/` (already shipped via `files: ["dist", "assets"]`); browser `artUrls` stays out of the Node-safe entry. `label`, `entityIcons` and `actionLabels` fold into `ARCHETYPE`. Pass/fail: bare `pnpm test` imports and validates both entries; `test:dist` imports both real packed specifiers with plain Node.
- **CA-A3** (ALTA): the editor assembles its manifest from the package's `ARCHETYPE` export; `archetype.ts` no longer hand-assembles from the 10 `PLATFORMER_*` imports (grep-decidable: those named imports gone). `ArchetypeContext`/`useArchetype`, `ARCHETYPE_CATALOG` (with its 'soon' entries) and `resolveArchetype`'s silent platformer fallback stay editor-side unchanged, including ids that collide with `Object.prototype`. Pass/fail: a source-structure assertion proves delegation to the package export, behavior tests prove identity and safe fallback, and `pnpm typecheck` keeps editor consumers on the browser-enriched type.
- **CA-A4** (ALTA): behavior preservation — `projectFiles(name, start)` output is byte-identical pre/post refactor. Pass/fail: golden snapshot of `projectFiles('fixture-name', 'demo')` and `('fixture-name', 'blank')` (the full `Record<string, string>`) captured from main BEFORE the refactor, asserted byte-equal after; plus full ladder green. The 7 existing `template.test.ts` assertions do NOT decide this claim on their own.
- **CA-A5** (ALTA): `scripts/sync-scene.mjs` still runs and is idempotent. Pass/fail: the exact sequence `pnpm build && node scripts/sync-scene.mjs && git diff --exit-code -- packages/editor/template/src examples/platformer/src` exits 0 (build inlined: the script hard-requires fresh dists — header line 5, dist imports at lines 35-38).
- **CA-A6** (ALTA, build-coupled): published-shape dists of `@waica/engine`, `@waica/behaviors` and `@waica/archetype-platformer` are plain-Node-loadable — relative imports carry explicit extensions. `pnpm test:dist` starts with a clean full build, rejects missing/stale dist files and any extensionless relative import, packs the three packages, untars them into a temporary `node_modules`, then spawns plain Node importing `@waica/engine`, `@waica/behaviors`, `@waica/archetype-platformer` and `@waica/archetype-platformer/manifest`; it also asserts the published subpath mapping. The rung is enforced by release scripts and publish CI. Bare `pnpm test` stays green and buildless.
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
| 9 | ¿Campos del manifest / cómo se hace Node-importable? | Sin `artUrls` en la entrada Node-safe; subpath asset-import-free; arte como paths de `assets/` | confirmada |
| 10 | ¿Refactor del editor generaliza? | Estrictamente behavior-preserving | confirmada |
| 11 | ¿Re-exports de compat para EntityTemplate/ArchetypeArt? | Clean break, sin bump (nada publicado) | confirmada |
| — | ¿Emit de dists cargable por Node pelado? | Sí, en esta spec (prerequisito de producción de B) | elegida por usuario (mecanismo: fix emit + test:dist) |
| — | ¿ADR-0002 se enmienda con los campos plegados? | Sí (CA-A7) | [PANEL] derivada del completeness critic |

## Verificabilidad

Mixto: **CA-A2..A6 ALTA** — todo se observa con tests deterministas que el contrato corre hoy (`pnpm test` ~2s verde, 444 tests) más el rung `test:dist` que limpia, construye y pack-simula (~5s, verificado); **CA-A1 y CA-A7 BAJA** — tipos y docs solo tienen señal indirecta (`pnpm typecheck` / grep). El panel adversarial refutó y corrigió: A1 no es ALTA (vitest no chequea tipos — probado en vivo), A4 exige snapshot dorado (los asserts existentes no observan "sin cambios"), A5 exige el build inlined, y la pata Node de A2 no puede correr dentro del `pnpm test` pelado sin romper el comando verificado del contrato en un clon fresco — por eso `test:dist` is a separately enforced fresh-build rung instead of a skip-prone unit test.

## Plan de verificación

1. `pnpm typecheck` — CA-A1, y soporte de A2/A3.
2. `pnpm test` (bare, buildless) — CA-A2 (both manifest entries), CA-A3 (source delegation, identity and safe fallback), CA-A4 (byte-identical golden snapshots).
3. `pnpm build` — prerequisite for the sync-scene check.
4. `node scripts/sync-scene.mjs && git diff --exit-code -- packages/editor/template/src examples/platformer/src` — CA-A5.
5. `pnpm test:dist` — CA-A6: clean rebuild + stale/import-specifier checks + pack simulation + plain-Node imports of all real entry points + published export mapping.
6. Grep del ADR — CA-A7.

## Riesgos y gaps

- El snapshot dorado de CA-A4 debe capturarse desde main ANTES de empezar el refactor (si se captura después, no observa nada).
- `test:dist` stays outside the root Vitest include so `pnpm test` remains buildless; `pnpm test:dist`, release scripts and publish CI enforce the built artifact separately.
- Explicit ESM specifiers affect all three library builds; source and packed-output guards prevent a future extensionless import from silently shipping.
- `.sdd/project.md` now records the 444-test suite and the published-shape rung.

## Resultado de ejecución (2026-08-04)

| CA | Estado | Evidencia |
|---|---|---|
| CA-A1 | verificado | `pnpm typecheck` completed successfully across all 6 runnable workspace projects; the engine fixture satisfies `ArchetypeManifest`. |
| CA-A2 | verificado | `manifest.test.ts` imports both entries; packed plain Node loads both the root and `/manifest`, whose registry resolves `waica:dog` to `assets/waica-dog.png`. |
| CA-A3 | verificado | `archetype.test.ts` proves source delegation, package-export identity and fallback for `toString`, `constructor` and `__proto__`. |
| CA-A4 | verificado | Both pre-refactor full `projectFiles('fixture-name', start)` golden snapshots passed byte-for-byte under `pnpm test`. |
| CA-A5 | verificado | `pnpm build && node scripts/sync-scene.mjs && git diff --exit-code -- packages/editor/template/src examples/platformer/src` exited 0. |
| CA-A6 | verificado | `pnpm test:dist` removed a planted stale module, rebuilt cleanly, matched source↔dist files, rejected extensionless imports, packed all three packages and loaded every public entry in plain Node. |
| CA-A7 | verificado | ADR-0002 contains both `entityIcons` and `actionLabels`. |

Full regression after review hardening: `pnpm test` passed 444/444 tests in 52 files; `pnpm typecheck`, `pnpm test:dist` and `pnpm build` passed with the pre-existing editor chunk-size warning. Autonomous ladder ceiling: editor live smoke returned HTTP 200 and the process was stopped cleanly. Deviations: none.

## Post-review hardening (2026-08-04)

The review findings led to stronger guarantees without changing feature scope: root and subpath imports now both work in plain Node; the Node entry has package-relative asset resolution; editor browser manifests require `artUrls`; top-level `prefabs` drives project generation; prototype-colliding ids fall back safely; compile-time fixtures emit no runtime code; and the dist rung now owns freshness, dependency-declaration checks, exhaustive import-extension checks, release wiring and publish-CI enforcement.
