# Grill — Demo isométrica: orientación del arte, combate melee, feedback de daño, facing del orco y cámara
<!-- Estado: finalized. Proyecto: /Users/ayrtonmarini/Sync/workspace/waica. Fuente: pedido libre del usuario (2026-08-29): "las animaciones del personaje están invertidas (izquierda/derecha), el enemigo no me hace daño, no tengo como atacar al enemigo, el seguimiento de la cámara es muy brusco". -->
<!-- SDD-Tracking: version=1; type=grill; state=finalized; issue=none; grill=2026-08-29-iso-demo-combat-and-polish; project=%2FUsers%2Fayrtonmarini%2FSync%2Fworkspace%2Fwaica -->

## Modo
domain-modeling

## Hechos comprobados
- **H1 — Inversión izquierda/derecha = arte, no código.** `packages/archetype-isometric/assets/waica-iso-{hero,villager,orc}.png` se compusieron con las filas 5/6/7 del pack Puny Characters como `ne/e/se` (`ATTRIBUTION.md`); esas filas miran al **oeste** (verificado visualmente sobre el sheet original `Warrior-Blue.png` y sobre el comprometido; reporte del usuario coincide). Las filas 1/2/3 son sus espejos pixel-exactos (el propio ATTRIBUTION lo registra). `n`/`s` son correctas. Mismo bug que topdown corrigió en `a807897` recomponiendo las hojas. Contrato direccional (`ISOMETRIC_ANIMATION`), `IsoMotor`, e2e (`scripts/runtime-e2e.mjs`) y tests no cambian: aseveran nombre de clip + `flipX`, no orientación absoluta (la spec `archetype-isometric.md` CA-10 ya lo declaraba no mecanizable).
- **H2 — El daño funciona; falta feedback.** Probado con `ISOMETRIC_SCENE` real en happy-dom (Game + loadScene + runFrame): cada contacto con el orco → `Health.damage(1)` (i-frames 1 s); a 0 HP → estado `dead` 0,8 s → respawn en el origen con vida llena. No hay HUD de vida (`stats.json` solo tiene `points`), nadie escucha el evento `damage`, no hay parpadeo, knockback ni animación de golpe. Desde afuera: "no pasa nada y a los 3 s te teletransporta".
- **H3 — No existe ataque en engine/behaviors** para ningún archetype; el melee fue diferido en los handoffs de topdown (2026-08-08) e iso (2026-08-21). El orco tiene `Hitbox + Hazard`, sin `Health` (inmortal). Precedente de combate: `examples/platformer/src/{components/gun.ts,components/projectile.ts,states/dash.ts}` como código de proyecto. El pack Puny (CC0, originales en `~/Sync/workspace/waica-art-src/iso-kit-a/`, `SOURCES.md`) trae columnas idle/walk/sword/bow/staff/throw/hurt/death en las 8 filas.
- **H4 — Cámara.** `Game.updateSceneCamera` proyecta target y velocidad correctamente. El feel sale de `CAMERA_DEFAULTS` (`packages/engine/src/camera.ts`): deadzone 2×2,5, `smoothing: 6` (damp exponencial), `lookahead: 1.5` horizontal aplicado como escalón cuando `|vx| > 1`; la escena iso agrega `lookaheadY: 1`. La escena puede sobreescribir `deadzoneWidth/Height`, `lookahead`, `lookaheadY`, `smoothing`. El editor solo expone `camera.position`. Mismos defaults para platformer/topdown.
- **H5 — Patrol** (`packages/behaviors/src/patrol.ts`) mueve por eje lógico (x → diagonal SE↔NW en pantalla bajo proyección) sin `AnimationFacingProvider`; el orco reproduce el clip plano `walk` (fila sur) espejado por `scale.x`. Compartido por los tres archetypes.
- **H6 — Dominio.** `CONTEXT.md` (glosario) y `docs/adr/0001…0009`; ADR-0003: Health es el modelo de daño, Hazard solo hiere al tocar, la muerte la gobierna el grafo de estados y sin edge de muerte la entidad se destruye.

## Decisiones resueltas
1. **Facing del orco: entra en este trabajo.** Patrol pasa a reportar facing.
2. **Tipo de ataque: melee (espada).** Golpe frontal corto según el facing de 8 direcciones.
3. **Feedback de daño: los cuatro.** HUD de vida, parpadeo durante los i-frames, knockback y animación hurt/death.
4. **Cámara: solo tuneo de la escena iso** (`examples/isometric/src/scenes/main.scene.json` + `ISOMETRIC_SCENE` en `scene-default.ts`). Sin cambios a `CAMERA_DEFAULTS` ni al algoritmo; platformer/topdown intactos.
5. **Hogar del ataque: el archetype isométrico.** Componente en `@waica/behaviors`, estado `attack` en `ISO_PLAYER_ROLE`, acción `attack` en `ISOMETRIC_BINDINGS`, prefab del player, template y blank scene. Todo proyecto iso nuevo ataca de fábrica. Toca editor (script-sources, snapshots del template), MCP (conformance) y e2e.
6. **Orco: `Health` max 2, muere y desaparece** (destroy por ADR-0003 al no manejar la muerte en su grafo), con hurt/death animados desde el pack. La demo queda sin enemigo hasta recargar.
7. **Hogar del feedback: genérico en behaviors/engine, cableado solo en la demo iso.** Health expone la vida como stat para `{{binding}}` y parpadea durante los i-frames; el rol de grilla compartido gana el estado `hurt` con knockback. Platformer/topdown pueden adoptarlo después; sus demos no cambian en este trabajo.
8. **Stun breve (~0,3 s)** en `hurt`: sin input mientras retrocede; vuelve a `idle` por timer.
9. **Patrol facing donde haya contrato direccional (iso y topdown).** Una sola regla: facing = signo del movimiento en espacio de pantalla (la misma de `IsoMotor`). El orco de topdown también mira hacia donde camina. Platformer (sin contrato direccional) conserva el flip de escala.
10. **Entrega: una sola spec con todo** (un `/sdd-spec` y un `/sdd-run`, un PR).

## Ramas pendientes
Ninguna dentro del alcance. Diferidas para otra sesión: `Chaser` con facing; respawn de enemigos; adopción del HUD/parpadeo en los demos de platformer/topdown; edición de deadzone/smoothing/lookahead en el editor; proyectiles/arco; diálogo; cámara por rooms; vidas (`lives`).

## Handoff

### Tema y alcance
Dejar la demo isométrica jugable como action-adventure: corregir la orientación del arte, dar un ataque melee, hacer visible el daño recibido, hacer al orco golpeable y mortal, que mire hacia donde camina, y suavizar la cámara. Una sola spec / un solo PR con todo.

### Hechos comprobados
Ver `## Hechos comprobados` (H1–H6).

### Decisiones resueltas
Ver `## Decisiones resueltas` (1–10).

### Restricciones y no-objetivos
- Sin proyectiles/arco, sin diálogo, sin cámara por rooms, sin vidas (`lives`), sin respawn de enemigos, sin audio.
- No cambiar `CAMERA_DEFAULTS` ni el algoritmo de cámara; no cambiar el contrato direccional ni los nombres de clip existentes (`idle-<dir>`, `walk-<dir>`).
- No tocar los demos de platformer/topdown más allá del efecto colateral de la decisión 9 (el patroller de topdown pasa a usar facing).
- Escalera local completa (typecheck + test + build + test:dist + test:e2e) antes del PR; publicar a npm queda humano.

### Supuestos explícitos (ajustables al escribir la spec)
- **Arte:** los tres sheets se recomponen desde el pack usando las filas espejo (1/2/3 → `ne/e/se`) con un layout único por personaje: idle, walk×3, sword×N, hurt×N, death×N; el villager comparte el layout aunque no use sword. `ATTRIBUTION.md` registra fila→facing y columna→clip; `scripts/sync-scene.mjs` propaga a `examples/isometric` y al template del editor; `art.test.ts` se actualiza a las nuevas dimensiones.
- **Ataque:** acción `attack` ligada a `KeyX` + `KeyJ`; hitbox frontal en espacio lógico (el facing de pantalla se traduce a lógico con `screenInputToLogical`), daño 1 a cualquier `Health` ajeno, duración y cooldown cortos; el jugador no se mueve durante `attack`; clip `attack-<dir>` con fallback a `idle`.
- **Muerte del héroe:** se mantiene el flujo actual (`dead` → respawn en origen con vida llena), ahora con clip `death-<dir>`.
- **Knockback:** impulso en espacio lógico alejándose del origen del daño (~1 unidad), disparado por el evento `damage`; Patrol deja de espejar por `scale.x` cuando hay contrato direccional instalado (evita doble espejo).
- **HUD:** pieza `src/ui/health.html` estilo contador de cajas (`♥ {{health}}`), stat `health` en `stats.json`, montada desde la escena.
- **Cámara:** punto de partida deadzone ~0, `lookahead: 0`, `lookaheadY: 0`, `smoothing` ~4; los valores finales los fija la validación humana.
- El estado `hurt` va en el rol de grilla compartido (`createGridPlayerRole`), así topdown lo hereda sin cablearlo.

### Riesgos y preguntas diferidas
- **Arte es el ítem de mayor varianza** (los bugs post-review de topdown e iso fueron de arte): la orientación absoluta no es mecanizable → protocolo humano de 8 direcciones + ataque + hurt/death.
- **Game feel** (cámara, stun, knockback, alcance del golpe) no es verificable sin humano.
- Estados `hurt`/`attack` en el grafo del player cambian `ISO_PLAYER_STATE_GRAPH` → regenerar prefabs/template/snapshots; posible impacto en MCP conformance y `validate_project`.
- Diferidos: ver `## Ramas pendientes`.

### Hallazgos preexistentes (no se arreglan acá)
- `Villager` loguea `role "npc" has no registered state code` (NPC_ROLE está en el bundle pero sin state code registrado).
- El lookahead de cámara es un escalón discreto (`|vx| > 1`) para todos los archetypes.

### Contexto recomendado para la spec
`.sdd/specs/archetype-isometric.md` (CA-9/CA-10/CA-23 y protocolo humano), `docs/adr/0003-health-is-the-damage-model.md`, `packages/behaviors/src/{grid-player-role,iso-motor,patrol,hazard,health}.ts`, `packages/engine/src/{camera,animation/directional}.ts`, `packages/archetype-isometric/{assets/ATTRIBUTION.md,src/prefabs.ts,src/scene-default.ts}`, `scripts/{sync-scene,runtime-e2e}.mjs`, y el precedente `examples/platformer/src/{components/gun.ts,states/dash.ts}`.
