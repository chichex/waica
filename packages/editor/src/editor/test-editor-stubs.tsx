// Test support: accessible stand-ins for the Editor's three.js viewport,
// Monaco and the play runner (excluded from builds). It imports nothing from
// the Editor, so vi.mock factories can load it without a module cycle.
import { forwardRef, useImperativeHandle } from 'react'
import type { SceneJson, TransformJson } from '@waica/engine'

/**
 * What the stub viewport's handle was asked for: the blend previews and their
 * ends (issue 205 CA-21), and what it answers a preview: null when a live
 * Animator plays it, else why not. A test resets it before it opens the Editor.
 */
export const stubViewportHandle = {
  previews: [] as Array<[string, string, string, number]>,
  stops: [] as Array<[string, string]>,
  refusal: null as 'play' | 'not-loaded' | 'not-built' | null,
  reset(): void {
    this.previews = []
    this.stops = []
    this.refusal = null
  },
}

interface ViewportStubProps {
  scene: SceneJson
  mode: 'edit' | 'play'
  onMoved: (name: string, position: [number, number]) => void
  onDropPrefab?: (data: string, world: [number, number]) => void
  onTransformed?: (changes: Array<{ name: string; transform: TransformJson }>) => void
}

/** What the stub's gizmo drag leaves: the first two entities lifted, the first one also turned. */
function stubGizmoDrag(scene: SceneJson): Array<{ name: string; transform: TransformJson }> {
  return scene.entities.slice(0, 2).map((entity, index) => ({
    name: entity.name,
    transform: { position: [index * 2 + 1.5, 2, -3], rotation: [0, index === 0 ? 90 : 0, 0], scale: [1, 1, 1] },
  }))
}

/** The stub viewport's handle: live edits do nothing, the blend preview is recorded in stubViewportHandle. */
function stubHandle() {
  return {
    applyProp: () => {},
    applyMove: () => {},
    applyTransform: () => {},
    game: () => null,
    previewBlend: ({ entity, blend, param, value }: { entity: string; blend: string; param: string; value: number }) => {
      stubViewportHandle.previews.push([entity, blend, param, value])
      return stubViewportHandle.refusal
    },
    stopBlendPreview: ({ entity, blend }: { entity: string; blend: string }) => {
      stubViewportHandle.stops.push([entity, blend])
    },
  }
}

/** Module factory for './Viewport'. */
export function viewportStubModule() {
  return {
    Viewport: forwardRef<unknown, ViewportStubProps>(function ViewportStub({ scene, mode, onMoved, onDropPrefab, onTransformed }, ref) {
      useImperativeHandle(ref, stubHandle)
      return (
        <section aria-label="viewport">
          <p>{`viewport mode: ${mode}`}</p>
          <ul aria-label="viewport entities">
            {scene.entities.map((entity) => (
              <li key={entity.name}>{entity.name}</li>
            ))}
          </ul>
          <button
            onClick={() => {
              const first = scene.entities[0]
              if (first) onMoved(first.name, [3, 4])
            }}
          >
            move first entity
          </button>
          {onDropPrefab && (
            <button onClick={() => onDropPrefab('objects/crate', [1.234, 2.345])}>drop crate</button>
          )}
          {onTransformed && <button onClick={() => onTransformed(stubGizmoDrag(scene))}>gizmo drag</button>}
        </section>
      )
    }),
  }
}

/** Module factory for '@monaco-editor/react'. */
export function monacoStubModule() {
  return {
    default: ({ value, onChange }: { value: string; onChange?: (next: string) => void }) => (
      <textarea aria-label="code source" value={value} onChange={(e) => onChange?.(e.target.value)} />
    ),
  }
}

/** Module factory for './play-runner'. */
export function playRunnerStubModule() {
  return {
    transpile: (source: string) => Promise.resolve(source),
    createModule: () => Promise.resolve('data:text/javascript,'),
    execute: () => Promise.resolve({}),
    reset: () => {},
  }
}
