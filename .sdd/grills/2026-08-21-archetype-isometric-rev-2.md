# Grill — Archetype isométrico · rev 2: arte elegido (supuesto del pack CC0 cerrado)
<!-- Estado: finalized. Proyecto: /Users/ayrtonmarini/Sync/workspace/waica. Fuente: revisión de .sdd/grills/2026-08-21-archetype-isometric.md tras el sourcing de arte (2026-08-22). -->
<!-- SDD-Tracking: version=1; type=grill; state=finalized; issue=none; grill=2026-08-21-archetype-isometric-rev-2; project=%2FUsers%2Fayrtonmarini%2FSync%2Fworkspace%2Fwaica -->

## Modo
domain-modeling

## Hechos comprobados
Sourcing de arte corrido el 2026-08-22 (tres investigaciones web en paralelo: personajes 2D 8-dir, tilesets iso 2:1, y el plan B de renderizar desde 3D; licencias leídas en cada página y muestras descargadas e inspeccionadas):

- **Sí existen packs CC0 con diagonales** (el plan B lo negaba; la búsqueda directa lo refutó). Verificados: Puny Characters (Shade), familia Hormelz (itch), Kenney Isometric Miniature Dungeon/Prototype (único personaje 8-dir en proyección iso real, pero sin walk: Idle 1 frame + Run 10 + Pickup 10), Chrome District, Super Clone Cyborg (FLARE), y varios top-down 8-dir chicos.
- **Tilesets iso 2:1 CC0 verificados a medida de píxeles**: Kenney Miniature (256×128, sin árboles, look dungeon), Kenney Landscape/City/Tower Defense (132×66), rubberduck Flare-HD (128×64 y 64×32; grass, cliffs, árboles enormes, props, casas — render realista), hawkbirdtree (64×32, pixel art, árboles/props en un solo sheet sin espaciar, WIP), Screaming Brain (128×64, fondos opacos), Kipperfalcon/DawnBlocker (32×16).
- **Descartes con motivo**: Kipperfalcon (itch contradice el CC0 con "no redistribuir"), Mixamo (no redistribuible como CC0), Kenney Isometric Blocks (1.73:1, iso verdadero, no 2:1), Screaming Brain (colorkey + sin árboles), y todo lo CC-BY/CC-BY-SA (Flare/Clint Bellanger, LPC, Yar, Chibizilla, Dragosha…).
- **Plan B viable si hiciera falta**: Kenney Mini Characters / KayKit (CC0, riggeados con idle+walk) renderizados a 5 yaws con Playwright + three.js (ya en el repo), cámara ortográfica pitch 30°/yaw 45° (la 2:1 es dimétrica, no isométrica pura), luz en el plano vertical de la cámara para que el mirroring no invierta el sombreado; ~1-2 días de pipeline.

## Decisiones resueltas
1. **Arte del archetype isométrico → Kit A · Pixel: Puny Characters + hawkbirdtree 64×32.** Elegido por el usuario el 2026-08-22 sobre el Kit B (rubberduck + Kenney Male, render realista, un solo personaje y sin walk) y el Kit C (pipeline desde 3D). Motivos: es "el mismo juego en iso" respecto de la demo topdown (pixel art, árboles y NPC afuera), trae héroe + NPCs (workers/soldiers) + enemigos (orcos, slime) del mismo autor con **8 direcciones reales e idle + walk + hurt**, y el workflow de recomposición con gutters y `ATTRIBUTION.md` por coordenadas ya está probado en topdown.
2. **Escala**: diamantes de 64×32 (nativo de hawk); Puny a 2× nearest-neighbour (cuerpo de 32 px).
3. **Originales resguardados fuera del repo** en `~/Sync/workspace/waica-art-src/iso-kit-a/` (1 MB, 40 PNG) con `SOURCES.md` (URLs, licencia citada, layout, hashes sha256). El `/sdd-run` del archetype recompone desde ahí sin depender de la red.

### Consecuencias sobre el handoff original
- Cierra el supuesto "Existe pack CC0 con diagonales suficientes para player + NPC (a verificar al armar la spec del archetype)": **verificado y elegido**; no hace falta complementar con placeholder generado.
- La decisión 8 (shippear 5 filas n/ne/e/se/s y espejar w/nw/sw en runtime) se mantiene: Puny trae las 8, así que la spec 2 elige qué filas shippear y puede comparar espejo vs. fila original al validar.
- Trabajo que la spec 2 debe prever (no es trivial): rebanar a mano el sheet de hawk (sin espaciado, alturas de celda variables) registrando coordenadas por tile; reordenar las filas de Puny en 5 direcciones con gutters de 1px y `spacingX/Y`; **verificar empíricamente el mapeo fila→facing** antes de shippear (lección del este invertido de topdown); asserts de dimensiones PNG contra `cols`/`rows` como en `art.test.ts`; y el protocolo humano de validación visual (los dos bugs post-review de topdown fueron de arte).
- Riesgos visuales anotados para ese protocolo: Puny está dibujado en 3/4 top-down, no en proyección iso (chibi sobre cubos); la paleta oscura con outline de Puny contra la saturada de hawk puede pedir ajuste; hawk es "work in progress".
- Encaje con la spec de foundations: el `Tilemap` de CA-8 corta el tileset con el vocabulario de sheet de `AnimatedSprite` (`cols`/`rows`/`gridOffset`/`spacing`/`cellWidth`), así que el sheet de hawk — irregular y sin espaciar — se recompone en un sheet regular de 64×32 (o 64×48 para cubos con cara) con gutters antes de entrar al archetype; y el anchor declarado (CA-12, `anchorY: 0` = pies sobre la entidad) reemplaza la convención `offsetY` para árboles y props.

## Ramas pendientes
Las del handoff original y la rev-1, sin cambios (elevación; migración de topdown/platformer a tilemap; pintado avanzado; proyectiles/diálogo/rooms; tilemap perf).

## Handoff
Este archivo revisa únicamente el supuesto de arte del handoff `finalized` en `.sdd/grills/2026-08-21-archetype-isometric.md` (y no toca la rev-1, que cerró el fork de proyección). Todo lo demás sigue vigente.

**Estado del pipeline**: spike ✅ → fork ✅ (rev-1) → arte ✅ (esta rev-2) → spec de foundations ✅ en `main` como `draft` (`.sdd/specs/iso-engine-foundations.md`, commit `89c917d`; corrida con `--assume`: revisar su tabla de inferencias — en especial la 12 — y las desviaciones D1/D2 antes de `/sdd-run`) → `/sdd-run` de foundations → **`/sdd-spec` del archetype**, que puede escribirse en paralelo a ese run porque la spec de foundations ya fija las APIs (`render.projection`, `Tilemap`, `anchorX/anchorY`, `SolidSource`) y arranca con su mayor riesgo resuelto: consume `~/Sync/workspace/waica-art-src/iso-kit-a/SOURCES.md` como fuente del arte.
