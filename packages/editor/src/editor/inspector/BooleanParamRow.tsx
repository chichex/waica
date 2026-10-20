import { useId, type ReactNode } from 'react'
import type { ParamDiagnostic } from '../collision-category-diagnostics'
import { ParamDiagnosticMessages } from '../StringListField'

/** A rejected boolean edit keeps the checkbox and associates its error with it. */
export function BooleanParamRow({ name, value, diagnostics, onChange }: {
  name: ReactNode
  value: boolean
  diagnostics?: readonly ParamDiagnostic[]
  onChange: (value: unknown) => void
}) {
  const id = useId()
  return (
    <div className="ed-param-block">
      <label className="ed-row">
        {name}
        <input type="checkbox" checked={value}
          aria-invalid={diagnostics?.some((diagnostic) => diagnostic.severity === 'error') || undefined}
          aria-describedby={diagnostics?.length ? id : undefined}
          onChange={(event) => onChange(event.target.checked)} />
      </label>
      <ParamDiagnosticMessages id={id} diagnostics={diagnostics ?? []} />
    </div>
  )
}
