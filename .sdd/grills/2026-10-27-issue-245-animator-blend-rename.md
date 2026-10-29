# Grill — Renaming an Animator blend in the inspector leaves its references dangling
<!-- Estado: finalized. Proyecto: /home/chiche/workspace/waica. Fuente: #245. -->
<!-- SDD-Tracking: version=1; type=grill; state=finalized; issue=#245; grill=2026-10-27-issue-245-animator-blend-rename; project=%2Fhome%2Fchiche%2Fworkspace%2Fwaica -->

## Hechos comprobados
- `packages/editor/src/editor/inspector/animator-blend-rows.tsx:67`: `BlendCard.onRename` hoy solo llama `onChange(renamedBlend(blends, blendName, to))`, lo que dispara un único `onProp('Animator', 'blends', ...)` y deja intactos `Animator.initialClip`, `Animator.clips` y `StateMachine.states`.
- `packages/editor/src/editor/inspector/animator-blend-rows.tsx:50`: `BlendNameField` ya impide renombrar a un nombre vacío, igual al actual, o presente en `taken = [...Object.keys(blends), ...(glbClips ?? [])]`.
- `packages/editor/src/scene/ops.ts:380-409`: `ops.setComponentProp(scene, entityName, componentType, key, value, prefabs)` escribe en `entity.overrides[componentType][key]` cuando `prefabOwns(entity, componentType, prefabs)` es verdadero, y en `entity.components` cuando el componente es inline.
- Encadenar actualizaciones de propiedades sobre el mismo `scene` antes de un único `core.commit(next, ...)` (`packages/editor/src/editor/inspector-entity-handlers.ts:45-56`) o encadenar `setPrefabProp` antes de un único `core.commitPrefab(ref, next, ...)` (`packages/editor/src/editor/inspector-prefab-handlers.ts:29-36`) registra un solo paso en el historial de undo/redo.

## Decisiones resueltas
1. **Reescritura atómica de referencias en un paso de undo:** Al confirmar el renombre de un blend `from → to` en `Animator.blends`:
   - `Animator.blends` reemplaza la clave `from` por `to` conservando su posición (`renamedBlend`).
   - Si el `Animator.initialClip` efectivo del sujeto inspeccionado es igual a `from`, se actualiza a `to` en el mismo commit; si tiene otro valor o está vacío, no se toca.
   - Si el mapa efectivo `Animator.clips` contiene la clave `from`, se renombra esa clave a `to` conservando el orden de las entradas y su objeto de configuración (`loop`, `speed`, `fade`, etc.); si no contiene `from`, `Animator.clips` no se toca.
   - Si el sujeto inspeccionado posee un componente `StateMachine` (efectivo vía `resolveComponents` en entidad o directo en `prefab.components`) con uno o más estados en `states` cuyo `clip === from`, se actualiza `StateMachine.states` reemplazando `clip: to` en todos esos estados; si ningún estado apunta a `from`, `StateMachine` no se toca.
2. **Frontera instancia vs. prefab para `StateMachine.states`:** Cuando el renombre ocurre inspeccionando una entidad de escena (incluyendo una instancia de prefab donde `prefabOwns(entity, 'StateMachine', prefabs)` es verdadero), la actualización de `StateMachine.states` se aplica sobre la entidad de escena mediante `ops.setComponentProp(scene, entity.name, 'StateMachine', 'states', nextStates, prefabLib)` (quedando en `entity.overrides.StateMachine.states` en instancias de prefab, o en `entity.components` en entidades inline), en el mismo commit de escena y sin mutar el prefab compartido. Cuando el renombre ocurre inspeccionando un prefab (`PrefabInspector`), todas las actualizaciones (`Animator` y `StateMachine`) se aplican sobre el prefab en un único `commitPrefab`.

## Ramas pendientes
Ninguna.

## Diseño
- **Superficie y estado:** `packages/editor` (`con sistema` en `.sdd/project.md`, tokens CSS en `packages/editor/src/styles.css`).
- **Pantallas, flujos y estados:** Flujo existente de edición del campo `name` dentro de cada `BlendCard` en la sección `Blends` del panel `Inspector` (al presionar `Enter` o perder foco en `BlendNameField`). Tras confirmar el renombre, el select de `Initial clip`, las filas de `Clip overrides` y los selects de clip en `StateMachineCard` muestran inmediatamente el nuevo nombre sin estados `"missing ⚠"` ni `"No animation for this state"`.
- **Componentes a reusar:** `AnimatorBlendsRow` / `BlendCard` (`packages/editor/src/editor/inspector/animator-blend-rows.tsx`), `ComponentCard` / `ComponentRows` (`packages/editor/src/editor/inspector/ComponentCard.tsx`), `EntityInspector` (`packages/editor/src/editor/inspector/EntityInspector.tsx`), `PrefabInspector` (`packages/editor/src/editor/inspector/PrefabInspector.tsx`). No se crean componentes visuales nuevos ni se agregan estilos/colores.
- **Plataforma y accesibilidad:** Se mantienen intactos los roles y `aria-label` existentes de `BlendCard`, `AnimatorInitialClipRow`, `AnimatorClipOverridesRow` y `StateMachineCard`.
- **Capturas de referencia:** No aplica (el cambio no altera el layout ni introduce vistas nuevas; preserva la UI existente sin estados de error tras el renombre).

## Handoff

### Tema y alcance
Al renombrar un blend (`from → to`) en la sección `Blends` del inspector de `Animator` (`@waica/editor`), el editor debe reescribir en el mismo commit (un único paso de undo) todas las referencias al nombre viejo dentro del sujeto inspeccionado (entidad de escena o prefab): `Animator.blends`, `Animator.initialClip`, la clave de override `Animator.clips[from]` y los `clip` de `StateMachine.states` que apunten a `from`.

### Decisiones acordadas
1. **Reescritura atómica en un paso de undo:** Renombrar `from → to` actualiza en un único commit `Animator.blends`, `Animator.initialClip` (si era `from`), `Animator.clips[from] → to` (conservando orden y valores) y `StateMachine.states[s].clip === from → to`. Solo las propiedades que efectivamente referenciaban `from` se escriben.
2. **Frontera instancia vs. prefab:** En una entidad de escena (sea inline o instancia de prefab), toda escritura (incluida `StateMachine.states` si algún estado apuntaba a `from`) se aplica sobre la entidad vía `ops.setComponentProp` en el mismo commit de escena (`entity.overrides` cuando el componente viene del prefab, `entity.components` cuando es inline), sin mutar el prefab compartido. En un prefab (`PrefabInspector`), todas las escrituras se aplican sobre el prefab en un único `commitPrefab`.

### Restricciones y no-objetivos
- Eliminar un blend (`onRemove`) no reescribe referencias: sigue borrando solo la entrada en `Animator.blends`.
- No cambia `AnimatedSprite` ni el runtime de `@waica/engine`.
- No se agregan warnings nuevos en `BlendCard`.

### Supuestos explícitos
- Si en un JSON editado a mano existieran simultáneamente `Animator.clips[from]` y una clave huérfana `Animator.clips[to]` antes de renombrar `from → to`, la entrada renombrada `from` toma el nombre `to` (reemplazando la huérfana) manteniendo su posición.

### Riesgos y preguntas diferidas
- Ninguno abierto.

### Contexto recomendado para la spec
- `packages/editor/src/editor/inspector/animator-blends-edit.ts`
- `packages/editor/src/editor/inspector/animator-blend-rows.tsx`
- `packages/editor/src/editor/inspector/ComponentCard.tsx`
- `packages/editor/src/editor/inspector/EntityInspector.tsx`
- `packages/editor/src/editor/inspector/PrefabInspector.tsx`
- `packages/editor/src/editor/inspector-entity-handlers.ts`
- `packages/editor/src/editor/inspector-prefab-handlers.ts`
- `packages/editor/src/editor/inspector-animator-blends.test.tsx`
