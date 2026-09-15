import { useId } from 'react'
import type { ParamDiagnostic } from './collision-category-diagnostics'

function displayedValue(value: unknown): string {
  if (typeof value === 'string') return value
  const serialized = JSON.stringify(value)
  return serialized === undefined ? String(value) : serialized
}

export function ParamDiagnosticMessages({
  diagnostics,
  id,
}: {
  diagnostics: readonly ParamDiagnostic[]
  id: string
}) {
  if (diagnostics.length === 0) return null
  return (
    <div id={id} className="ed-param-diagnostics">
      {diagnostics.map((diagnostic, index) => (
        <div
          className={`ed-param-diagnostic is-${diagnostic.severity}`}
          role={diagnostic.severity === 'error' ? 'alert' : 'status'}
          key={`${diagnostic.severity}:${diagnostic.entry ?? 'field'}:${index}`}
        >
          {diagnostic.severity === 'error' ? 'Error: ' : 'Warning: '}
          {diagnostic.message}
        </div>
      ))}
    </div>
  )
}

export function StringListField({
  param,
  name,
  value,
  diagnostics = [],
  onChange,
}: {
  param: string
  name: React.ReactNode
  value: unknown
  diagnostics?: readonly ParamDiagnostic[]
  onChange(value: unknown[]): void
}) {
  const diagnosticId = `${useId().replaceAll(':', '')}-${param}-diagnostics`
  const entries = Array.isArray(value) ? value : null
  const fieldDiagnostics = diagnostics.filter(
    (diagnostic) => diagnostic.entry === undefined,
  )
  const fieldErrors = fieldDiagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error',
  )
  return (
    <div className="ed-row ed-row-string-list" data-param-list={param}>
      <div className="ed-string-list-label">{name}</div>
      <div
        className="ed-string-list-control"
        aria-invalid={fieldErrors.length > 0 || undefined}
        aria-describedby={fieldDiagnostics.length > 0 ? diagnosticId : undefined}
      >
        {entries ? (
          entries.map((entry, index) => {
            const entryDiagnostics = diagnostics.filter(
              (diagnostic) => diagnostic.entry === undefined || diagnostic.entry === index,
            )
            const hasError = entryDiagnostics.some(
              (diagnostic) => diagnostic.severity === 'error',
            )
            return (
              <div className="ed-string-list-entry" key={index}>
                <input
                  type="text"
                  value={displayedValue(entry)}
                  aria-label={`${param} entry ${index + 1}`}
                  aria-invalid={hasError || undefined}
                  aria-describedby={entryDiagnostics.length > 0 ? diagnosticId : undefined}
                  onChange={(event) => {
                    const next = [...entries]
                    next[index] = event.target.value
                    onChange(next)
                  }}
                />
                <button
                  type="button"
                  className="ed-mini"
                  data-list-remove
                  aria-label={`Remove ${param} entry ${index + 1}`}
                  onClick={() => onChange(entries.filter((_, entryIndex) => entryIndex !== index))}
                >
                  −
                </button>
              </div>
            )
          })
        ) : (
          <input
            type="text"
            value={displayedValue(value)}
            aria-label={param}
            aria-invalid={fieldErrors.length > 0 || undefined}
            aria-describedby={fieldErrors.length > 0 ? diagnosticId : undefined}
            onChange={(event) => onChange([event.target.value])}
          />
        )}
        <button
          type="button"
          className="ed-mini ed-string-list-add"
          data-list-add
          onClick={() => onChange([...(entries ?? []), ''])}
        >
          + add
        </button>
      </div>
      <ParamDiagnosticMessages diagnostics={diagnostics} id={diagnosticId} />
    </div>
  )
}
