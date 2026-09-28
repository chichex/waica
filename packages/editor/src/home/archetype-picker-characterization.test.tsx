// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defined } from '../../../engine/src/test-support'
import { ArchetypePicker } from './ArchetypePicker'

/**
 * Characterization of the new-project picker: the archetype step, the name
 * and start step, and every way it closes.
 */

afterEach(cleanup)

function openPicker() {
  const onPick = vi.fn()
  const onClose = vi.fn()
  render(<ArchetypePicker onPick={onPick} onClose={onClose} />, { reactStrictMode: true })
  return { onPick, onClose, user: userEvent.setup() }
}

describe('ArchetypePicker characterization: the archetype step', () => {
  it('lists the 2D archetypes, with the ones on the way disabled', () => {
    openPicker()

    expect(screen.getByRole('dialog', { name: 'New project' })).toBeDefined()
    expect(screen.getByText('New project — pick an archetype')).toBeDefined()
    expect(screen.getByRole('button', { name: /Platformer/ })).toHaveProperty('disabled', false)
    expect(screen.getByRole('button', { name: /Top-down/ })).toHaveProperty('disabled', false)
    expect(screen.getByRole('button', { name: /Flip screen/ })).toHaveProperty('disabled', true)
  })

  it('switches to the 3D archetypes', async () => {
    const { user } = openPicker()

    await user.click(screen.getByRole('button', { name: '3D' }))

    expect(screen.getByRole('button', { name: /Third person/ })).toHaveProperty('disabled', true)
    expect(screen.queryByRole('button', { name: /Platformer/ })).toBeNull()
  })
})

describe('ArchetypePicker characterization: the name step', () => {
  it('names the game, picks a start and hands all three to onPick', async () => {
    const { user, onPick } = openPicker()

    await user.click(screen.getByRole('button', { name: /Top-down/ }))
    expect(screen.getByText('New project — 🗺️ Top-down')).toBeDefined()
    const name = screen.getByRole('textbox', { name: "What's your game called?" })
    expect(name).toHaveProperty('value', 'my-game')
    await user.clear(name)
    await user.type(name, 'space-dog')
    await user.click(screen.getByRole('button', { name: /Blank/ }))
    await user.click(screen.getByRole('button', { name: 'Pick a folder and create' }))

    expect(onPick).toHaveBeenCalledWith('topdown', 'space-dog', 'blank')
  })

  it('submits the demo start with Enter', async () => {
    const { user, onPick } = openPicker()

    await user.click(screen.getByRole('button', { name: /Platformer/ }))
    await user.type(screen.getByRole('textbox', { name: "What's your game called?" }), '{Enter}')

    expect(onPick).toHaveBeenCalledWith('platformer', 'my-game', 'demo')
  })

  it('refuses a name that cannot be a folder and package name', async () => {
    const { user, onPick } = openPicker()

    await user.click(screen.getByRole('button', { name: /Platformer/ }))
    const name = screen.getByRole('textbox', { name: "What's your game called?" })
    await user.clear(name)
    await user.type(name, 'My Game{Enter}')

    expect(screen.getByText(/use lowercase letters, numbers and dashes/)).toBeDefined()
    expect(screen.getByRole('button', { name: 'Pick a folder and create' })).toHaveProperty('disabled', true)
    expect(onPick).not.toHaveBeenCalled()
  })

  it('goes back to the archetypes', async () => {
    const { user } = openPicker()

    await user.click(screen.getByRole('button', { name: /Platformer/ }))
    await user.click(screen.getByRole('button', { name: '← archetype' }))

    expect(screen.getByText('New project — pick an archetype')).toBeDefined()
  })
})

describe('ArchetypePicker characterization: closing', () => {
  it('closes with Escape, the close button and a click outside the dialog', async () => {
    const { user, onClose } = openPicker()

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: '✕' }))
    expect(onClose).toHaveBeenCalledTimes(2)
    fireEvent.click(defined(screen.getByRole('dialog').parentElement, 'the backdrop'))
    expect(onClose).toHaveBeenCalledTimes(3)
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(3)
  })
})
