# Grill — #204: spot lights 3D
<!-- Estado: finalized. Proyecto: /home/chiche/workspace/waica. Fuente: https://github.com/chichex/waica/issues/204. -->
<!-- SDD-Tracking: version=1; type=grill; state=finalized; issue=chichex/waica#204; grill=2026-11-01-issue-204-3d-spot-lights; project=%2Fhome%2Fchiche%2Fworkspace%2Fwaica -->

Contrato confirmado por el usuario el 2026-11-01 en gentle-pi. Modalidad: recomendaciones aceptadas en bloque («mandale») más tres preguntas cerradas. Este grill no implementó código ni ejecutó un spike visual.

## Hechos comprobados

Verificados en `/home/chiche/workspace/waica`, HEAD `ce43f03` (Merge pull request #255 from chichex/release-v0.31.1), con working tree limpio.

- Issue #204 abierto, sin comentarios. Pide decidir: componente `SpotLight` (ángulo, penumbra, alcance, target), helper/gizmo del editor, exposición en snapshot/MCP y si proyecta sombras. Hoy las escenas 3D solo tienen `Sun` y `PointLight`.
- #203 (sombras 3D) está cerrado e implementado. `Sun` y `PointLight` extienden `ShadowLight` (`packages/engine/src/components/shadow-light.ts`): `castShadows` (true por defecto) y overrides nulos que heredan de la escena (`shadowMapSize`, `shadowMaxDistance`, `shadowBias`, `shadowNormalBias`, `shadowRadius`).
- `PointLight` (`packages/engine/src/components/point-light.ts`) ubica la luz con un offset en el marco local de la entidad, cuelga la luz three del nodo de la entidad y no crea nada en escenas 2D. `Sun` apunta con un `direction` (`vector3`) y agrega su `target` a la escena.
- Las sombras se gestionan en `packages/engine/src/game-shadows.ts`. Tiene control de capacidad de texturas por backend (`assertShadowMapCapacity`) y errores de capacidad por luz tipados como `Sun | PointLight`. El editor replica ese control en `packages/editor/src/editor/shadow-edit-capacity.ts`, con `shadowKind` que solo distingue `'sun' | 'point'`.
- Los perfiles de calidad de escena (`scene-shadows.ts`) definen resoluciones por tipo de luz: Sun y PointLight por cara. No existe una columna para spot.
- Helpers del editor (`packages/editor/src/editor/viewport-3d-helpers.ts`): flecha por Sun y esfera de alambre de alcance por PointLight (`waica:editor-light-range`), para todas las luces, bajo el toggle de helpers. Los helpers de cobertura de sombra (`viewport-shadow-helpers.ts`) son solo para la luz seleccionada. Iconos de picking en `viewport-3d-icons.ts` (`'sun'`, `'light'`).
- Runtime Snapshot (`packages/engine/src/runtime-lighting-snapshot.ts`) expone `sun`, `pointLights` y `shadows`. El MCP valida params de sombra para `Sun`, `PointLight` y `Model` (`packages/mcp/src/component-param-findings.ts`). `PointLight` está registrado en los registries de archetypes (ej. `packages/archetype-platformer/src/registry-data.ts`).
- Three 0.186.1 (`three/webgpu`) incluye `SpotLight` con `angle`, `penumbra`, `distance`, `decay`, `target` y sombra de una sola vista en perspectiva. Esto es inspección, no un spike.
- #151 sigue abierto: WebGPU en CI Linux headless dibuja frames en blanco en lighting/post.

## Decisiones resueltas

### 1. Componente

1. Nuevo componente `SpotLight`, espacio `3d`, que extiende `ShadowLight`. En 2D no crea nada, igual que `PointLight`.
2. Props: color, intensidad, ángulo, penumbra, alcance (`distance`, 0 = sin límite), `decay` y offset local, siguiendo el patrón de `PointLight`.
3. **Apuntado por dirección local**: un vector en el marco de la entidad. Gira con la entidad. Ejemplo: una linterna en la mano del Player. Fuera: punto fijo del mundo y referencia a entidad target.

### 2. Sombras

1. Proyecta sombras **por defecto**, con los mismos overrides heredables que Sun y PointLight (#203).
2. Alcance de sombra: igual que PointLight, el menor entre su alcance luminoso y su alcance de sombra. Si ilumina sin límite, usa el alcance de sombra.
3. Participa del control de capacidad de texturas y del apagado global de sombras de la escena, como las otras dos luces.

### 3. Editor

1. Inspector generado por metadatos, como las otras luces, incluida la sección avanzada de overrides de sombra.
2. **Cono de alambre para todas las SpotLight**, bajo el toggle de helpers existente. Se comporta como la esfera de alcance de PointLight. La cobertura de sombra solo aparece para la luz seleccionada, como en #203. Nunca en Play ni en capturas del juego.
3. Icono de picking propio para entidades con SpotLight.

### 4. Exposición

1. Runtime Snapshot: lista `spotLights` junto a `pointLights`, con su configuración de sombra efectiva.
2. MCP: misma validación de params de sombra que Sun y PointLight. Sin herramientas MCP nuevas.
3. Registrado en los mismos registries de archetypes que `PointLight`.

### 5. Adopción

1. **Se agrega una SpotLight al patio de la demo third-person**, sincronizada al example como en #203. Es la evidencia visual en píxeles y el dogfooding.

## Ramas pendientes

Ninguna decisión de producto pendiente. El siguiente paso es escribir la spec a partir de este contrato.

## Diseño

- **Superficie:** editor web, `packages/editor/src`, con los tokens existentes de `styles.css`. Sin cambio de dirección visual.
- **Pantallas y flujos:** Inspector de SpotLight (props de luz, `castShadows`, sección avanzada de overrides); viewport 3D de edición (cono, cobertura de la luz seleccionada, icono); Play (sin helpers).
- **Reuso:** `PropRow`, `NumberField`, `light-shadow-overrides.tsx`, `viewport-3d-helpers.ts`, `viewport-shadow-helpers.ts`, `viewport-3d-icons.ts`. Sin pantallas ni UI kit nuevos.

## Handoff

### Tema y alcance

Incorporar `SpotLight` 3D con sombras por defecto, editor, snapshot, MCP, registries y un uso en la demo third-person, según Decisiones resueltas.

### Restricciones y no objetivos

- Mantener el comportamiento 2D y la simulación determinista.
- Liberar luz, target, mapas y helpers al destruir la luz o descargar la escena.
- Fuera: apuntado a punto del mundo o a entidad, texturas proyectadas (cookies/`map`), luces de área, iluminación horneada.
- No implementar durante este grill.

### Supuestos y detalles diferidos a la spec

- Nombres exactos de JSON y API (ej. `direction` vs `directionX/Y/Z`), rangos y defaults de ángulo y penumbra.
- Resolución de sombra por perfil para spot: hay que agregar una columna Spot a los perfiles Bajo/Medio/Alto. No es una medición; la spec propone valores.
- Generalizar los tipos que hoy son `Sun | PointLight` (capacidad, `shadowKind`, snapshot) sin cambiar el comportamiento de las dos luces existentes.

### Riesgos

- Contrato consumido: agregar `spotLights` al snapshot y un tipo al MCP es aditivo. Generalizar tipos compartidos de sombras puede romper Sun y PointLight si no se pinea con tests.
- Mayor costo en la demo: una vista de sombra más por actualización.
- Evidencia WebGPU bloqueada en CI Linux por #151; hace falta un host funcional para la evidencia positiva.
- Baselines 3D de la demo cambian; no actualizarlas a ciegas.

### Contexto recomendado para la spec

- Issue https://github.com/chichex/waica/issues/204; este contrato; `.sdd/grills/2026-10-15-issue-203-3d-shadows.md`; `.sdd/project.md`; `CONTEXT.md`; ADR 0025/0027/0030.
- Engine: `components/shadow-light.ts`, `point-light.ts`, `sun.ts`; `game-shadows.ts`; `point-shadow.ts`; `scene-shadows.ts`; `runtime-lighting-snapshot.ts`; `index.ts`.
- Editor: `shadow-edit-capacity.ts`, `viewport-3d-helpers.ts`, `viewport-shadow-helpers.ts`, `viewport-3d-icons.ts`, `inspector/light-shadow-overrides.tsx`.
- MCP: `component-param-findings.ts`. Archetypes: registries y `archetype-third-person/src/scene-default.ts`.
- Verificación: `scripts/runtime-e2e-third-person.mjs`, `runtime-e2e-lighting.mjs`, e2e del editor 3D, `packages/bench`.

### Verificaciones de este grill

Inspección de código, estado Git y consulta de solo lectura del issue #204. No se ejecutaron tests ni benchmarks.
