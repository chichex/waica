import { useState } from 'react'
import { MissingOption, missingOptionClass } from '../missing-option'
import type { RefKind, RefTarget } from '../ref-targets'

/** Sentinel option value: switches a ref row from the picker to free text. */
const CUSTOM_REF_OPTION = '\u0000waica-custom-ref'

/** The free-text side of a ref row, with a button back to the picker. */
function CustomRefInput({
  name,
  value,
  missing,
  onChange,
  onPick,
}: {
  name: React.ReactNode
  value: string
  missing: boolean
  onChange: (value: string) => void
  onPick: () => void
}) {
  return (
    <label className="ed-row">
      {name}
      <span className="ed-ref-custom">
        <input
          type="text"
          className={missingOptionClass(missing)}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="ed-ref-toggle"
          title="Pick from the project's known values instead"
          onClick={onPick}
        >
          ▾
        </button>
      </span>
    </label>
  )
}

interface RefPickerProps {
  name: React.ReactNode
  value: string
  missing: boolean
  refKind: RefKind | undefined
  targets: RefTarget[]
  onChange: (value: string) => void
  onCustom: () => void
}

/** The picker side of a ref row: known targets, a missing marker and the Custom… option. */
function RefPicker({ name, value, missing, refKind, targets, onChange, onCustom }: RefPickerProps) {
  return (
    <label className="ed-row">
      {name}
      <select
        className={missingOptionClass(missing)}
        value={value}
        aria-invalid={missing || undefined}
        title={missing ? `Missing ${refKind} reference: ${value}` : undefined}
        onChange={(e) => {
          if (e.target.value === CUSTOM_REF_OPTION) {
            onCustom()
            return
          }
          onChange(e.target.value)
        }}
      >
        <option value="">none</option>
        {missing && <MissingOption value={value} />}
        {targets.map((target) => (
          <option key={target.value} value={target.value}>
            {target.label}
          </option>
        ))}
        <option value={CUSTOM_REF_OPTION}>Custom…</option>
      </select>
    </label>
  )
}

/**
 * A typed-reference param: a picker over the project's known targets (with
 * a "missing ⚠" marker when the current value fell out of that set), plus a
 * "Custom…" escape hatch that swaps to a plain text input. The escape hatch
 * exists because some refs are legitimately declared by use rather than by
 * a project file — Collectible.stat is the standing example: validate_project
 * keeps an undeclared stat a warning, not an error, because the runtime
 * creates it on first write. Locking the row to only-known-values would make
 * that workflow impossible from the Inspector.
 */
export function RefRow({
  name,
  value,
  refKind,
  targets,
  onChange,
}: {
  name: React.ReactNode
  value: string
  refKind: RefKind | undefined
  targets: RefTarget[]
  onChange: (value: string) => void
}) {
  const [custom, setCustom] = useState(false)
  const missing = value !== '' && !targets.some((target) => target.value === value)
  if (custom) {
    return (
      <CustomRefInput
        name={name}
        value={value}
        missing={missing}
        onChange={onChange}
        onPick={() => setCustom(false)}
      />
    )
  }
  return (
    <RefPicker
      name={name}
      value={value}
      missing={missing}
      refKind={refKind}
      targets={targets}
      onChange={onChange}
      onCustom={() => setCustom(true)}
    />
  )
}
