import { useRef, useState, type InputHTMLAttributes } from 'react'

type NumberFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange'
> & {
  /** The committed value; '' renders empty (pair with a placeholder). */
  value: number | string
  /** Raw text per keystroke — parse/clamp/commit at the call site. */
  onChange(text: string): void
}

/**
 * A number input that doesn't fight the keyboard. Controlled number inputs
 * re-render mid-edit, and React skips the DOM write when old and new text
 * are numerically equal — so typing over a committed "0" leaves "044" stuck
 * in the field. Here the raw text wins while focused (blur re-snaps to the
 * committed value), and focusing selects the content so typing replaces it.
 */
export function NumberField({ value, onChange, ...rest }: NumberFieldProps) {
  const [text, setText] = useState<string | null>(null)
  const focusedAt = useRef(0)
  return (
    <input
      {...rest}
      type="number"
      value={text ?? value}
      onFocus={(e) => {
        focusedAt.current = performance.now()
        e.currentTarget.select()
      }}
      onClick={(e) => {
        // A focusing click collapses the selection with its mouseup, so
        // re-select on the click itself — never by preventing the mouseup,
        // which leaves the native spinner repeating forever. Later clicks
        // place the caret normally.
        if (performance.now() - focusedAt.current < 300) e.currentTarget.select()
      }}
      onChange={(e) => {
        setText(e.target.value)
        onChange(e.target.value)
      }}
      onBlur={() => setText(null)}
    />
  )
}
