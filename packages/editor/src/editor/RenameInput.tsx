import { useState } from 'react'

/** Inline rename field shown in place of an Explorer row's label: Enter or blur commits, Escape cancels. */
export function RenameInput({
  value,
  onCommit,
  onCancel,
}: {
  value: string
  onCommit: (next: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(value)
  return (
    <input
      className="ed-x-edit"
      value={text}
      // eslint-disable-next-line jsx-a11y/no-autofocus -- the user just asked to rename this row (F2, double-click or the menu); focus moves into the field
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setText(e.currentTarget.value)}
      onBlur={() => onCommit(text)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') onCommit(text)
        if (e.key === 'Escape') onCancel()
      }}
    />
  )
}
