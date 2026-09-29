// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Monaco needs workers and layout; the pane's contract is the source it hands
// the editor and the edits it reports, so a labelled textarea stands in.
vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }: { value: string; onChange: (next: string) => void }) => (
    <textarea aria-label="piece source" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}))

import { UiPane } from './UiPane'

afterEach(cleanup)

describe('UiPane', () => {
  it('reports every edit up and shows the source it is given', () => {
    const onChange = vi.fn()
    const { rerender } = render(<UiPane name="score" html="<b>0</b>" stats={{}} onChange={onChange} />, {
      reactStrictMode: true,
    })
    const source = screen.getByRole('textbox', { name: 'piece source' })
    expect(source).toHaveProperty('value', '<b>0</b>')

    fireEvent.change(source, { target: { value: '<b>1</b>' } })
    expect(onChange).toHaveBeenLastCalledWith('<b>1</b>')

    // The Editor commits the edit and hands it back as the new html.
    rerender(<UiPane name="score" html="<b>1</b>" stats={{}} onChange={onChange} />)
    expect(screen.getByRole('textbox', { name: 'piece source' })).toHaveProperty('value', '<b>1</b>')
  })

  it('shows an external change such as an undo', () => {
    const { rerender } = render(<UiPane name="score" html="<b>1</b>" stats={{}} onChange={() => {}} />, {
      reactStrictMode: true,
    })
    rerender(<UiPane name="score" html="<b>0</b>" stats={{}} onChange={() => {}} />)
    expect(screen.getByRole('textbox', { name: 'piece source' })).toHaveProperty('value', '<b>0</b>')
  })
})
