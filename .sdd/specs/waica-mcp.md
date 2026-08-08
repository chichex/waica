# Spec — @waica/mcp: MCP server for agentic game development
<!-- Generada por /sdd-spec el 2026-08-04. Fuente: pedido libre (contrato de diseño @waica/mcp, sesión grill 2026-08-03). Estado: implementada -->
<!-- Spec B de 2 encadenadas: depende de .sdd/specs/archetype-manifest.md (Spec A). ADRs: docs/adr/0001, docs/adr/0002. -->

> **Superseded decisions (2026-08-05):** Issue #20 deliberately replaces this spec's “project TypeScript is never executed” constraint for `validate_project` only. Validation now executes project component, role and state modules in isolation to inspect typed parameter references; `list_components` remains textual for project-owned code. The same issue raises the bundled MCP and CLI Node floor from `>=20.19` to `>=22.18`, where native type stripping is enabled by default. Below that floor — `node:module`'s `registerHooks` only needs Node >=22.15 — the server still starts and every other tool still works: deep component loading is skipped with a `component-load-unsupported` info finding until the host upgrades.
>
> **Run/bridge/screenshot exclusion superseded (2026-08-08):** issue #24 replaces this spec's former live Runtime Bridge, Run Session and screenshot non-goal. The file-oriented contracts below remain historical input; `.sdd/specs/issue-24-mcp-runtime-harness.md` owns the shipped runtime contract.

## Contexto

DESIGN.md names "plain-text project + small typed API + headless CLI = the most comfortable engine to work on with AI" as a founding thesis; this spec ships it as `packages/mcp` → npm `@waica/mcp`: a stdio MCP server an agent host connects (`claude mcp add waica -- npx @waica/mcp`) to develop a USER's game project. Hybrid surface (the agent keeps editing JSON/TS with its own file tools): introspection + validation + a few high-leverage mutations. Truth comes from the project's own `node_modules` (ADR-0001); archetypes are discovered via the standard `ARCHETYPE` manifest (ADR-0002, Spec A). No live editor bridge in v1 — the MCP operates on files; coexistence with an open editor is documented, not engineered. The editor already owns every shape the MCP must replicate: project generation (`packages/editor/src/project/template.ts`), scaffold templates (`components.ts:56-75`, `states.ts:154-219`, `fs/ui-fs.ts:40-55`), and the validation model (`states.ts:88-146` stateIssues; engine `scene.ts:108-135` warn semantics).

## Comportamiento esperado

**Las 9 tools**: `create_project`, `list_components`, `describe_archetype`, `project_summary`, `validate_project`, `scaffold_component`, `scaffold_role`, `scaffold_state`, `scaffold_ui`.

- **CA-B1** (ALTA) — `create_project`: writes the exact chassis file set of the editor's `projectFiles()` (12 files) plus, for `start: 'demo'` (default; `'blank'` = chassis only), the archetype content generated from the bundled `ARCHETYPE` manifest — including the `waica:*` URI → `src/art/<file>` substitution and the `game.json`/`controls.json` injections. Project name = basename of `project_path`, validated against the editor regex `/^[a-z0-9][a-z0-9-_.]*$/` (error otherwise, no separate `name` param). Target dir: created if missing (parent must exist — error naming a missing parent), accepted if empty; non-empty → error listing what was found, writes NOTHING (no force flag); a file at the target path → error. Stamps ONE version source of truth — the resolved version of the MCP's bundled `@waica/engine` — into the generated `package.json` (parity test stamps both sides from that same value, so parity is version-independent). Art: copies PNGs from the archetype package's `assets/` mapped by `manifest.art[].file`; written set equals the keys of the editor's `projectArtFiles()`, each file byte-equal to its `assets/` source, and every `src/art/...` string referenced in generated JSON exists on disk. Never runs `npm install`; returns next-steps text that MUST contain the substrings `cd <basename>`, `npm install`, `npm run dev` and the pre-publish caveat sentence. Template resolution: `dist/template` with a dev fallback to `packages/editor/template` (source tree), so tests run buildless. Mechanism: mkdtemp fixture tests + parity test vs the editor's `projectFiles()`/`projectArtFiles()` under root vitest (proven possible: editor has no `exports` field; deep imports + ?raw work cross-package).
- **CA-B2** (ALTA) — `list_components`: returns the archetype registry's component classes (13 for platformer) with `componentName`, `displayName` (present iff the class declares it — only 3 of 13 do), `params`, `defaults` (the class's public authoring surface via `@waica/engine`'s `authoringDefaults` — see `list-components-authoring-defaults`, issue #21; `{}` when the constructor throws) and source package; plus a `projectOwned` section listing `*.ts` paths under `src/components`, `src/roles` AND `src/states` (aligned with the runtime globs in template `main.ts` and CA-B5's scan), marked not-validated and NEVER executed. Mechanism: fixture-project tests with handwritten stub `node_modules` packages exposing marker components (`packages/cli/src/server.test.ts` mkdtemp recipe).
- **CA-B3** (ALTA) — `describe_archetype`: active id from `src/game.json` (tolerant parse); package resolved project-first per ADR-0001; optional `archetype` param; valid ids = project deps UNION the MCP-bundled set; unknown id → tool error naming available ids (NO silent platformer fallback — sharp divergence from the editor's `resolveArchetype`). Response schema enumerated (deepEqual-decidable): `id`, `label`, `palette` (entity templates: name + component list), `prefabs` (refs + type + component list), `roles` (from the bundle: name, description, driver, signals, state graph), `bindings`, `actionLabels`, `ui` piece names, `art` (file + uri), `entityIcons`. With several archetype packages installed: describes the active one, lists the rest as `installed, not active`. Mechanism: fixture-project tests.
- **CA-B4** (ALTA) — `project_summary`: enumerated response schema, each field with its source: `scenes` = basenames of `src/scenes/*.scene.json`; `prefabs` = refs reconstructed from `src/{characters,objects,tiles}/*.<type>.json` (ref + type); `components`/`roles`/`states` = `*.ts` basenames under their dirs; `ui` = `*.html` names under `src/ui`; `stats` = keys of `src/stats.json`; `controls` = action → bindings entries; `archetype` = id from `game.json`. Mechanism: deepEqual against fixture expectations.
- **CA-B5** (ALTA) — `validate_project`: returns machine findings `{severity: error|warning|info, code (stable), message, file, ref?}` + summary counts + `ok` boolean. isError ONLY for cannot-validate (missing path, not a waica project); findings — even errors — are result data; unparseable scene/prefab JSON is a finding (`unparseable-json`), not a tool failure. Validates EVERYTHING present (all scenes, all prefabs even unreferenced, ui, controls/stats/game/params), noting as info that the shipped runtime only loads `main.scene.json`. Stable codes: `unknown-component` (with a textual scan of `componentName = '...'` statics across `src/components|roles|states` — textual candidate → `project-owned, not validated` info instead of error), `broken-prefab-ref`, `override-key-not-in-prefab`, `missing-clip`, `dangling-transition-target`, `unreachable-state`, `no-state-code` (info — the editor's 4th stateIssue, remedied by `scaffold_state`), `input-action-unbound`, `undeclared-stat` (warning — code may create stats at runtime), `unknown-ui-piece`, `camera-follow-unknown-entity`, `unparseable-json`. Issue #20 adds two codes for the project TypeScript execution it introduces: `component-load-failed` (error) and `component-load-unsupported` (info — a host or syntax gap, not a project defect) — and reuses the existing codes at the param level: a typed `ParamSpec.ref` (`prefab`, `clip`, `action`, `stat`) is validated the same way a prefab-level or state-transition reference is, with `input-action-unbound` keeping the pre-existing state-transition check's warning severity, and bound/unbound decided from `src/controls.json` alone — an archetype manifest's `bindings` only ever contributes known action names, never binding truth. Clips model = the editor's per-character stateIssues (`state.clip ?? stateName` vs sibling AnimatedSprite clips when that sibling exists; no sprite means no animation contract to check; an explicit empty `state.clip` is looked up literally and validated like any other value, not treated as "no reference" — unlike `Collectible.stat`, which the runtime genuinely treats as unset when empty); no `AnimationContract` data in v1. Mechanism: pure unit tests over fixture JSON trees.
- **CA-B6** (ALTA) — the four scaffolds produce the editor's EXACT template output (string equality as oracle): `scaffold_component` = `componentFileTemplate` incl. PascalCase transformation and reserved-name `Component` rejection (editor alerts become tool errors; output reports resulting class name and path); `scaffold_role` = `roleFileTemplate`; `scaffold_state` = `stateFileTemplate` (BOTH branches: `role='player'` and generic); `scaffold_ui` = `NEW_UI_HTML`. Existing target file → success `{path, created: false, reason: 'exists'}` (agent edits it with its own tools), NEVER overwrites. Mechanism: unit tests + parity assertions importing the editor's template modules.
- **CA-B7** (ALTA) — the server registers exactly the 9 tools with JSON schemas and round-trips a tool call. Mechanism: vitest test via `@modelcontextprotocol/sdk` client over `InMemoryTransport.createLinkedPair()` (verified shipped by the SDK): set-equality on tool names + one round-trip. The stdio/built-artifact claim is CA-B12's, not this one's.
- **CA-B8** (ALTA) — source-of-truth matrix (ADR-0001): project `node_modules` copy wins (`source: 'project'`); no `node_modules` → bundled fallback (`source: 'bundled'`); partial installs resolve PER PACKAGE, with a mixed-sources warning derived from the provenance array containing >1 distinct source; an arbitrary package present but unloadable → tool error naming package and cause, NO silent fallback. The repository's own pre-publish workspace link may use the built files only when its real package root equals the MCP fallback root; project provenance and version remain authoritative. Every tool response carries provenance as an ARRAY of `{package, version, source}` rows — one per `@waica` package the answer resolved from. Loading strategy pinned to Node's REAL loader: `createRequire` anchored in the project (probe-proven: native require inside vitest reproduces production behavior exactly, including the type-stripping error, while vite's `import()` loads TS that production Node rejects). Mechanism: stub-`node_modules` fixture matrix, one fixture per cell.
- **CA-B9** (ALTA) — packaging: `@waica/mcp` 0.1.0 (independent versioning), `bin: {"waica-mcp": "dist/cli.js"}` with shebang, `files: ["dist"]`, pure-bin (no lib exports), `engines: {"node": ">=20.19"}` (exact string asserted — the `require(esm)` unflagged floor; consistent with CA-B8's loader), runtime deps = `@modelcontextprotocol/sdk` (major pinned) + `@waica/engine`/`behaviors`/`archetype-platformer` as normal dependencies (`workspace:^` in-repo → published versions on publish; npm delivers the bundled fallback copies, no vendoring script). Build = `node ../../scripts/clean-dist.mjs && tsc -p tsconfig.build.json && node bundle-template.mjs` (cleans stale output, then copies `../editor/template` into `dist/template`; `@waica/editor` as devDependency for topological ordering — the CLI's proven pattern). Root `typecheck`/`test`/`build`/`release` pick the package up automatically (workspace glob, root vitest include, non-private under `packages/*`). Mechanism: package.json field assertions + dist-layout assertions in `test:dist`.
- **CA-B10** (BAJA) — docs: `packages/mcp/README.md` exists and contains all 9 tool names, a section on the `project_path` model (absolute paths), a section on editor coexistence (reload the project after agent edits; the editor may overwrite on save), and the pre-publish install caveat; root README references `@waica/mcp`. All grep-decidable. Human leg = 3 binary questions: Can you connect the server using only the README's command? Does every tool have a one-line description? Is the pre-publish caveat stated?
- **CA-B11** (NULA) — real-agent e2e, human protocol (pre-publish variant, the only one that works today): 1) `pnpm build` at the repo root; 2) `claude mcp add waica -- node <repo>/packages/mcp/dist/cli.js`; 3) in a Claude Code session, ask for a new platformer project in `<repo>/examples/<name>` and a custom component + a scaffolded state; 4) edit the generated `package.json`'s three `@waica/*` deps to `workspace:^`, run `pnpm install` at the repo root, then `pnpm --filter <name> dev`; 5) PASS iff the session transcript shows waica MCP tool calls AND the Vite URL renders the demo level in the browser. Post-first-publish follow-up (`npm install` variant) is a separate future check, not part of this CA.
- **CA-B12** (ALTA, build-coupled) — cross-cutting semantics + shipped-artifact smoke: `project_path` must be absolute for EVERY tool (relative → tool error explaining that a stdio server's cwd belongs to the host); every tool except `create_project` returns the same cannot-operate error shape on a missing path or non-project dir (waica-project marker: `src/game.json` OR `src/scenes/main.scene.json` exists; only one missing → note, not rejection; `create_project` inverts the requirement); scaffolds therefore refuse to run in a non-project dir. Shipped-artifact leg (extends Spec A's `test:dist`): pack-simulate the `@waica` deps into a tmp `node_modules` (publishConfig applied) → spawn `node dist/cli.js` over REAL stdio → one `create_project` round-trip. This single test closes the production-loader blindspot the panel proved (nothing else between B1 and B10 executes the built cli.js with its real module graph). Mechanism: mkdtemp fixtures (absolute-path/marker matrix) under `pnpm test`; stdio smoke under `pnpm test:dist`.

## Fuera de alcance

- Editor Play integration and editor file watching. Standalone Run Sessions, the engine-owned Runtime Bridge and screenshots are now owned by issue #24.
- Executing project-owned TS in any form (introspection of `src/**` stays textual).
- `mcp` subcommand in `@chichex/waica` (the CLI stays dependency-free and untouched).
- Extracting the editor's `projectFiles()` to a shared package (duplicated in MCP + parity test instead — inference #40).
- `AnimationContract` per-archetype data; multi-archetype editor UI; publishing to npm (human-only per contract).

## Inferencias

Tabla completa de 34 revisada por el usuario el 2026-08-03 ("todas bien" + 3 de confianza baja preguntadas individualmente), más las tardías del panel. Resolución por fila:

| # | Inferencia | Elección | Resolución |
|---|---|---|---|
| 2 | Arquetipos bundleados v1 | Solo platformer; id desconocido = error | confirmada |
| 3 | Fuente del archetype activo | `game.json` manda; project-first; param opcional | confirmada |
| 4 | Fallback silencioso a platformer | No — error nombrando ids disponibles | confirmada |
| 5 | Alcance de list_components | Registry del archetype (13) + project-owned aparte | confirmada |
| 6 | Datos del check de clips | Modelo stateIssues del editor; sin AnimationContract | confirmada |
| 7 | Modos de create_project | demo\|blank, default demo, bundlea 3 PNGs | confirmada |
| 8 | Fuente del template | Chassis de `projectFiles()` + contenido desde manifest | confirmada |
| 12/16/34 | Versión estampada | La real de los `@waica/*` bundleados (una fuente) | confirmada |
| 13 | Destino no vacío | Error listando contenido, no escribe nada, sin force | confirmada |
| 15 | Nombre del proyecto | Basename de `project_path` + regex del editor | confirmada |
| 18 | Scaffold sobre archivo existente | Éxito `{created: false}`, nunca sobreescribe | confirmada |
| 19 | Sanitización de nombres | Transformación del editor; alerts → tool errors | confirmada |
| 20/21 | Forma y semántica de validate | Findings JSON; isError solo "no pude validar" | confirmada |
| 22 | Alcance de validate | Todo lo presente, con nota sobre main.scene.json | confirmada |
| 23 | Desconocido posiblemente propio | Escaneo textual de `componentName` → info | confirmada |
| 26 | project_path | Solo absolutos | confirmada |
| 27 | Marcador de proyecto waica | `game.json` O `main.scene.json` | confirmada |
| 28 | Major mismatch | Sin gate; provenance visible | confirmada |
| 24 (baja) | Paquete presente pero no cargable | Error con causa, sin fallback silencioso | elegida por usuario |
| 25 (baja) | Granularidad del fallback | Por paquete, warning al mezclar | elegida por usuario |
| 31 (baja) | engines | Declarar piso de Node | elegida por usuario |
| 30/32/37/38/41 | Protocolo/bundling/versión/bin/forma | SDK oficial; deps npm normales; 0.1.0 independiente; bin `waica-mcp`; puro-bin | confirmada |
| 33/35 | Docs y prerequisito npm | README package + sección en root; publish como prerequisito/riesgo | confirmada |
| 40 | Generación compartida vs duplicada | Duplicada + test de paridad | confirmada |
| — | 9ª tool `scaffold_state` | Sí (cierra el loop con el finding `no-state-code`) | elegida por usuario (tardía, del panel) |
| — | Blindspot de producción | `test:dist` + fix de emit (Spec A) + smoke stdio (CA-B12) | elegida por usuario (mecanismo) |
| — | Semántica de `displayName`/`defaults` | Presente sii declarado / `new Class()` con `{}` on throw | [PANEL] endurecimiento de #5 |
| — | Provenance singular → array | Array de `{package, version, source}` | [PANEL] coherencia de #23/#25 |
| — | engines exacto | `>=20.19` (piso de `require(esm)`, consistente con el loader) | [PANEL] endurecimiento de #31 |
| — | Schemas de describe/summary | Enumerados campo a campo (deepEqual-decidable) | [PANEL] observabilidad |
| — | Alcance project-owned de B2 | `components|roles|states` (alineado con runtime y B5) | [PANEL] coherencia |
| — | Parent inexistente / archivo en el target | Error nombrando el problema (no mkdir recursivo del parent) | [ASSUMED] sesgo mínimo seguro |

## Verificabilidad

Mixto: **CA-B1..B9 y B12 ALTA** — fixtures deterministas bajo el `pnpm test` pelado del contrato (recetas probadas en el repo: mkdtemp de `server.test.ts`, imports cross-package del editor demostrados en vivo por el panel) + el rung `test:dist` post-build para el artefacto shippeado; **CA-B10 BAJA** (checklist grep + humano); **CA-B11 NULA** (exige humano y agente real — protocolo agendado, no escondido). El panel adversarial refutó y esta spec ya incorpora: el loader debe ser el de Node real (`createRequire`) o los fixtures de B8 mienten (probado: vitest carga TS que producción rechaza); "over stdio" salía verde sin ejecutarse nunca (partido en B7 in-memory + B12 smoke real); schemas de respuesta sin enumerar hacían B3/B4 indecidibles; y `npm install` en el protocolo humano era inejecutable pre-publish (404 de `@waica/*` verificado).

## Plan de verificación

1. `pnpm typecheck` — señal de soporte en todos los CA.
2. `pnpm test` (pelado) — CA-B1..B8, B12 (matriz absoluta/marcador): unit + fixtures mkdtemp + paridad contra los módulos del editor + cliente SDK in-memory.
3. `pnpm build` — CA-B9 (layout) y prerequisito de 4.
4. `pnpm test:dist` — CA-B9 (asserts de dist) + CA-B12 (pack-simulación → spawn `node dist/cli.js` por stdio → round-trip de `create_project`). Hard-fail sin dist.
5. Grep checklist — CA-B10 (autónomo).
6. Protocolo humano — CA-B10 (3 preguntas binarias) y CA-B11 (pasos 1-5 arriba).

## Riesgos y gaps

- **Depende de Spec A** (`archetype-manifest.md`): sin el subpath `/manifest` Node-safe y el fix de emit, CA-B12 no puede pasar. Orden forzoso A → B.
- **`[NEEDS-INPUT]` scope npm `@waica`**: nada publicado y NO está probado que el org sea reclamable (el repo ya comió este riesgo una vez: `waica` pelado bloqueado → `@chichex/waica`). Checklist pre-release humano: reclamar/verificar el org ANTES de congelar el nombre; fallback documentado: `@chichex/waica-mcp`. El primer `pnpm release` debe publicar `engine`/`behaviors`/`archetype-platformer` JUNTO con `mcp` (ya son non-private y entran solos).
- Proyectos generados no instalables vía `npm install` hasta ese primer publish — CA-B11 usa el procedimiento workspace por eso; el variant npm queda como follow-up post-publish.
- `@modelcontextprotocol/sdk` entra como primera dependencia runtime externa de un package publicable del repo (decisión confirmada #31/26); pinnear major.
- El editor NO detecta cambios externos: la coexistencia es documental (README), no técnica — riesgo de pisadas si el usuario tiene el proyecto abierto en el editor mientras el agente escribe.
- Findings preexistentes anotados (no se tocan en estas specs): drift `WAICA_VERSION='0.1.0'` hardcodeado en el editor vs CLI 0.2.0; contrato `.sdd/project.md` con conteo de tests desactualizado (424 vs 434).

## Resultado de ejecución (2026-08-04)

| CA | Status | Evidence |
|---|---|---|
| CA-B1 | verified | `create-project.test.ts` proved complete demo/blank parity against `projectFiles()`/`projectArtFiles()`, no-write errors, PNG bytes, URIs and next steps. |
| CA-B2 | verified | `introspection.test.ts` observed all 13 classes, only 3 `displayName` declarations, params/defaults, a throwing constructor and all three textual-code directories. |
| CA-B3 | verified | Fixtures proved active/explicit ids, missing/malformed-game rejection, malformed package warnings, isolation of absent and broken inactive archetypes, and propagation of active-package failures. |
| CA-B4 | verified | A deep-equal fixture verified scenes, prefab refs/types, code, UI, stats, controls and archetype from their declared file sources. |
| CA-B5 | verified | `validation.test.ts` produced all 12 stable codes, validated unnamed entities, shape-guarded inherited components, recognized scaffolded role code, skipped clip checks without sprites and reported malformed package JSON as data. |
| CA-B6 | verified | String parity passed against all four editor modules, including both state branches, component naming and never-overwrite behavior. |
| CA-B7 | verified | An SDK client saw exactly 9 tools with schemas, checked execution-aware read-only annotations and completed a round-trip. |
| CA-B8 | verified | The project/bundled/partial/hoisted/workspace-link/unloadable/escaped-entry matrix passed; a scoped checkout bridge cannot override project-anchored resolution. |
| CA-B9 | verified | Vitest checked exact metadata and clean build; `test:dist` derives workspace ranges from source versions and materializes a symlink-free dependency graph. |
| CA-B10 | pending human | The autonomous grep checklist passed: 9 tools, absolute paths, coexistence, caveat and root reference. The 3 binary questions remain. |
| CA-B11 | pending human | The pre-publish Claude Code and browser protocol was not run autonomously. |
| CA-B12 | verified | Absolute-path and cannot-operate matrices passed for all 9 tools; `pnpm test:dist` launched checkout and packed CLIs over stdio, proved workspace links and a divergent project-owned manifest, and kept packed resolution hermetic. |

Regression and ladder: `pnpm typecheck` passed; `pnpm test` passed 514/514 tests in 59 files (70 new); `pnpm build` passed with the pre-existing editor chunk warning; `pnpm test:dist` passed; the editor live smoke returned HTTP 200 and its process was stopped. Approved deviations are recorded in the second review hardening section below.

### Pending human checklist

**CA-B10**
- [ ] Can the server be connected using only the README command?
- [ ] Does every tool have a one-line description?
- [ ] Is the pre-publish caveat stated clearly?

**CA-B11**
- [ ] Run steps 1–5 of CA-B11's real-agent e2e protocol and retain the transcript plus evidence of the rendered demo.

## Post-review hardening (2026-08-04)

The correctness review added nine regression cases and closed twelve findings without expanding feature scope: checkout-local startup now maps built workspace packages before loading the server; project resolution handles hoists and this repository's pre-publish links while arbitrary unloadable installs still fail; package attribution uses stable component names across mixed sources; tolerant summaries handle non-object JSON values safely; state scaffolds reject names that cannot be TypeScript keys; validation ignores malformed entity entries, avoids unrelated override duplicates and scans UI text nodes only; malformed `game.json` no longer silently selects platformer for introspection; missing inactive archetype dependencies are isolated with a warning; and the dist gate's helper exclusion now matches the top-level tsconfig rule exactly.

The user explicitly chose to preserve three reviewed behaviors because they are approved cross-package contracts rather than MCP-local defects: CA-B2 keeps the editor's enumerable-own-field defaults model; CA-B5/B6 keep the flat `src/states/<state>.ts` editor/runtime convention; and an unknown active archetype remains a cannot-validate tool error because the stable finding-code set defines no substitute. Those contracts should be redesigned in their owning engine/editor specs, not changed silently here.

CA-B2's defaults model was redesigned as scoped here: `list-components-authoring-defaults` (issue #21) replaced the raw enumerable-own-fields model with `@waica/engine`'s `authoringDefaults`, shared with the editor's `classDefaults`. `validate_project`'s internal param-reference checks and project-owned component loading still use the raw model for their own purposes — see that spec's "Fuera de alcance".

## Second review hardening (2026-08-04)

A second correctness pass added twelve regression cases and closed thirteen findings. Project resolution now verifies that Node's resolved entry belongs to the reported package root; the checkout bridge is limited to imports originating inside built workspace `dist` trees, and the artifact smoke proves a divergent project-owned manifest still wins. Archetype discovery reports malformed project metadata, isolates broken inactive packages while preserving an active package's cause, and never infers platformer when `game.json` is absent. Validation processes unnamed object entities, shape-checks inherited components, recognizes textual `defineRole`/`defineStates` registrations, reports malformed `package.json` through `unparseable-json`, and only checks clips when an `AnimatedSprite` establishes a clip contract. Execution-capable tools no longer claim the MCP read-only hint. The MCP build cleans `dist`; packed dependency ranges follow source versions; external dependencies are recursively copied into a symlink-free sandbox.

The approved small deviations are: CA-B5 refines the editor parity model by suppressing a false `missing-clip` warning when no sibling sprite exists; CA-B8 permits only the same-real-package pre-publish workspace link to use its built counterpart, without changing project provenance; and CA-B9 adds the repository-standard clean step before its previously exact build command. The user again preserved the two remaining reviewed behaviors: CA-B2's enumerable-own-field defaults model and CA-B5/B6's flat, never-overwrite `src/states/<state>.ts` convention, including its cross-role filename limitation.
