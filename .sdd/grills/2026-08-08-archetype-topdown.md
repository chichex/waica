# Grill — Bases engine + archetype top-down (iso-ready)
<!-- Estado: finalized. Proyecto: /Users/ayrtonmarini/Sync/workspace/waica. Fuente: pedido libre (planificar bases y archetype para juego isometrico/top-down, 2026-08-08). -->

## Modo
domain-modeling

## Hechos comprobados
- Hardening pre-topdown implementado (spec 2026-07-28): `installArchetype` reset-then-register, identidad de player por `StateMachine.role`, input neutro en engine, solver per-axis compartido con anti-tunneling, archetype id persistido en `game.json`.
- ADR 0002 fija el contrato `ARCHETYPE` (doble entrada browser/node-safe). `archetype-platformer` es ~440 líneas de data pura; toda la "platformerez" vive en `behaviors` (`platformer-motor.ts`, 164 líneas).
- El engine no tiene gravedad, tilemap ni raycast; orden de dibujo = `layer` entero manual → z (sin y-sort); broadphase O(n²); cámara con deadzone/límites en 2 ejes pero lookahead solo horizontal y descubrimiento del "mover" por duck-typing de `.vx` (`game.ts:322`).
- El hardening difirió deliberadamente: contrato de animación direccional, cámara 2 ejes (lookahead vertical + proveedor de velocidad), anchor configurable en `AnimatedSprite` (`pre-topdown-hardening.md:52-53`).
- Platformer hardcodeado en ~10 puntos de template/MCP: `template/src/main.ts`, `package.json.tpl`, `createProject()`, `package-resolver.ts`, alias de workspace, `sync-scene.mjs`, registro/fallback en `editor/src/project/archetype.ts:9-19`.
- El picker ya lista `topdown` como `soon`, con blurb "4-direction movement" (desactualizado respecto de lo decidido en esta sesión).
- Release: 4 paquetes públicos en lockstep (`cli`, `engine`, `behaviors`, `archetype-platformer`), enforced por `package.test.ts` + `published-manifest.mjs` + `test-dist.mjs` + `publish.yml`.
- `AnimationContract` existe en el engine (required + fallbacks) pero no está en el manifest; el editor lo infiere de nombres de clips.

## Decisiones resueltas
1. **Alcance**: top-down ahora, **iso-ready**. Y-sort, contrato direccional, cámara y manifest se diseñan para N direcciones/extensión iso; iso no se implementa.
2. **Referencia de juego**: acción-aventura estilo Zelda 2D (explorar, enemigos, coleccionar). El **mismo ejemplo** crecerá en etapas futuras con disparo con arco (proyectiles) y NPCs con diálogo — esta etapa no los implementa pero no debe bloquearlos.
3. **Movimiento**: 8 direcciones con diagonales normalizadas; facing y animación en 4 (N/S/E/W). El contrato direccional nace 4-dir, extensible a 8 con mirroring declarable (iso).
4. **Acciones v1**: `move` + `interact`. La demo incluye un NPC mínimo que muestra una línea de texto vía la capa UI HTML existente — sin sistema de diálogo.
5. **Y-sort**: entra ahora al engine como modo de sorting opt-in (z derivado de la Y de mundo cada frame) declarado por el archetype/escena; platformer conserva layers manuales sin cambio observable.
6. **Mapas**: tiles-como-entidades (Sprite+Solid), igual que hoy. Tilemap como primitiva queda diferido como decisión futura propia; el broadphase O(n²) se anota como riesgo con umbral a medir sobre la demo real.
7. **Cámara**: follow libre en 2 ejes — extender la cámara actual con lookahead vertical y una interfaz explícita de proveedor de velocidad que reemplace el duck-typing de `.vx`. Rooms/flip-screen diferidos.
8. **Arte de la demo**: asset pack CC0 (p.ej. Kenney) — licencia limpia para npm; reemplazable por arte propio más adelante.
9. **Publicación**: `@waica/archetype-topdown` (id `topdown`) entra al release lockstep como **quinto paquete público**, mismo trato que `archetype-platformer`.
10. **Partición**: **dos specs encadenadas**. Spec 1 — generalizaciones de engine + desbloqueo template/MCP (y-sort, cámara 2 ejes, contrato direccional en el manifest, hardcodes), con cero cambio observable para platformer. Spec 2 — paquete `archetype-topdown` + `TopDownMotor` en behaviors + demo + wiring de release (scripts, `test:dist`, `publish.yml`, skill `/publish`) + habilitar el picker (y actualizar su blurb).

## Ramas pendientes
1. Arco/proyectiles sobre la demo top-down.
2. NPCs con diálogo real.
3. Isométrico (H5): grilla iso, 8-dir con mirroring, pivotes.
4. Tilemap primitiva / perf de mapas grandes (spatial hash), con evidencia medida.
5. Cámara por rooms / archetype flip-screen.

## Handoff

### Tema y alcance
Llevar waica de un solo archetype (platformer) a: engine generalizado para juegos sin gravedad con orden de dibujo por profundidad, más el archetype **top-down** publicado y usable desde el editor. Isométrico NO se implementa en esta etapa, pero cada pieza compartida se diseña para que iso sea extensión, no rediseño.

### Restricciones y no-objetivos
- Sin proyectiles/arco, sin sistema de diálogo, sin ataque melee (etapas futuras sobre el mismo ejemplo).
- Sin iso, sin grilla isométrica, sin tilemap primitiva, sin spatial hash, sin cámara por rooms.
- Spec 1: cero cambio observable para el archetype platformer (mismo criterio que el hardening).
- La demo debe ejercitar y-sort (oclusión real: árboles/NPCs), cámara 2 ejes e `interact`.

### Supuestos explícitos
- El asset pack CC0 elegido trae sheets 4-dir (idle/walk × N/S/E/W) para player + NPC + enemigo, más tiles y collectible — a verificar al armar la Spec 2; si falta algo, se complementa con otro pack CC0.
- Bottom-center como anchor alcanza para top-down; el anchor configurable (diferido del hardening) solo entra si el y-sort o el arte lo exigen en Spec 1.

### Riesgos y preguntas diferidas
- Broadphase O(n²) + re-escaneo de Solids por eje: aceptable en demo moderada; medir con el mapa real y decidir spatial hash/tilemap con evidencia.
- Diseño fino del y-sort (¿por escena o por entidad? ¿interacción con `layer` existente?) se resuelve en Spec 1 contra el código.
- No existe suite de conformidad portable para archetypes (todos los tests afirman valores del platformer) — recomendación: nace en Spec 2 con el segundo archetype.
- Mirroring NE→NW queda **diseñado** en el contrato direccional pero sin implementación hasta iso.
- `sync-scene.mjs` es platformer-only — entra al desbloqueo de Spec 1.

### Contexto recomendado para la sesión de spec
`.sdd/specs/pre-topdown-hardening.md` (líneas 52-53: los diferidos), ADR 0002, DESIGN.md líneas 18-24 y 128-130, `packages/engine/src/{camera.ts,game.ts,components/sprite.ts,components/animated-sprite.ts,animation/contract.ts,archetype.ts}`, `packages/archetype-platformer/src/` completo (es el molde), la lista de hardcodes template/MCP (hechos comprobados arriba), y `scripts/{published-manifest.mjs,test-dist.mjs,sync-scene.mjs}` + `.github/workflows/publish.yml` para el quinto paquete.

### Glosario actualizado en esta sesión
- `CONTEXT.md`: se agregó **Animation Contract** (declaración por archetype de clips requeridos por estado y resolución de faltantes vía fallbacks; archetypes direccionales resuelven estado × facing, con mirroring declarable).
