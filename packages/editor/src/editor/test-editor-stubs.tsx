// Test support: accessible stand-ins for the Editor's three.js viewport,
// Monaco and the play runner (excluded from builds). It imports nothing from
// the Editor, so vi.mock factories can load it without a module cycle.
import type { SceneJson } from '@waica/engine'

interface ViewportStubProps {
  scene: SceneJson
  mode: 'edit' | 'play'
  onMoved: (name: string, position: [number, number]) => void
  onDropPrefab?: (data: string, world: [number, number]) => void
}

/** Module factory for './Viewport'. */
export function viewportStubModule() {
  return {
    Viewport: ({ scene, mode, onMoved, onDropPrefab }: ViewportStubProps) => (
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
      </section>
    ),
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
