// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModalBackdrop } from './ModalBackdrop'

afterEach(cleanup)

describe('ModalBackdrop', () => {
  it('dismisses on a press outside the modal, never on one inside it', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    render(
      <ModalBackdrop onDismiss={onDismiss}>
        <div role="dialog" aria-label="State">
          <button type="button">Save</button>
        </div>
      </ModalBackdrop>,
      { reactStrictMode: true },
    )

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onDismiss).not.toHaveBeenCalled()

    await user.click(screen.getByRole('presentation'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
