// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExportDesktopModal } from './ExportDesktopModal'

afterEach(cleanup)

function renderModal(steamAppId: number | null = null) {
  const user = userEvent.setup()
  const onClose = vi.fn<() => void>()
  render(<ExportDesktopModal steamAppId={steamAppId} onClose={onClose} />, { reactStrictMode: true })
  return { user, onClose, dialog: screen.getByRole('dialog', { name: 'Export desktop' }) }
}

function command(): string {
  return screen.getByRole<HTMLInputElement>('textbox', { name: 'Run this in your project folder:' }).value
}

describe('ExportDesktopModal builds the command (issue 200 CA-24)', () => {
  it('starts with the three platforms checked and the plain command', () => {
    renderModal()
    for (const name of ['Linux', 'Windows', 'macOS']) expect(screen.getByRole('checkbox', { name })).toHaveProperty('checked', true)
    expect(command()).toBe('npx @waica/cli export desktop .')
  })

  it('names the platforms left when one is unchecked, live', async () => {
    const { user } = renderModal()
    await user.click(screen.getByRole('checkbox', { name: 'macOS' }))
    expect(command()).toBe('npx @waica/cli export desktop . --platform linux,win32')
    await user.click(screen.getByRole('checkbox', { name: 'Linux' }))
    expect(command()).toBe('npx @waica/cli export desktop . --platform win32')
  })

  it('disables Copy when no platform is left', async () => {
    const { user } = renderModal()
    for (const name of ['Linux', 'Windows', 'macOS']) await user.click(screen.getByRole('checkbox', { name }))
    expect(screen.getByRole('button', { name: 'Copy' })).toHaveProperty('disabled', true)
  })

})

describe('ExportDesktopModal: Steam and the guide (issue 200 CA-24)', () => {
  it('offers Steam only when game.json declares it, on by default, and --no-steam when turned off', async () => {
    const { user } = renderModal(480)
    const steam = screen.getByRole('checkbox', { name: 'Include Steamworks (app 480)' })
    expect(steam).toHaveProperty('checked', true)
    expect(command()).toBe('npx @waica/cli export desktop .')
    await user.click(steam)
    expect(command()).toBe('npx @waica/cli export desktop . --no-steam')
  })

  it('has no Steam toggle without desktop.steam', () => {
    renderModal(null)
    expect(screen.queryByRole('checkbox', { name: /Steamworks/ })).toBeNull()
  })

  it('links to the signing and store guide', () => {
    const { dialog } = renderModal()
    expect(within(dialog).getByRole('link', { name: /Signing and store upload/ }).getAttribute('href')).toBe(
      'https://github.com/chichex/waica/blob/main/docs/desktop-export.md',
    )
  })
})

describe('ExportDesktopModal copies the command (issue 200 CA-25)', () => {
  it('says Copied once the clipboard took the command', async () => {
    const { user } = renderModal()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith('npx @waica/cli export desktop .')
    expect(await screen.findByText('Copied')).toBeDefined()
  })

  it('tells how to copy by hand when the clipboard refuses', async () => {
    const { user } = renderModal()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(await screen.findByText("Couldn't copy: select the command and press Ctrl+C")).toBeDefined()
  })

  it('keeps the command read-only and selects all of it on focus', async () => {
    const { user } = renderModal()
    const field = screen.getByRole<HTMLInputElement>('textbox', { name: 'Run this in your project folder:' })
    expect(field.readOnly).toBe(true)
    await user.click(field)
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, field.value.length])
  })

  it('closes on Escape and on Close', async () => {
    const { user, onClose } = renderModal()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

describe('ExportDesktopModal: the copy message follows the command (issue 200 CA-25)', () => {
  it('clears Copied once the command changes', async () => {
    const { user } = renderModal()
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(await screen.findByText('Copied')).toBeDefined()
    await user.click(screen.getByRole('checkbox', { name: 'macOS' }))
    expect(screen.queryByText('Copied')).toBeNull()
  })
})
