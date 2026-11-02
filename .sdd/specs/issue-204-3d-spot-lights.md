# Spec — SpotLight 3D
<!-- Escrita el 2026-11-01 en gentle-pi. Fuente: issue #204 y grill 2026-11-01-issue-204-3d-spot-lights. Estado: draft -->
<!-- SDD-Tracking: version=1; type=spec; state=draft; issue=chichex/waica#204; grill=2026-11-01-issue-204-3d-spot-lights; superseded-by=none -->

## Contexto

Bloque 6 del roadmap 3D (#213, paso 3). Hoy las escenas 3D tienen `Sun` y `PointLight`. Ambas extienden `ShadowLight` y comparten la política de sombras de #203 (perfiles, herencia, capacidad, helpers, snapshot).
Fuente autoritativa: `.sdd/grills/2026-11-01-issue-204-3d-spot-lights.md`, finalizado. Sus decisiones están confirmadas; esta spec no las reabre. Base explorada: `ce43f03`.

Hechos técnicos que condicionan la spec:

- `game-shadows.ts`, `shadow-edit-capacity.ts`, `scene-shadows.ts` (`resolveLightShadow(kind: 'sun' | 'point')`, `PROFILE_MAP_SIZES`) y `runtime-lighting-snapshot.ts` están tipados como `Sun | PointLight`. Agregar una luz exige generalizarlos.
- Three 0.186.1, `SpotLightShadow.updateMatrices`: `fov = 2·angle·focus` y `far = light.distance || camera.far`. Three reescribe `far` desde la distancia luminosa, igual que pasaba con PointLight (`point-shadow.ts`, `RangedPointShadow`). Asignar `shadow.camera.far` no alcanza.
- El helper de alcance de PointLight se oculta con `distance` 0 (`viewport-3d-helpers.ts:175`).

## Diseño

**Superficie:** editor web, `packages/editor/src`, con los tokens de `styles.css`. Sin cambio de dirección visual ni pantallas nuevas.

- **Inspector de SpotLight:** filas generadas por metadatos, como PointLight. `castShadows` y la sección avanzada de overrides reutilizan `light-shadow-overrides.tsx`, con las mismas semánticas de «Heredar escena» y «Restablecer al prefab».
- **Viewport 3D:** cono de alambre para cada SpotLight, bajo el toggle de helpers. Cobertura de sombra solo para la luz seleccionada (`viewport-shadow-helpers.ts`). Icono de picking propio (`viewport-3d-icons.ts`). Nunca en Play ni en capturas del juego.
- **Estados:** apagado, activo, heredado, override e inválido, igual que #203.
- **Accesibilidad:** controles nativos, etiquetas y teclado actuales.

## Comportamiento esperado

Grados según `.sdd/project.md`: ALTA = tests deterministas; MEDIA = navegador/benchmark real.

### Componente y formato

- **CA-1 (ALTA) — Componente.** `SpotLight` (`componentName 'SpotLight'`, `space '3d'`, `displayName 'Spot light (3D)'`) extiende `ShadowLight`. Props: `color`, `intensity`, `distance` (0 = sin límite), `decay`, `angle`, `penumbra`, `direction`, `offsetX/Y/Z`, más los params de `ShadowLight`. Defaults y rangos en I-1. La luz three cuelga del nodo de la entidad; su target también, así que posición y dirección giran y escalan con la entidad. Cambiar cualquier prop se refleja antes del siguiente render, sin Simulation Steps. En 2D no crea nada.
- **CA-2 (ALTA) — Dirección local.** `direction` es un `vector3` en el marco local de la entidad. Rotar la entidad 90° en Y hace que una spot con `direction [0, 0, -1]` apunte a `[-1, 0, 0]` en el mundo. Un vector nulo o no finito se diagnostica y usa el default, sin NaN [I-1].
- **CA-3 (ALTA) — Validación.** `validate_project` reconoce `SpotLight` inline, en prefabs y en overrides de instancia. Reporta ruta, campo y valor inválido de cada prop propia y de sombra. `null` heredado, `false` y `0` válidos no se rechazan. JSON, setters y overrides comparten normalización. El MCP valida sus params de sombra igual que en `Sun` y `PointLight` (`component-param-findings.ts`).
- **CA-4 (ALTA) — Registro y exports.** `SpotLight` se exporta desde `@waica/engine` y se registra en cada registry de archetype que hoy registra `PointLight`. `create_project` y la introspección MCP la listan.

### Sombras

- **CA-5 (ALTA) — Política.** Proyecta por defecto con PCF, por el `WebGPURenderer` existente. Comparte herencia, overrides, apagado global y capacidad de #203. Los perfiles suman una columna spot: Bajo 512², Medio 1024², Alto 2048² [I-2]. La tabla de Sun y PointLight no cambia. Desactivar `castShadows` conserva la iluminación.
- **CA-6 (ALTA) — Alcance.** Alcance de sombra efectivo = `min(distance, shadowMaxDistance)` si `distance` > 0; con `distance` 0, el alcance de sombra. La iluminación sigue más allá: no se reduce `light.distance` ni la intensidad para simularlo. Caso obligatorio: `distance` 9, alcance de sombra 2; un receptor a 1.5 unidades sobre el eje queda sombreado y uno a 5 no. Probar el resultado, no la asignación de `shadow.camera.far` [I-3].
- **CA-7 (ALTA) — Cámara de sombra.** El fov de la cámara de sombra cubre el cono (`2·angle`; la penumbra suaviza dentro de ese borde, no lo amplía). near y far son finitos y válidos. Mover la entidad, cambiar `angle` o `direction`, o mover un caster actualiza la sombra en el próximo render.
- **CA-8 (ALTA) — Ciclo de vida.** Desactivar, cambiar el tamaño o el preset, destruir la luz, cambiar de escena o disponer el Game libera su mapa, sus nodos y su target. Son 10 ciclos instrumentados, sin crecimiento retenido. No se crean targets nuevos por frame.
- **CA-9 (ALTA) — Sin regresión de las otras luces.** Generalizar los tipos compartidos no cambia la resolución, la capacidad, el snapshot ni los helpers de `Sun` y `PointLight`. Los tests existentes de #203 siguen verdes sin tocar sus assertions sobre Sun y PointLight. La única edición admitida es sumar la clave aditiva `spotLights: []` donde un test compara el objeto `lighting` completo (CA-10).

### Inspección

- **CA-10 (ALTA) — Snapshot.** `lighting.spotLights` lista cada SpotLight viva en orden de spawn. Incluye `entity`, `id`, `position` y `direction` en mundo (unitaria, redondeada como `sun`), `color` (`#rrggbb`), `intensity`, `distance`, `angle`, `penumbra` y `shadows` (`RuntimeSnapshotLightShadows`). Con cero spots en 3D da `[]`. En 2D la clave no existe. No serializa objetos Three ni agrega herramientas MCP.

### Editor

- **CA-11 (ALTA) — Inspector.** Las props se editan con `PropRow`/`NumberField` y la sección avanzada de overrides de sombra. Caso obligatorio de #203 aplicado a spot: escena 1024, prefab 512, instancia 256; «Heredar escena» resuelve 1024 y «Restablecer al prefab» restaura 512. Undo/redo y reabrir el Project restauran el JSON. El viewport recibe los cambios sin entrar en Play. Testing Library bajo StrictMode.
- **CA-12 (ALTA) — Helpers.** Cono de alambre por SpotLight, con vértice en la posición mundial de la luz (offset incluido), eje en su dirección mundial, largo `distance` y radio `distance·tan(angle)`. Oculto con `distance` 0, igual que la esfera de PointLight [I-4]. Respeta el toggle, no altera picking ni JSON y no aparece en Play. La cobertura de sombra aparece solo con una única spot seleccionada y sombras efectivas activas. Usa el mismo volumen que el render del frame actual. Reutiliza `HELPER_COLOR` y materiales, sin hex nuevos en TSX.
- **CA-13 (ALTA) — Picking.** Una entidad con SpotLight y sin Model muestra su icono propio y se selecciona al clickearlo [I-5].

### Demo y cierre

- **CA-14 (ALTA) — Demo third-person.** El patio de la demo suma una SpotLight con sombras activas [I-6]. `create_project` demo y blank validan sin errores. `examples/third-person` se sincroniza con `scripts/sync-scene.mjs`, inspeccionando el diff. La jugabilidad y los assets no cambian.
- **CA-15 (MEDIA) — Píxeles WebGL2.** En Chrome real, a resolución y frame fijos, una fixture aislada con una sola SpotLight compara pares con sombras activas y apagadas. La ROI dentro del cono y de la sombra se oscurece (caída media RGB ≥20). Un control dentro del cono y fuera de la sombra queda estable (diferencia ≤5). Un punto fuera del cono no se ilumina. También se comprueba el caso de alcance de CA-6. Se guardan PNG, ROI, backend y commit. Un frame vacío no pasa. Mismo oráculo que I-12 de #203.
- **CA-16 (MEDIA) — Editor real.** La leg de editor 3D de `pnpm test:e2e` agrega una SpotLight a un Project third-person en MemFS, cambia `angle` y un override y comprueba el JSON y el undo. Después selecciona la luz con helpers: el cono aparece en edición y desaparece en Play.
- **CA-17 (MEDIA) — Benchmark.** Se agrega un workload spot con pares de sombras activas y apagadas, con los mismos casters, cámara y semilla que los de #203 [I-7]. Los contadores en WebGL2 son el gate, con dos ejecuciones del mismo commit. Mediana y p95 son informativas. Las baselines 3D previas solo cambian si el delta está explicado.
- **CA-18 (MEDIA) — Regresión integrada.** Pasan `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:dist` y las legs browser verificables. No se borran ni aflojan assertions existentes.
- **CA-19 (ALTA) — Documentación.** Se documenta `SpotLight` en el README del engine (props, defaults, sombras, costo de una vista). Se suma «Spot Light» al glosario de `CONTEXT.md` y una enmienda acotada a ADR 0027. El README del archetype menciona la spot de la demo.

## Plan de entrega

Propuesta [ASSUMED, I-8]: tres PRs, en orden. Cada uno lleva sus tests y la regresión completa.

| Capa | Etapa | CAs | Justificación |
|---|---|---|---|
| 1 | spot-engine | CA-1 a CA-10, CA-15 | Componente, generalización de tipos, sombras con alcance, snapshot, MCP y registries. Va solo porque toca código de sombras compartido (CA-9). |
| 2 | spot-editor | CA-11 a CA-13, CA-16 | Inspector, helpers y picking consumen el runtime. |
| 3 | spot-demo-bench-docs | CA-14, CA-17 a CA-19 | Demo, example, benchmark, regresión y docs. |

## Fuera de alcance

- Apuntado a un punto del mundo o a una entidad target.
- Texturas proyectadas (`map`/cookies), luces de área, iluminación horneada, cascadas y algoritmos distintos de PCF.
- Cambios a la política, los perfiles o el comportamiento de `Sun` y `PointLight`.
- Herramientas MCP nuevas, pantallas nuevas, gizmos para manipular el cono, cupos automáticos de luces.
- Corregir #151. La evidencia positiva en WebGPU queda opcional, como en #203 (CA-18/CA-21 retirados allí) [I-9].
- Bump de versión, publicación npm o merge.

## Inferencias

| # | Inferencia | Elección propuesta | Alternativa razonable | Confianza | Resolución |
|---|---|---|---|---|---|
| I-1 | Props, defaults y rangos | `angle` en grados, default 30, rango 1..89 (Three usa radianes y limita a 90°). `penumbra` 0..1, default 0.2. `distance` default 0. `decay` default 2. `direction` default `[0, -1, 0]` (hacia abajo), con un único param `vector3` como `Sun`. Fuera de rango se clampa y se diagnostica | `angle` en radianes; `directionX/Y/Z` planos como el offset | media | [ASSUMED] |
| I-2 | Columna spot de los perfiles | Bajo 512, Medio 1024, Alto 2048: una vista en perspectiva, la mitad del Sun | Igual al Sun; igual a PointLight por cara | media | [ASSUMED] |
| I-3 | Límite de sombra en Three | Adaptar solo el cálculo de sombra, como `RangedPointShadow`, para que el far efectivo sea el alcance de CA-6 sin tocar `light.distance`. El límite es la profundidad a lo largo del eje del cono; documentarlo | Límite radial euclídeo, como PointLight | media | [ASSUMED] |
| I-4 | Cono con `distance` 0 | Oculto, igual que la esfera de PointLight | Dibujar con largo igual al alcance de sombra | alta | [ASSUMED] |
| I-5 | Icono | Icono nuevo `'spot'` con el mismo tamaño y estilo que `'light'` | Reusar `'light'` | media | [ASSUMED] |
| I-6 | Ubicación en la demo | Una spot sobre el centro del patio que apunta hacia abajo y sombrea al Player al pasar. Se suma a las cuatro antorchas, no reemplaza ninguna | Linterna en la mano del Player | media | [ASSUMED] |
| I-7 | Benchmark | Un workload «una SpotLight» con par on/off, con los 50/200 casters de #203 | Ningún workload nuevo | media | [ASSUMED] |
| I-8 | Corte | Tres capas; la 1 aislada porque generaliza código de sombras compartido | Un único PR | media | [ASSUMED] |
| I-9 | WebGPU | Solo WebGL2 es gate, siguiendo la decisión humana de #203 (2026-10-17). Las visuales WebGPU corren a pedido con `--webgpu-shadows` | Exigir evidencia positiva WebGPU | alta | [ASSUMED] |

## Verificabilidad

**19 CAs — ALTA 14 · MEDIA 5 · BAJA 0 · NULA 0.**

- **ALTA:** CA-1 a CA-14 y CA-19. Se observan sin GPU: componentes, validación, resolución, ciclo de vida instrumentado, snapshot, inspector, helpers y escenas.
- **MEDIA:** CA-15 a CA-18. Requieren Chrome, Playwright o el benchmark Linux.

**Políticas:** máximo 950 líneas por `.ts`/`.tsx`, lint/ratchet, tests por package, sin hex nuevos en TSX ni estilos inline. Sin dependencias nuevas. Cumplir `.sdd/coding-policies.md`.

## Plan de verificación

TDD unit/component para los contratos; browser solo para render e interacción real. En esta etapa no se ejecutó nada: es el plan del run.

| CAs | Comando / mecanismo | Señal |
|---|---|---|
| CA-1 a CA-4 | `pnpm test -- spot-light lights-3d scene-shadows validation introspection` | Defaults, rangos, dirección local rotada, diagnósticos con ruta, registro y export |
| CA-5 a CA-8 | `pnpm test -- game-shadows spot-shadow` | Columna spot, herencia, apagado global, capacidad, caso 9/2, fov y near/far finitos, 10 ciclos sin crecimiento |
| CA-9 | `pnpm test -- shadow point-shadow sun-shadow` sin editar sus assertions | Mismos resultados para Sun y PointLight |
| CA-10 | `pnpm test -- runtime-lighting` | `spotLights` exacto, `[]` en 3D sin spots, ausente en 2D |
| CA-11 a CA-13 | `pnpm test -- inspector viewport-3d` (StrictMode) | Herencia/reset 1024/512/256, undo, cono con geometría exacta, oculto en 0 y en Play, icono pickable |
| CA-14 | `pnpm build`; `pnpm test -- third-person create-project archetype`; `node scripts/sync-scene.mjs` y diff revisado | Demo/blank validan, spot presente, example sincronizado |
| CA-15/16 | `pnpm test:e2e` en WebGL2, extendiendo las legs de sombras y editor 3D | PNG on/off con ROIs; cono solo en edición |
| CA-17 | `pnpm bench --backend=webgl2 --update-baseline` y luego `--check` | Contadores iguales en dos corridas |
| CA-18 | `pnpm typecheck && pnpm lint && pnpm build && pnpm test && pnpm test:dist && pnpm test:e2e` | Todo verde; gap WebGPU reportado como en #203 |
| CA-19 | Revisión de docs y `pnpm lint` | Props, defaults, costo y glosario documentados |

## Riesgos y gaps

- **Código de sombras compartido (alto):** generalizar `Sun | PointLight` puede romper a las dos luces existentes sin que se note en la imagen. Mitigación: CA-9, con la capa 1 en su propio PR.
- **Three 0.186:** reescribe `far` desde `light.distance`. CA-6 necesita adaptar el nodo de sombra, como pasó con PointLight. Es acceso dependiente de versión y un riesgo de mantenimiento.
- **Costo:** la demo suma una vista de sombra más por actualización.
- **WebGPU:** sigue bloqueado en este host y en CI Linux (#151). No se afirma verificado.
- **Baselines:** cambian las de la demo third-person. No actualizarlas a ciegas.
