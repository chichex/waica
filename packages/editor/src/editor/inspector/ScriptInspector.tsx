import { useArchetype } from '../../project/archetype'
import { classDefaults } from '../../project/component-defaults'

/** A built-in script's declared params and their defaults, read-only. */
export function ScriptInspector({ name }: { name: string }) {
  const archetype = useArchetype()
  const Class = archetype.registry.components[name]
  if (!Class) return <div className="ed-hint ed-pad">unknown script</div>
  const defaults = classDefaults(Class, name)
  const params = Object.entries(Class.params ?? {})
  return (
    <div className="ed-pad">
      <div className="ed-hint">
        params declared in the code — the editor shows them as sliders wherever this script is
        used:
      </div>
      <div className="ed-comp">
        <header className="ed-comp-head">
          <span>params</span>
        </header>
        {params.length === 0 && <div className="ed-hint">no parameters</div>}
        {params.map(([key, spec]) => (
          <div
            className="ed-row"
            key={key}
            title={`min ${spec.min ?? '—'} · max ${spec.max ?? '—'} · step ${spec.step ?? '—'}`}
          >
            <span>{spec.label ?? key}</span>
            <span className="ed-ro">{String(defaults[key] ?? '')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
