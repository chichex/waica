# Grill — Archetype isométrico · rev 1: cierre del fork de proyección
<!-- Estado: finalized. Proyecto: /Users/ayrtonmarini/Sync/workspace/waica. Fuente: revisión de .sdd/grills/2026-08-21-archetype-isometric.md con la evidencia del spike (2026-08-21). -->
<!-- SDD-Tracking: version=1; type=grill; state=finalized; issue=none; grill=2026-08-21-archetype-isometric-rev-1; project=%2FUsers%2Fayrtonmarini%2FSync%2Fworkspace%2Fwaica -->

## Modo
domain-modeling

## Hechos comprobados
Evidencia del spike comparativo (rama `spike/iso-projection`, commit `eefbf13`, reporte completo en `examples/iso-spike/REPORT.md`; mismo mini-mapa en dos variantes, input inyectado y posiciones muestreadas):

- **El y-sort actual hace la profundidad iso sin cambios en los DOS modelos**: Y de pantalla proyectada ≡ orden x+y lógico; `render.sort: 'y'` ordenó piso/paredes/árboles/player correctamente sin tocar el engine.
- **Colisión screen-space sobre Solids diamante**: empuje perpendicular a la cara diagonal = freno seco sin deslizar (x congelada); empuje diagonal = deadlock total en el diente de sierra cóncavo entre dos diamantes adyacentes. Corregirlo exigiría respuestas slide-along-normal en el solver.
- **Colisión en espacio lógico**: ~30 líneas de AABB-vs-celdas dieron deslizamiento suave a lo largo de la cara de la pared, pin frontal limpio y contención del borde del mapa gratis.
- **Autoría screen-space filtra**: necesitó ~40 Solids invisibles de borde (contención igualmente irregular) y el movimiento "recto" en pantalla sacó al player del rombo del mapa (terminó fuera de la grilla lógica).
- **La simulación del seam costó una línea por frame** (lógico → `Entity.position`); `DiamondSprite` probó que un renderable custom entra al y-sort vía `YSortParticipant`.
- Cero errores/warnings de consola en ambas variantes.
- Límites del spike: no probó el seam real del engine (desacople `Entity.position`/`node.position`, Solids en espacio lógico, transform inverso del editor) ni feel con mano humana — el usuario cerró el fork con la evidencia medida.

## Decisiones resueltas
1. **Fork de proyección → CERRADO: seam de proyección (coordenadas de mundo).** Los juegos isométricos se autoran en coordenadas lógicas de mundo (grilla cuadrada, velocidades isotrópicas, colisión axis-aligned); el engine proyecta lógico → pantalla en render. Screen-space queda descartado con la evidencia de arriba. Decidido por el usuario el 2026-08-21 ("vamos con world").

### Consecuencias en cascada sobre el handoff original
- **El ítem "depth key x+y" de foundations desaparece para iso plano**: con posiciones proyectadas, el y-sort existente ya ordena correcto (hallazgo 1 del spike). Solo reaparece si la elevación (diferida) lo exige.
- **La colisión de foundations corre en espacio lógico**: `Solid`/`resolveSolidAxis` operan sobre coordenadas lógicas; no se enseña slide-along-normal al solver.
- **El editor necesita el transform inverso** (picking, gizmos, grilla diamante, snapping) sobre la proyección — ya estaba en alcance (decisión 9 del original), ahora con modelo definido.
- **El formato de escena guarda coordenadas lógicas** en escenas iso; el diseño fino del seam (opt-in por escena vs manifest, dónde vive el desacople position/node) se resuelve en la spec de foundations contra el código, como estaba previsto.

## Ramas pendientes
Las del handoff original menos el fork (ya cerrado): elevación/altura; migración de topdown/platformer a tilemap; pintado avanzado; proyectiles/arco, diálogo real, cámara por rooms; tilemap perf/spatial hash con medición.

## Handoff
Este archivo revisa únicamente la decisión 1 del handoff `finalized` en `.sdd/grills/2026-08-21-archetype-isometric.md`; todo lo demás (decisiones 2–10, restricciones, supuestos, riesgos) sigue vigente tal como está ahí.

**Estado del pipeline**: spike ✅ (evidencia en `examples/iso-spike/REPORT.md`, rama descartable `spike/iso-projection`) → fork ✅ (esta revisión) → **siguiente: `/sdd-spec` de foundations** (seam de proyección + tilemap genérica cuadrada/diamante + anchor declarado + editor iso con pintado mínimo), precedida por `/sdd-init --update` (el contrato `.sdd/project.md` está desactualizado) → `/sdd-spec` del archetype.

**Contexto recomendado adicional** al del handoff original: `examples/iso-spike/REPORT.md` (la evidencia), `examples/iso-spike/src/world-variant.ts` (la forma del seam simulado y de la colisión lógica) y `examples/iso-spike/src/iso.ts` (la proyección 2:1 y el mapeo input pantalla→mundo que un IsoMotor real necesita).
