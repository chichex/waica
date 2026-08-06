/**
 * Shared "current value fell out of the known set" affordance for typed
 * selects (RefRow's project-reference picker, StateMachinePanel's clip
 * picker): a gold `is-missing` border plus a phantom option, so the select
 * shows the saved value instead of silently jumping to whatever option
 * happens to be first.
 */
export function missingOptionClass(missing: boolean): string | undefined {
  return missing ? 'is-missing' : undefined
}

/** The phantom option itself: `value` kept selected, labeled as missing. */
export function MissingOption({ value }: { value: string }) {
  return <option value={value}>{value} — missing ⚠</option>
}
