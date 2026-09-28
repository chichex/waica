/** Eye toggle in a section header: shows or hides that part in the viewport (editor only). */
export function ViewportVisibilityButton({
  label,
  visible,
  onChange,
}: {
  label: string
  visible: boolean
  onChange: (visible: boolean) => void
}) {
  const action = visible ? 'Hide' : 'Show'
  return (
    <button
      type="button"
      className={`ed-vp-visibility ${visible ? '' : 'is-hidden'}`}
      title={`${action} ${label.toLowerCase()} in the viewport (editor only)`}
      aria-label={`${action} ${label.toLowerCase()} in the viewport`}
      aria-pressed={visible}
      onClick={() => onChange(!visible)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
        <circle cx="12" cy="12" r="2.7" />
        {!visible && <path d="M4 4l16 16" />}
      </svg>
    </button>
  )
}
