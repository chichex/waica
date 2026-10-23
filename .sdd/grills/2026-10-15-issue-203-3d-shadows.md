# Grill — #203: sombras 3D
<!-- Estado: finalized. Proyecto: /home/chiche/workspace/waica. Fuente: https://github.com/chichex/waica/issues/203. -->
<!-- SDD-Tracking: version=1; type=grill; state=finalized; issue=chichex/waica#203; grill=2026-10-15-issue-203-3d-shadows; project=%2Fhome%2Fchiche%2Fworkspace%2Fwaica -->

Contrato confirmado explícitamente por el usuario el 2026-10-15. Modalidad: por rondas. Al cierre eligió «Confirmar y crear spec». Este grill no implementó código ni ejecutó un spike visual.

## Hechos comprobados

Verificados en `/home/chiche/workspace/waica`, HEAD `ecf7e1c` (Merge pull request #227 from chichex/release-v0.30.1), con working tree limpio durante el reconocimiento.

- Issue #203 abierto: sombras 3D, bloque derivado del roadmap. Pide resolver luces, flags de Model, calidad, ambos Render Backends, píxeles e impacto en el benchmark. No tenía comentarios ni spec en su body al comenzar.
- `packages/engine/src/components/sun.ts` y `point-light.ts` no configuran sombras. `components/model.ts` no expone flags de proyectar/recibir. Sun apunta actualmente al origen desde una posición normalizada; activar sombras sin definir cobertura no basta.
- Ambos backends usan `WebGPURenderer` de `three/webgpu` (ADR 0025). Three 0.186.1 instalado incluye sombras direccionales, puntuales y PCF; una PointLight renderiza seis caras. Esto es inspección de código, no evidencia de un spike visual de la feature.
- La demo third-person tiene un Sun, cuatro PointLight y un patio de 20×20 (`packages/archetype-third-person/src/scene-default.ts`). Con todas esas luces habilitadas hay hasta 25 vistas de sombras por actualización, antes del frame principal. El inicio vacío ya tiene Sun, un plano y el Player.
- Los glTF se cargan asincrónicamente y cada consumidor recibe un clon, con materiales y geometrías compartidos (`packages/engine/src/assets/model-cache.ts`). Model también soporta primitivas y Animator anima sus meshes.
- El editor genera controles a partir de metadatos. Ya tiene checkboxes, selects, campos numéricos, inspectores de escena y componentes, historia/persistencia y helpers 3D (`packages/editor/src/editor/inspector/PropRow.tsx`, `SceneInspector.tsx`, `SceneLightingOptions.tsx`, `viewport-3d-helpers.ts`).
- `.sdd/project.md`, sección Diseño: superficie `packages/editor/src`, con sistema por sus tokens en `styles.css`. No hay UI kit, Storybook, mocks, bundle design-sync ni Claude Design. No se tomaron capturas ni se inventaron referencias visuales.
- La cámara activa ya es la Editor Camera durante edición y la cámara de escena durante Play (ADR 0030).
- #151 sigue abierto. El e2e third-person permite solo reportar píxeles en CI Linux WebGPU; un frame blanco no demuestra que las sombras funcionen. El contrato también documenta problemas WebGPU en este host Linux. Una verificación visual positiva necesita un entorno funcional.
- El benchmark cuenta draw calls y tiene sincronización GPU para ambos backends (`packages/bench/src/draw-counter.ts`). Compara contadores deterministas con baselines; tiempos son informativos (`results.ts`, `baseline.ts`).
- Documentación de dominio leída solo lectura: `CONTEXT.md`; `.sdd/grills/2026-10-08-3d-trunk-smoke-test-and-model.md`; `.sdd/grills/2026-10-12-3d-editor.md`; ADR 0025, 0027, 0030; `.sdd/project.md`. No se encontró un handoff previo específico de sombras en ninguno de los dos lugares de persistencia.

## Decisiones resueltas

### 1. Alcance y adopción

1. Sun y PointLight proyectan sombras **por defecto**. El usuario eligió ambas luces, no el recorte a Sun solamente.
2. Cada Model proyecta y recibe por defecto en todos sus meshes, incluidos los animados. Ambos comportamientos pueden desactivarse por Model.
3. Se acepta el cambio visual y de costo en escenas 3D existentes. El usuario eligió activación por defecto, no opt-in.
4. Se actualizan demo, inicio vacío y example sincronizado de third-person.

### 2. Cobertura y calidad

1. El Sun sigue la cámara activa: cámara de juego en Play y Editor Camera en edición. Cobertura cercana acotada; fuera de ella continúa la iluminación, pero no la sombra. Sin cascadas.
2. Alcance inicial configurable: **40 unidades**, con valor general de escena y override por luz.
3. PointLight usa el menor entre su distancia luminosa y su alcance de sombra. Si ilumina sin límite (`distance: 0`), usa el alcance de sombra. La iluminación continúa más allá del alcance de sombra.
4. Perfiles de escena aceptados, **Medio por defecto**, incluso cuando no se declara configuración nueva:

   | Perfil | Sun | PointLight, por cara |
   |---|---:|---:|
   | Apagado | Sin sombras | Sin sombras |
   | Bajo | 1024² | 256² |
   | Medio | 2048² | 512² |
   | Alto | 4096² | 1024² |

5. Overrides por luz: resolución, alcance, `bias`, `normalBias` y radio PCF. Cada luz puede desactivar sus sombras.
6. Filtrado suave PCF como única opción. Apagado global prevalece sobre los ajustes por luz.

### 3. Diseño

1. Preset y alcance general en el Inspector de escena. Controles de proyectar/recibir en Model y activación en las luces.
2. Overrides en una sección avanzada plegable. Debe distinguir valor heredado, valor efectivo y override. Permite volver a heredar.
3. Helper de cobertura solo para la luz seleccionada: volumen efectivo del Sun y radio efectivo de la PointLight. De solo lectura y bajo el toggle de helpers existente. Nunca aparece en Play ni en capturas del juego.
4. Se reutilizan estilos, controles y accesibilidad actuales. Sin nuevas pantallas ni ampliación del soporte móvil/webview del editor.
5. Estados a representar: apagado, activo, heredado, override e inválido. No hay mocks ni capturas de referencia.

### 4. Garantías y costo

1. Sin cupo automático de luces ni reducción de calidad según FPS.
2. Píxeles obligatorios en **ambos backends**, a frame fijo y comparando sombras activas/desactivadas. No se exige igualdad exacta entre backends.
3. La excepción de CI de #151 no sustituye evidencia positiva de WebGPU en un host funcional. El usuario no eligió limitar los píxeles a WebGL2 ni agregar la corrección de #151 al alcance.
4. Verificar Sun y PointLight por separado, flags de Model, movimiento y animación. También controles, persistencia y herencia del editor.
5. Benchmark con variantes apagado/Sun/PointLight en ambos backends. Contadores reproducibles y ausencia de crecimiento de recursos al recargar escenas son gates.
6. Mediana, p95 y costo incremental son informativos. No se promete un FPS universal ni se exige un gate de 60 FPS.

## Ramas pendientes

Ninguna decisión de producto pendiente. El usuario confirmó el contrato completo y pidió continuar con `/sdd-spec --from-grill` usando este archivo. Los detalles técnicos diferidos constan en Handoff; no equivalen a decisiones de producto aprobadas adicionales.

## Diseño

- **Superficie:** editor web, `packages/editor/src`, con sistema por los tokens existentes de `packages/editor/src/styles.css`. No hay cambio de dirección visual.
- **Pantallas y flujos:** Inspector de escena (preset Apagado/Bajo/Medio/Alto y alcance general); Inspector de Model (proyectar/recibir); Inspector de Sun/PointLight (activación y sección avanzada de overrides); viewport 3D de edición (sombras y cobertura de la luz seleccionada); Play (sombras de juego, sin helpers).
- **Estados:** apagado, activo, heredado, override e inválido. Distinguir valor efectivo de valor persistido; permitir reset a heredar. Reutilizar los patrones de diagnóstico y persistencia actuales.
- **Reuso:** `SceneInspector`, controles de `SceneLightingOptions`, `PropRow`, `NumberField`, clases `ed-row`/`ed-hint`, helpers y toggle existentes. La sección avanzada de sombras y los helpers de cobertura se agregan dentro de esas superficies; no hay pantallas ni UI kit nuevos.
- **Plataformas y accesibilidad:** conservar el alcance actual del editor de escritorio, navegación por teclado, controles nativos y etiquetas accesibles. No ampliar soporte móvil/webview; no hay un flujo móvil nuevo que resolver. Esto no limita el runtime de juego a escritorio.
- **Helpers:** solo luz seleccionada, solo edición, solo lectura y bajo el toggle actual; nunca Play ni capturas del juego.
- **Referencias por ruta, sin capturas:** `packages/editor/src/editor/inspector/SceneInspector.tsx`, `SceneLightingOptions.tsx`, `PropRow.tsx`, `packages/editor/src/editor/NumberField.tsx`, `packages/editor/src/editor/viewport-3d-helpers.ts`. No hay mocks, Storybook ni otra referencia renderizable del inventario. No existe carpeta de capturas.

## Handoff

### Tema y alcance

Incorporar sombras dinámicas de Sun y PointLight. Incluye primitivas, glTF estáticos y personajes animados, el editor y las escenas third-person. Ambos tipos de luz y la participación de los Models están activados por defecto. El comportamiento objetivo, perfiles exactos, controles, alcance y gates son los enumerados en Decisiones resueltas y Diseño de este contrato, confirmados por el usuario.

### Restricciones y no objetivos

- Mantener el comportamiento 2D y la simulación determinista.
- No modificar materiales o recursos compartidos de otros Models al cambiar flags.
- Liberar mapas y recursos al cambiar configuración, destruir luces o descargar escenas.
- Fuera: sombras 2D, luces nuevas, iluminación horneada, cascadas y algoritmos adicionales.
- No introducir límites silenciosos de luces ni reducción de calidad según FPS.
- No usar un frame blanco como aprobación visual, ni sustituir el requisito de evidencia WebGPU por solo estado.
- No implementar durante este grill. El siguiente workflow autorizado es la escritura de la spec, no su ejecución.

### Supuestos y detalles diferidos a la spec

- Exponer configuración efectiva en el Runtime Snapshot, sin herramientas MCP nuevas. Es un supuesto del contrato, no una API ya implementada.
- La spec define nombres de API/JSON, rangos, valores antiartefactos y ajuste estable del volumen del Sun.
- Respetar los materiales glTF y documentar límites de transparencias/unlit. No se promete transmisión física de sombras transparentes.

### Riesgos

- Mayor costo por defecto, especialmente con varias PointLight. La demo puede necesitar hasta 25 vistas de sombras por actualización. Los tamaños de los perfiles son decisiones de configuración, no resultados de una medición.
- Acné, separación de sombras y vibración al mover la cámara.
- Evidencia WebGPU bloqueada si no hay un host funcional disponible.
- Cambios justificables en baselines 3D existentes; no deben actualizarse a ciegas.

### Contexto recomendado para la spec

- Issue https://github.com/chichex/waica/issues/203; este contrato; `.sdd/project.md`; `CONTEXT.md`; ADR 0025/0027/0030.
- Handoffs del tronco 3D y del editor: `.sdd/grills/2026-10-08-3d-trunk-smoke-test-and-model.md`, `.sdd/grills/2026-10-12-3d-editor.md`.
- Engine: `packages/engine/src/components/sun.ts`, `point-light.ts`, `model.ts`, `animator.ts`; `assets/model-cache.ts`; `game.ts`; `lit-frame.ts`; `scene.ts`; `scene-render-options.ts`; `runtime-lighting-snapshot.ts`; `runtime-inspection.ts`.
- Editor: inspectores y helpers listados en Diseño; integración de cámara, selección, historia y persistencia existentes.
- Archetype: `packages/archetype-third-person/src/scene-default.ts`, `prefabs.ts`; example third-person y su mecanismo de sincronización.
- Verificación: `scripts/runtime-e2e-third-person.mjs`, `runtime-e2e-lighting.mjs`, el e2e del editor 3D y `packages/bench` (`draw-counter.ts`, `page/harness.ts`, `results.ts`, `baseline.ts`, `sweep.ts`).

### Verificaciones de este grill

Inspección de código, documentación, estado Git y consultas de solo lectura a los issues #203 y #151. No se ejecutaron tests, benchmarks ni un spike visual, porque no se implementó la feature.
