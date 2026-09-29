// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PLATFORMER_BUNDLE } from '@waica/archetype-platformer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installChassisArchetype, type CharacterIdentity } from '../project/chassis'
import { RolePickerModal, type NewCharacterPick } from './StateMachinePanel'
import { defined } from '../../../engine/src/test-support'

// Characterization of the character creation dialog, pinned before
// splitting StateMachinePanel.tsx by responsibility: what it offers and
// what it picks for its main interactions.

beforeEach(() => installChassisArchetype(PLATFORMER_BUNDLE))
afterEach(cleanup)

function renderRolePicker(suggested: CharacterIdentity) {
  const spies = { onPick: vi.fn<(pick: NewCharacterPick) => void>(), onCancel: vi.fn<() => void>() }
  render(<RolePickerModal suggested={suggested} onPick={spies.onPick} onCancel={spies.onCancel} />, {
    reactStrictMode: true,
  })
  return spies
}

/** The "custom" radio of one radio group (both groups offer one). */
function customRadio(group: 'identity' | 'enemy-role'): HTMLElement {
  return defined(
    screen
      .getAllByRole('radio')
      .find((r) => r.getAttribute('name') === group && r.closest('label')?.textContent?.startsWith('custom')),
    `the custom ${group} radio`,
  )
}

describe('RolePickerModal (characterization): identities', () => {
  it('creates the suggested player straight away', async () => {
    const user = userEvent.setup()
    const spies = renderRolePicker('player')

    expect(screen.getByText('New character — what is it?')).toBeDefined()
    expect(screen.getByRole('radio', { name: /^player/ })).toHaveProperty('checked', true)
    expect(screen.getByText(/Respawn included/)).toBeDefined()
    expect(screen.queryByRole('radio', { name: /^patroller/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(spies.onPick).toHaveBeenCalledWith({ identity: 'player', role: 'player' })
  })

  it('creates an npc or a custom identity', async () => {
    const user = userEvent.setup()
    const spies = renderRolePicker('player')

    await user.click(screen.getByRole('radio', { name: /^npc/ }))
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(spies.onPick).toHaveBeenLastCalledWith({ identity: 'npc', role: 'npc' })

    await user.click(customRadio('identity'))
    expect(screen.getByRole('button', { name: 'Create' }).hasAttribute('disabled')).toBe(true)
    await user.type(screen.getByPlaceholderText('your role name…'), 'boss')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(spies.onPick).toHaveBeenLastCalledWith({ identity: 'custom', role: 'boss' })
  })

  it('cancels from the close button, Cancel and Escape', async () => {
    const user = userEvent.setup()
    const spies = renderRolePicker('player')

    await user.click(screen.getByRole('button', { name: '✕' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.keyboard('{Escape}')
    expect(spies.onCancel).toHaveBeenCalledTimes(3)
    expect(spies.onPick).not.toHaveBeenCalled()
  })
})

describe('RolePickerModal (characterization): enemies', () => {
  it('lets an enemy pick how it hunts among the non-identity roles', async () => {
    const user = userEvent.setup()
    const spies = renderRolePicker('enemy')

    const hunting = screen.getAllByRole('radio').filter((r) => r.getAttribute('name') === 'enemy-role')
    expect(hunting).toHaveLength(3)
    expect(screen.getByRole('radio', { name: /^patroller/ })).toHaveProperty('checked', true)
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(spies.onPick).toHaveBeenLastCalledWith({ identity: 'enemy', role: 'patroller' })

    await user.click(screen.getByRole('radio', { name: /^chaser/ }))
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(spies.onPick).toHaveBeenLastCalledWith({ identity: 'enemy', role: 'chaser' })
  })

  it('names a custom enemy role, with Create disabled until it has a name', async () => {
    const user = userEvent.setup()
    const spies = renderRolePicker('enemy')

    await user.click(customRadio('enemy-role'))
    expect(screen.getByRole('button', { name: 'Create' }).hasAttribute('disabled')).toBe(true)
    await user.type(screen.getByPlaceholderText('your role name…'), ' guard ')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(spies.onPick).toHaveBeenCalledWith({ identity: 'enemy', role: 'guard' })
  })
})
