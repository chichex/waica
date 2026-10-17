// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ComponentRows } from './ComponentCard'

afterEach(cleanup)

it('does not turn an inherited null shadow default into a numeric zero (issue #203 CA-3)', () => {
  render(
    <ComponentRows id="Sun" comp={{ type: 'Sun' }} keys={['shadowMapSize']} onProp={vi.fn()} />,
    { reactStrictMode: true },
  )

  expect(screen.getByText('Shadow map size')).toBeDefined()
  expect(screen.queryByRole('slider')).toBeNull()
  expect(screen.queryByRole('spinbutton')).toBeNull()
})
