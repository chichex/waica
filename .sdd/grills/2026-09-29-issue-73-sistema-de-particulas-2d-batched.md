# Grill — Issue #73: sistema de partículas 2D batched
<!-- Estado: finalized. Proyecto: /Users/ayrtonmarini/workspace/waica. Fuente: chichex/waica#73. -->
<!-- SDD-Tracking: version=1; type=grill; state=finalized; issue=chichex/waica#73; grill=issue-73-sistema-de-particulas-2d-batched-20260929-59fbf0df; project=%2FUsers%2Fayrtonmarini%2Fworkspace%2Fwaica -->

## Modo

domain-modeling

## Hechos comprobados

- `Emitter` ya es el bus de eventos público exportado por `@waica/engine`; no puede nombrar también este componente.
- El engine actualiza componentes en Simulation Steps fijos de 1/60 s y no simula mientras está pausado.
- En escenas isométricas las posiciones persisten y se simulan en coordenadas lógicas; la proyección ocurre al renderizar.
- El y-sort actual entrega un solo Z por componente y usa la Y renderizada del owner, por lo que no puede intercalar partículas individuales sin ampliar el seam.
- `game.assets` ya resuelve, cachea y reporta fallos de texturas por Game.
- El inspector genérico edita primitivas; no tiene controles authorables para vectores, colores tipados ni texturas. Los pickers actuales son específicos de Appearance/Tilemap.
- Platformer, topdown e isometric mantienen registries explícitos de componentes.
- El lifecycle actual destruye componentes y recursos junto con su Entity.
- #77, pooling/instancing general, está abierto pero no es prerrequisito; #76, asset loader, ya está implementado.
- El repo tiene `CONTEXT.md` raíz, sin `CONTEXT-MAP.md`, y ADRs relevantes sobre updates, coordenadas lógicas, fixed-step y Assets Ready.

## Decisiones resueltas

1. La clase exportada y el `componentName` de escena se llaman `ParticleEmitter`; `Emitter` conserva exclusivamente su significado de bus de eventos.
2. `rate` y `emitting` controlan la emisión continua; `emit(n)` dispara bursts independientemente, incluso con el continuo pausado. El acumulador comienza vacío.
3. Cada partícula nace en el origen del owner más un `positionSpread` rectangular X/Y opcional; no hay catálogo de formas de emisión.
4. `space` admite `'world' | 'local'`, default `'world'`. World conserva la posición lógica posterior al spawn; local conserva el offset y sigue la traslación del owner. La escala visual del owner no modifica la simulación.
5. Cada emisor tiene un PRNG determinista con `seed` entero authorable. Montar o recargar reinicia la secuencia; iguales pasos y llamadas producen iguales samples.
6. `velocity` es el centro; `velocitySpread` y `positionSpread` son semirangos uniformes e independientes por eje.
7. `destroyMode` admite `'clear' | 'drain'`, default `'clear'`. Drain detiene nuevas emisiones, congela partículas locales en posición lógica mundial y continúa scene-scoped hasta quedar vacío. Scene unload y `Game.dispose()` siempre lo eliminan.
8. Cada partícula captura al nacer lifetime, velocity, gravity y endpoints de escala/color/alpha. Cambios posteriores afectan solo spawns futuros; `rate` y `emitting` reaccionan inmediatamente.
9. `capacity` es un entero positivo authorable con default 256. El batch se preasigna, nunca crece durante emisión y un cambio de capacidad reconstruye el buffer y limpia partículas activas.
10. `overflow` admite `'recycle-oldest' | 'drop-new'`, default `'recycle-oldest'`; no existe backlog. Los empates siguen orden de spawn determinista.
11. `emit(n): number` devuelve cuántas partículas de esa llamada quedan activas. Drop-new se limita a slots libres; recycle-oldest se limita a capacity. No se generan samples que serán sobrescritos dentro de la misma llamada.
12. En y-sort, cada partícula activa aporta una entrada global por su Y renderizada/proyectada y recibe su propio Z junto con sprites y otras partículas de su layer. El emisor conserva un único `BufferGeometry`, material y draw call. Sin y-sort usa profundidad fija de layer.
13. `texture` es opcional y se resuelve mediante `game.assets`; ausente o fallida usa un quad blanco tintado por color de partícula. `pixelArt` default false. Cambiar textura/filtro conserva partículas activas.
14. `blend` admite `'normal' | 'additive'`, default `'normal'`. El batch ordena sus propios quads back-to-front, pero no promete OIT ni composición alpha global exacta entre meshes; no agrega render passes ni draw calls.
15. Cada partícula es un quad alineado a pantalla con `width`/`height`; `startScale → endScale`, `startColor → endColor` y `startAlpha → endAlpha` interpolan linealmente por edad normalizada. No hay curvas, easing, rotación ni velocidad angular.
16. Los vectores se persisten como tuplas JSON `[x, y]`. `ParamSpec.kind` gana controles genéricos `vector2`, `color` y `texture`; enums usan `options`. No hay panel bespoke de partículas.
17. `ParticleEmitter` se exporta desde `@waica/engine` y se registra en platformer, topdown e isometric. Se documenta y prueba en engine/editor, incluida una escena de test isométrica con y-sort. `inspectState()` expone solo `active`, `capacity` y `emitting`.
18. No se modifican `Health`, otros behaviors ni los demos. Los consumidores llaman `emit(n)`.
19. Sin props el componente no emite solo: `rate=0`, `emitting=true`, acumulador vacío. Defaults: `lifetime=1`, `seed=1`; positionSpread/velocity/velocitySpread/gravity `[0,0]`; width/height y start/endScale `1`; start/endColor `0xffffff`; startAlpha `1`, endAlpha `0`; texture vacía, pixelArt false y layer 0, además de world/clear/256/recycle-oldest/normal. `emit(1)` produce un quad quieto que desvanece en un segundo.

## Ramas pendientes

Ninguna dentro de #73.

Bloques futuros separados: #77; partículas GPU/3D; formas complejas; curvas; rotación; demos; integración declarativa con behaviors.

## Handoff

### Tema y alcance

Agregar a `@waica/engine` un `ParticleEmitter` authorable para partículas CPU 2D: emisión continua o por ráfagas, simulación en coordenadas lógicas, proyección isométrica, y-sort por partícula, capacidad acotada y un único batch por emisor.

### Restricciones y no-objetivos

- CPU, quads 2D y un único BufferGeometry/material/draw call por emisor.
- Cero `Entity` por partícula y cero crecimiento/asignación por spawn.
- Fuera: GPU simulation, geometría 3D, pooling general de #77, catálogo de formas, rotación/angular velocity, curvas/keyframes, OIT, integración con combate y showcase de demo.
- Scene unload y `Game.dispose()` eliminan también los batches en drain.

### Dependencias y consecuencias

- El seam de y-sort debe generalizarse de una entrada por participante a múltiples entradas sin romper Sprite/AnimatedSprite.
- `destroyMode='drain'` requiere ownership scene-scoped interno después del lifecycle del componente.
- Isométrico proyecta cada posición lógica de partícula antes de escribir vertices y profundidad.
- Los nuevos `ParamSpec.kind` son controles genéricos del editor, no excepciones por nombre.
- Normal alpha conserva el límite transparente del renderer actual: profundidad correcta no equivale a alpha global exacto.
- #76 aporta texturas/cache; #77 no es dependencia.

### Supuestos explícitos para la spec

La spec debe fijar y testear como inferencias técnicas la sanitización de `NaN`/infinito/negativos, redondeo de `n` y `capacity`, algoritmo concreto del PRNG, color space de interpolación, layout de atributos y flags exactos de depth/blending. Esas inferencias no pueden alterar las decisiones anteriores.

### Riesgos y preguntas deliberadamente diferidas

- El y-sort por partícula agrega trabajo CPU proporcional a partículas activas.
- Drain cruza el lifecycle normal de `Component`; requiere cleanup estricto ante unload/dispose.
- Solapes semitransparentes conservan posibles artefactos del modelo no-OIT aceptado.
- El aspecto subjetivo de humo/chispas no es autónomamente verificable; geometría, estado, profundidad y lifecycle sí.
- Posibles ADRs, todavía no aprobados: y-sort multi-entry y drain scene-scoped después de destruir el owner.

### Glosario actualizado durante el grill

- `CONTEXT.md` define **Particle Emitter** como el término canónico y reserva `Emitter` para el bus de eventos.

### Contexto recomendado para la spec

Revisar `packages/engine/src/component.ts`, `render-sort.ts`, `game.ts`, `scene.ts`, `components/sprite.ts`, `components/tilemap.ts`, `assets/asset-loader.ts`; el inspector (`PropRow.tsx`, component metadata); los registries de los tres arquetipos; y tests de fixed-step, proyección, render-sort, assets, lifecycle e inspector. Diseñar TDD determinista sobre simulación, arrays/buffers, API, escena isométrica con y-sort, controles, registries, cleanup GPU y Runtime Snapshot, seguido por la ladder de `.sdd/project.md`.
