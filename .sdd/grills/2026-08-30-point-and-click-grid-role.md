# Grill — Point-and-click para el rol de grilla (iso de fábrica, topdown opt-in)
<!-- Estado: finalized. Proyecto: /Users/ayrtonmarini/Sync/workspace/waica. Fuente: pedido libre del usuario (2026-08-30): "quiero al isometrico agregarle la posibilidad del point and click, aunque no se si para el topdown tambien aplique". -->
<!-- SDD-Tracking: version=1; type=grill; state=finalized; issue=none; grill=2026-08-30-point-and-click-grid-role; project=%2FUsers%2Fayrtonmarini%2FSync%2Fworkspace%2Fwaica -->

## Modo
domain-modeling

## Hechos comprobados
- **H1 — Input es solo teclado.** `packages/engine/src/input.ts` escucha `keydown/keyup` por `KeyboardEvent.code`; `controls.json` mapea acción→códigos; el panel de controles del editor (`ProjectPane.tsx`) captura sólo teclas. `TODO(H1): gamepad and touch`. Dos specs excluyeron puntero explícitamente: `client-extensibility-toolkit.md` ("Input stays keyboard-only") e `issue-24-mcp-runtime-harness.md` (el bridge declara "pointer input unavailable").
- **H2 — El movimiento ya está desacoplado de las teclas.** `GridMotor.run(inputX, inputY, dt)` (compartido por `IsoMotor`/`TopDownMotor`) recibe un vector de pantalla, acelera con damp, colisiona por eje contra Solids y deriva el facing (8 vías iso / eje dominante topdown). El rol (`grid-player-role.ts`) sólo alimenta ese vector desde `input.axis(...)`.
- **H3 — Pantalla→lógico existe fuera del engine.** `unprojectIsometric` es la inversa exacta; el editor ya convierte cliente→render→lógico (`Viewport.tsx#toWorld`, `viewport-space.ts`). `Game` no lo expone, y con `resolution` fija hay letterbox (`setViewport/setScissor`) a descontar.
- **H4 — Obstáculos.** Demo iso: `Tilemap` 16×16 con `WATER`/`BORDER` sólidos (deriva `Solid` por celda, tiene `cellAt`/`cellBounds`) + árboles/rocas/villager con `Solid`. Demo topdown: sin Tilemap, tiles-entidad (`Sprite`+`Solid`). `sceneSolids(game)` enumera todo.
- **H5 — Los clicks llegan al canvas en modo play.** El `onPointerDown` del Viewport del editor retorna si `mode !== 'edit'`, y el shell de UI del engine es `pointer-events:none`: un listener del juego funciona en standalone y dentro del editor.
- **H6 — El bridge no clickea hoy.** `control_runtime` sólo `press/hold/release/pause/resume/step`; los tests de escena en happy-dom y Playwright sobre `window.__waica.game` sí pueden despachar `PointerEvent`.
- **H7 — Vecinos.** `Interactable` (radio + `interact`), `MeleeAttack.strike(facing)` (range 1, desde el estado `attack`), orco `Patrol`+`Hazard`+`Health`. No existe "ir hacia un punto" en behaviors (`Chaser` es de platformer: X + gravedad).
- **H8 — Producto.** `DESIGN.md` sólo menciona point & click como archetype comunitario futuro; los controles son parte del archetype.

## Decisiones resueltas
1. **Alcance: iso de fábrica, topdown opt-in.** Mecánica genérica sobre el rol de grilla compartido; el player iso la trae; la demo topdown no cambia.
2. **Semántica completa: caminar + interactuar + atacar.** Click en piso = caminar; click en `Interactable` = acercarse al radio y disparar la línea; click en entidad con `Health` ajena = acercarse al alcance del `MeleeAttack` y golpear.
3. **Entrada: click izquierdo; cada click reemplaza el Move Order.** Tap táctil equivale (PointerEvent). Sin botón configurable.
4. **Feedback: marcador de destino** del archetype (rombo iso / círculo topdown) visible hasta llegar o cancelar.
5. **Navegación: A\* sobre Navigation Grid** rasterizada de `sceneSolids()` (celdas de Tilemap + Solids de entidades); funciona también en topdown sin Tilemap.
6. **El teclado cancela el Move Order** y retoma control directo; sin modos.
7. **Arquitectura: el engine gana la primitiva de puntero** (PointerEvent en el canvas + conversión pantalla→lógico con cámara/letterbox/proyección); **un componente nuevo en `@waica/behaviors`** la consume para mover el rol.
8. **Objetivo móvil: el Move Order sigue a la entidad** (re-planifica hacia su posición actual); muere/desaparece = se cancela.
9. **Destino inalcanzable: se camina a la celda transitable más cercana** al punto clickeado; el marcador se dibuja donde realmente termina.
10. **Picking por bounds del sprite proyectado** (lo que se ve es lo que se clickea), empates por orden y-sort; mismo criterio que el editor.
11. **El bridge/MCP aprende a clickear:** operación de puntero en `RuntimeControlRequest` y `control_runtime`; supersede el "pointer unavailable" de `issue-24`. El e2e prueba click por el carril MCP real.
12. **Opt-in topdown = componente registrado en ambos bundles:** en iso viene en el prefab del player; en topdown aparece en el picker del editor.
13. **Entrega: una sola spec y un PR** con todo (precedente: combate iso).
14. **Términos canónicos: Move Order y Navigation Grid**, escritos en `CONTEXT.md`.

## Ramas pendientes
Ninguna dentro del alcance. Diferidas para otra sesión: drag-to-move / botón configurable y bindings de mouse en el editor; point-and-click activado de fábrica en topdown; touch UI dedicada (joystick virtual); gamepad (`TODO(H1)`); `Chaser` de grilla usando la Navigation Grid.

## Handoff

### Tema y alcance
Darle al player de grilla la capacidad de jugarse con el mouse/touch: click sobre el mundo para caminar (con pathfinding), click sobre un NPC para acercarse e interactuar, click sobre un enemigo para acercarse y atacar. El archetype isométrico la trae activada de fábrica; topdown la registra como componente opt-in. Una sola spec y un solo PR.

### Hechos comprobados
Ver `## Hechos comprobados` (H1–H8).

### Decisiones resueltas
Ver `## Decisiones resueltas` (1–14).

### Restricciones y no-objetivos
- Sin botón configurable ni bindings de mouse en `controls.json`/panel del editor; sin drag-to-move; sin gamepad.
- Sin cambios a la demo/prefabs/template de topdown ni de platformer (sólo el registro del componente en el bundle topdown).
- No cambiar el contrato direccional, los nombres de clip, ni el algoritmo de cámara.
- Escalera local completa (typecheck + test + build + test:dist + test:e2e) antes del PR; publicar a npm queda humano.
- Políticas de generación vigentes (higiene-ts-diff, tests-acompañan-src, max 950 líneas, naming kebab-case).

### Supuestos explícitos (ajustables al escribir la spec)
- La Navigation Grid usa celda 1×1 lógica alineada al Tilemap cuando existe; los Solids de entidades se rasterizan a las celdas que cubren. Se recalcula por click/re-plan, no por frame de física (el costo en mapas 16×16 es trivial).
- El componente click-to-move es pasivo como los motores: el rol de grilla lo consulta en su update y le entrega el vector al `GridMotor` — así aceleración, facing, colisión, `signal:move/stop` y estados `attack/hurt/dead` siguen intactos (hurt/dead interrumpen el Move Order o lo pausan; la spec lo fija).
- Llegada con tolerancia corta (~0.2 celdas); atacar reutiliza la transición `input:attack`/estado `attack` existente al entrar en alcance.
- La primitiva del engine expone el último click como punto lógico + entidad pickeada; la operación del bridge inyecta coordenadas lógicas (el picking de entidad se resuelve igual que un click real).
- El marcador es un asset chico nuevo del archetype (CC0/propio), no un cambio de engine render.

### Riesgos y preguntas diferidas
- **Game feel** (velocidad de re-plan, tolerancia de llegada, sensación del rodeo del A\*) no es verificable sin humano — protocolo humano en la spec.
- La operación de puntero del bridge toca protocolo v1 (aditivo, pero hay que decidir versionado en la spec) y el conformance del MCP.
- Picking por sprite bounds requiere leer bounds de render desde behaviors o exponerlos por seam del engine — la spec define el seam.
- El estado `attack` congela el cuerpo 0.3s; encadenar "caminar→golpear→seguir" puede necesitar un retoque del grafo (la spec decide si el Move Order sobrevive al swing).
- Diferidos: ver `## Ramas pendientes`.

### Contexto recomendado para la spec
`packages/engine/src/{input,game,projection,tilemap-grid,scene-solids,runtime-bridge}.ts`, `packages/behaviors/src/{grid-motor,grid-player-role,iso-motor,topdown-motor,facing,interactable,melee-attack}.ts`, `packages/archetype-isometric/src/{prefabs,scene-default,controls,bundle}.ts`, `packages/editor/src/editor/{Viewport.tsx,viewport-space.ts}` (precedente de conversión), `packages/mcp/src/{server,runtime-service,runtime-browser}.ts`, `scripts/runtime-e2e.mjs`, `.sdd/specs/issue-24-mcp-runtime-harness.md` (CA-3 a superseder), `docs/adr/0005` y `0006`, y los términos `Move Order` / `Navigation Grid` de `CONTEXT.md`.
