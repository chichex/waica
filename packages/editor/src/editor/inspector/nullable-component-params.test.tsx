// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { ComponentRows } from './ComponentCard'

afterEach(cleanup)

it('does not turn an inherited null shadow default into a numeric zero (issue 203 CA-3)', () => {
  render(
    <ComponentRows id="Sun" comp={{ type: 'Sun' }} keys={['shadowMapSize']} onProp={vi.fn()} />,
    { reactStrictMode: true },
  )

  expect(screen.getByText('Shadow map size')).toBeDefined()
  expect(screen.getByText(/Inherited/)).toBeDefined()
  expect(screen.queryByRole('slider')).toBeNull()
  expect(screen.queryByRole('spinbutton')).toBeNull()
})

it.each(['Sun', 'PointLight'])('routes %s shadow sizes to the dedicated discrete control instead of a generic numeric slider', async (type) => {
  const onProp = vi.fn()
  render(
    <ComponentRows id={type} comp={{ type, props: { shadowMapSize: 1024 } }} keys={['shadowMapSize']} onProp={onProp} />,
    { reactStrictMode: true },
  )

  await userEvent.setup().click(screen.getByRole('button', { name: 'Advanced shadows' }))
  expect(screen.getByRole('combobox', { name: 'Shadow map size' })).toHaveProperty('value', '1024')
  expect(screen.queryByRole('slider')).toBeNull()
  expect(screen.queryByRole('spinbutton')).toBeNull()
  expect(onProp).not.toHaveBeenCalled()
})
