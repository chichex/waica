# Grill — Archetype isométrico (spike + foundations + archetype)
<!-- Estado: finalized. Proyecto: /Users/ayrtonmarini/Sync/workspace/waica. Fuente: pedido libre (análisis de preparación + grill del archetype isométrico, 2026-08-21). -->
<!-- SDD-Tracking: version=1; type=grill; state=finalized; issue=none; grill=2026-08-21-archetype-isometric; project=%2FUsers%2Fayrtonmarini%2FSync%2Fworkspace%2Fwaica -->

## Modo
domain-modeling

## Hechos comprobados
- El trabajo topdown (PRs #43/#46) fue diseñado "iso-ready": contrato direccional 8-dir type-checked con fixture iso (`packages/engine/src/animation/directional.ts:122-135`), y-sort opt-in con seam `YSortParticipant`, cámara 2 ejes, provider seams estructurales (`CameraVelocityProvider`, `AnimationFacingProvider`), conformance suite parametrizada por manifest, carta `isometric` en el picker con `status: 'soon'` (`packages/editor/src/project/archetype.ts:68-74`).
- No existe seam de proyección: `Entity.position` ES `node.position` (mismo `Vector3`, `packages/engine/src/entity.ts:23-25`). El y-sort actual (clave = Y de pantalla) es la técnica iso clásica **si** se autora en screen-space; con coordenadas lógicas hace falta clave `x+y` (hoy hardcodeada a `position.y` en `game.ts:296`) y proyectar posiciones en render.
- La proyección es simulable sin tocar el engine: un componente project-owned que copie coords lógicas → `position` cada frame (mismo patrón que el pase y-sort, que muta z desde y).
- No hay tilemap en ningún nivel (tiles = entidades Sprite+Solid; topdown puso ~30 a mano); broadphase O(n²) anotado con umbral nunca medido. El editor no tiene concepto de tilemap y H2 promete "level/tilemap editing".
- Pivots configurables: diferidos tres veces (hardening, Spec 1 y Spec 2 de topdown); topdown los esquivó con la convención `offsetY`.
- El path de mirroring runtime nunca corrió (topdown solo ejercita `w→e`); `DESIGN.md:23` promete NE→NW.
- Registro de un archetype nuevo: ~12 touchpoints manuales (fila en `known-archetypes.ts` + switch `loadBundledModule` + `FALLBACK_PACKAGES`, `ARCHETYPES` + carta del editor + `script-sources.ts`, conformance `MANIFESTS`, `PUBLISHED_LIBRARIES`, lockstep CLI, 4 puntos de `test-dist.mjs`, `sync-scene.mjs` TARGETS + example + `dev:*`, publish SKILL.md + READMEs); el resto deriva de listas únicas.
- Costo del precedente topdown: 2 specs, ~+2900 líneas netas, +145 tests, ~2 días agente + review humano; sus 2 bugs post-review fueron de arte y los encontró solo el protocolo humano.
- El editor no tiene undo/redo (pendiente en DESIGN.md) — el brush de pintado no puede apoyarse en él.
- `.sdd/project.md` está desactualizado (dice 8 proyectos / 4 paquetes / v0.5.0; real: 9 / 5 / v0.7.0).
- `packages/cli/src/esm-imports.test.ts` no cubre `archetype-topdown` (gap preexistente de CA-10/CA-11).

## Decisiones resueltas
1. **Proyección — diferida a evidencia**: el fork screen-space vs seam de proyección NO se decide en esta sesión; lo decide el spike. Ramas dependientes (depth key, transform inverso del editor) quedan condicionadas al resultado.
2. **Spike comparativo**: el mismo mini-mapa en dos variantes — screen-space puro (polígonos diamante + y-sort actual) y proyección simulada vía componente project-owned. Se compara feel, colisión, sorting con oclusores y fricción de autoría. Criterio de salida: elegir el modelo de coordenadas.
3. **Demo**: la misma acción-aventura Zelda-like de topdown, en iso — explorar, NPC con `interact`, oclusión real. Reusa `Interactable`, roles y bindings.
4. **Elevación**: plana en v1. Una sola cota; el formato de escena no cambia; elevación es rama pendiente explícita.
5. **Mapas**: **tilemap primitiva ahora**, en foundations — se paga la rama pendiente #4 del grill topdown.
6. **Genericidad de la tilemap**: nace **genérica** (grilla cuadrada + diamante como parámetro); iso la estrena. Migrar topdown/platformer queda fuera de alcance como rama futura opcional.
7. **Pivots**: **anchor declarado ahora** — prop anchor/pivot declarable en `Sprite`/`AnimatedSprite`; se paga la deuda diferida tres veces y `offsetY` deja de ser el mecanismo de anclaje.
8. **Arte**: pack CC0 **con diagonales + mirroring runtime** — se shippean 5 filas (n/ne/e/se/s) y w/nw/sw se espejan en runtime, ejercitando por primera vez el path prometido.
9. **Editor**: grilla diamante + snap acoplado + picking sobre la proyección elegida + render de tilemap con props en inspector + **pintado mínimo** (brush de 1 tile, sin capas). La demo se autora visualmente end-to-end.
10. **Partición**: **spike liviano sin spec** (rama descartable → reporte de evidencia → cierre del fork con revisión corta de este grill) y después **2 specs encadenadas** como topdown: foundations (cero cambio observable para platformer/topdown) y archetype.

## Ramas pendientes
1. Cierre del fork de proyección con la evidencia del spike (revisión `-rev-1` de este grill).
2. Elevación/altura en iso.
3. Migración de topdown/platformer a tilemap.
4. Pintado avanzado (capas, brushes, undo/redo del editor).
5. Proyectiles/arco, diálogo real, cámara por rooms (heredados de topdown).
6. Tilemap perf / spatial hash si la medición del mapa real lo exige.

## Handoff

### Tema y alcance
Llevar waica de dos archetypes a tres: el archetype **isométrico** (`@waica/archetype-isometric`, id `isometric`), precedido por un **spike comparativo** que decide el modelo de coordenadas y una spec de **foundations** que paga tilemap genérica, anchor declarado, editor iso con pintado mínimo y la clave de profundidad que el fork determine. La demo es la variante iso de la misma acción-aventura de topdown.

### Restricciones y no-objetivos
- Sin proyectiles/arco, sin diálogo real, sin melee, sin cámara por rooms (heredados de topdown, siguen diferidos).
- Sin elevación, sin capas de tilemap, sin brushes avanzados, sin migración de topdown/platformer a tilemap.
- Foundations: cero cambio observable para platformer y topdown (mismo criterio que las dos veces anteriores).
- El spike no se mergea ni publica; su valor es el reporte de evidencia.

### Supuestos explícitos
- `@waica/archetype-isometric` entra al lockstep como sexto paquete público, mismo trato que topdown, incluido el bootstrap npm humano one-time (hand-publish + Trusted Publisher antes del siguiente tag `v*`).
- Existe pack CC0 con diagonales suficientes para player + NPC (a verificar al armar la spec del archetype; si falta, se complementa con otro pack o placeholder generado para los roles secundarios).
- Iso se adelanta respecto del orden H5 de DESIGN.md, desacoplado de 3D/glTF.
- El brush de pintado v1 opera sin undo/redo global (no existe en el editor); el alcance del brush se diseña asumiendo esa ausencia.

### Riesgos y preguntas deliberadamente diferidas
- **El fork de proyección** — la pregunta raíz, cerrada solo por el spike. La revisión que lo cierre es una sesión corta (archivo `-rev-1` de este grill) antes de escribir la spec de foundations.
- Diseño fino de la tilemap (formato de data, colisión por celda vs Solids derivados, interacción con y-sort/depth key) — contra el código en la spec de foundations, ya con el fork decidido.
- Sorting footprint-aware para oclusores multi-tile: no se decidió; si la demo lo exige, se resuelve en spec con el escape hatch de `layer` como plan B.
- Arte: ítem de mayor varianza; loop humano de validación garantizado (precedente: los 2 bugs post-review de topdown).
- Broadphase O(n²) de Hitbox sigue sin medir; la tilemap saca presión del caso tiles pero el riesgo queda anotado.
- `@waica/archetype-topdown` sigue sin bootstrap npm — bloqueante del próximo tag `v*` independiente de este esfuerzo.

### Contexto recomendado para la sesión de spec
- **Antes de todo**: refrescar `.sdd/project.md` (`/sdd-init --update`) — está desactualizado y `/sdd-spec` lo exige como contrato.
- Este handoff + el reporte de evidencia del spike (cuando exista).
- Moldes: `.sdd/grills/2026-08-08-archetype-topdown.md`, `.sdd/specs/topdown-engine-foundations.md` y `.sdd/specs/issue-45-archetype-topdown.md`.
- ADR-0002 (manifest dual-entry), `DESIGN.md:18-24` y `:127-131`, `CONTEXT.md` (glosario, ya con **Tilemap**).
- Engine: `render-sort.ts`, `game.ts` (pases de render/y-sort, cámara), `entity.ts` (identidad position/node), `scene.ts`, `animation/directional.ts`, `archetype.ts`, `components/{sprite,animated-sprite}.ts`, `collision-shape.ts`, `solid-axis.ts`.
- Editor: `editor/grid.ts`, `project/editor-settings.ts`, `editor/Viewport.tsx`, `project/archetype.ts`; MCP: `known-archetypes.ts`, `archetype-conformance.test.ts`, `package-resolver.ts`.
- Wiring: `scripts/{published-manifest,test-dist,sync-scene,runtime-e2e}.mjs`, `.claude/skills/publish/SKILL.md`, y el checklist de ~12 touchpoints del análisis de preparación.
- Hallazgo preexistente a resolver aparte: `packages/cli/src/esm-imports.test.ts` no cubre `archetype-topdown` (candidato a quick-fix antes del sexto paquete).

### Glosario actualizado en esta sesión
- `CONTEXT.md`: se agregó **Tilemap** (primitiva del engine que posee un mapa como una grilla de celdas — cuadrada o diamante — en un solo componente, en lugar de una entidad por tile; iso la introduce, los archetypes existentes siguen con tiles-como-entidades hasta que opten).
