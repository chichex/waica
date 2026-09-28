// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi, type Mock } from 'vitest'
import type { ParamDiagnostic } from './collision-category-diagnostics'
import { StringListField } from './StringListField'

/**
 * Characterization of StringListField before it is split by responsibility:
 * the entries it renders, the lists it commits and how diagnostics attach.
 */

afterEach(cleanup)

function renderField(
  value: unknown = ['red', 'blue'],
  diagnostics?: readonly ParamDiagnostic[],
): Mock<(value: unknown[]) => void> {
  const onChange = vi.fn<(value: unknown[]) => void>()
  render(
    <StringListField
      param="tags"
      name={<span>Tags</span>}
      value={value}
      diagnostics={diagnostics}
      onChange={onChange}
    />,
    { reactStrictMode: true },
  )
  return onChange
}

it('edits, removes and adds entries as whole lists', async () => {
  const user = userEvent.setup()
  const onChange = renderField()

  expect(screen.getByText('Tags')).toBeDefined()
  const second = screen.getByRole<HTMLInputElement>('textbox', { name: 'tags entry 2' })
  expect(second.value).toBe('blue')
  fireEvent.change(second, { target: { value: 'green' } })
  expect(onChange).toHaveBeenLastCalledWith(['red', 'green'])

  await user.click(screen.getByRole('button', { name: 'Remove tags entry 1' }))
  expect(onChange).toHaveBeenLastCalledWith(['blue'])

  await user.click(screen.getByRole('button', { name: '+ add' }))
  expect(onChange).toHaveBeenLastCalledWith(['red', 'blue', ''])
})

it('shows non-string entries as JSON', () => {
  renderField([3, { a: 1 }])

  expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'tags entry 1' }).value).toBe('3')
  expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'tags entry 2' }).value).toBe(
    '{"a":1}',
  )
})

it('wraps a non-list value in a single field that commits a one-entry list', async () => {
  const user = userEvent.setup()
  const onChange = renderField('solo')

  const field = screen.getByRole<HTMLInputElement>('textbox', { name: 'tags' })
  expect(field.value).toBe('solo')
  fireEvent.change(field, { target: { value: 'duo' } })
  expect(onChange).toHaveBeenLastCalledWith(['duo'])

  await user.click(screen.getByRole('button', { name: '+ add' }))
  expect(onChange).toHaveBeenLastCalledWith([''])
})

it('announces errors as alerts and warnings as status on the entries they concern', () => {
  renderField(undefined, [
    { severity: 'error', message: 'unknown layer', entry: 1 },
    { severity: 'warning', message: 'duplicate', entry: 0 },
  ])

  expect(screen.getByRole('alert').textContent).toBe('Error: unknown layer')
  expect(screen.getByRole('status').textContent).toBe('Warning: duplicate')
  const first = screen.getByRole('textbox', { name: 'tags entry 1' })
  const second = screen.getByRole('textbox', { name: 'tags entry 2' })
  expect(first.getAttribute('aria-invalid')).toBeNull()
  expect(second.getAttribute('aria-invalid')).toBe('true')
  expect(first.getAttribute('aria-describedby')).toBe(second.getAttribute('aria-describedby'))
  expect(document.getElementById(second.getAttribute('aria-describedby') ?? '')).not.toBeNull()
})

it('marks every entry for a field-level error and the lone field of a non-list', () => {
  renderField(undefined, [{ severity: 'error', message: 'not a list' }])
  for (const name of ['tags entry 1', 'tags entry 2']) {
    expect(screen.getByRole('textbox', { name }).getAttribute('aria-invalid')).toBe('true')
  }
  cleanup()

  renderField(7, [{ severity: 'error', message: 'not a list' }])
  const field = screen.getByRole('textbox', { name: 'tags' })
  expect(field.getAttribute('aria-invalid')).toBe('true')
  expect(field.getAttribute('aria-describedby')).not.toBeNull()
})

it('renders no diagnostics region without diagnostics', () => {
  renderField()

  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByRole('status')).toBeNull()
  const first = screen.getByRole('textbox', { name: 'tags entry 1' })
  expect(first.getAttribute('aria-describedby')).toBeNull()
})
