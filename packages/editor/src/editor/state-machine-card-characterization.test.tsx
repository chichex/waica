// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PLATFORMER_BUNDLE } from '@waica/archetype-platformer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installChassisArchetype } from '../project/chassis'
import type { MachineProps } from '../project/states'
import { StateMachineCard } from './StateMachinePanel'
import { defined } from '../../../engine/src/test-support'

// Characterization of the Role card, pinned before splitting
// StateMachinePanel.tsx by responsibility: what it renders and which
// callbacks its main interactions fire.

beforeEach(() => installChassisArchetype(PLATFORMER_BUNDLE))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const PLAYER_MACHINE = {
  role: 'player',
  initial: 'idle',
  states: {
    idle: { transitions: [{ on: 'input:jump', to: 'jump' }] },
    jump: { transitions: [{ on: 'signal:land', to: 'idle' }] },
    lonely: { transitions: [] },
  },
}

function cardSpies() {
  return {
    onPatch: vi.fn<(patch: Partial<MachineProps>) => void>(),
    onCreateRoleFile: vi.fn<(role: string) => void>(),
    onEditState: vi.fn<(state: string) => void>(),
    onRemove: vi.fn<() => void>(),
  }
}

function renderCard(
  props: Record<string, unknown>,
  options: { roleFiles?: string[]; locked?: boolean } = {},
): ReturnType<typeof cardSpies> {
  const spies = cardSpies()
  render(
    <StateMachineCard
      comp={{ type: 'StateMachine', props }}
      clips={['idle', 'jump']}
      stateFiles={[]}
      roleFiles={options.roleFiles ?? []}
      onPatch={spies.onPatch}
      onCreateRoleFile={spies.onCreateRoleFile}
      onEditState={spies.onEditState}
      onRemove={options.locked ? undefined : spies.onRemove}
      updateSchedule={<span>runs after Motor</span>}
    />,
    { reactStrictMode: true },
  )
  return spies
}

describe('StateMachineCard (characterization): what it shows', () => {
  it('shows the fixed role, its description, the initial picker and one row per state', () => {
    renderCard(PLAYER_MACHINE)

    expect(screen.getByText('Role')).toBeDefined()
    expect(screen.getByText('runs after Motor')).toBeDefined()
    expect(screen.getByText('player')).toBeDefined()
    expect(screen.getByText(/You control this character/)).toBeDefined()
    const initial = screen.getByRole('combobox', { name: 'initial' })
    expect(initial).toHaveProperty('value', 'idle')
    expect(within(initial).getAllByRole('option').map((o) => o.textContent)).toEqual(['idle', 'jump', 'lonely'])
    for (const name of ['idle', 'jump', 'lonely']) {
      expect(screen.getByRole('button', { name, description: 'Edit this state (clip, transitions, code)' })).toBeDefined()
    }
    expect(screen.getAllByRole('button', { description: 'Delete this state' })).toHaveLength(3)
    // "lonely" has no clip and nothing leads to it: two warnings plus the no-code note.
    expect(screen.getAllByText('⚠')).toHaveLength(2)
    expect(screen.getAllByText('ⓘ')).toHaveLength(1)
  })

  it('offers to create the file of a role the editor does not know', async () => {
    const user = userEvent.setup()
    const spies = renderCard({ role: 'guard', initial: '', states: {} })

    expect(screen.getByText(/"guard" is not a role the editor knows/)).toBeDefined()
    await user.click(screen.getByRole('button', { name: '✚ Create role file — src/roles/guard.ts' }))
    expect(spies.onCreateRoleFile).toHaveBeenCalledWith('guard')
  })

  it('reports an existing role file instead of offering to create it', () => {
    renderCard({ role: 'guard', initial: '', states: {} }, { roleFiles: ['guard.ts'] })

    expect(screen.getByText(/Role file found: src\/roles\/guard\.ts/)).toBeDefined()
    expect(screen.queryByRole('button', { name: /Create role file/ })).toBeNull()
  })
})

describe('StateMachineCard (characterization): editing the machine', () => {
  it('opens a state for editing and changes the initial state through onPatch', async () => {
    const user = userEvent.setup()
    const spies = renderCard(PLAYER_MACHINE)

    await user.click(screen.getByRole('button', { name: 'jump' }))
    expect(spies.onEditState).toHaveBeenCalledWith('jump')

    await user.selectOptions(screen.getByRole('combobox', { name: 'initial' }), 'lonely')
    expect(spies.onPatch).toHaveBeenLastCalledWith({ initial: 'lonely' })
  })

  it('deletes a confirmed state, pruning edges to it and moving initial off it', async () => {
    const user = userEvent.setup()
    // happy-dom has no window.confirm to spy on, so the test provides one.
    const confirm = vi.fn(() => false).mockReturnValueOnce(false).mockReturnValueOnce(true)
    vi.stubGlobal('confirm', confirm)
    const spies = renderCard(PLAYER_MACHINE)
    const deleteIdle = defined(screen.getAllByRole('button', { description: 'Delete this state' })[0])

    await user.click(deleteIdle)
    expect(confirm).toHaveBeenLastCalledWith('Delete state "idle"?')
    expect(spies.onPatch).not.toHaveBeenCalled()

    await user.click(deleteIdle)
    expect(spies.onPatch).toHaveBeenLastCalledWith({
      states: { jump: { transitions: [] }, lonely: { transitions: [] } },
      initial: 'jump',
    })
  })

  it('removes the component only when it is not prefab-locked', async () => {
    const user = userEvent.setup()
    const spies = renderCard(PLAYER_MACHINE)
    await user.click(screen.getByRole('button', { description: 'Remove component' }))
    expect(spies.onRemove).toHaveBeenCalledTimes(1)

    cleanup()
    renderCard(PLAYER_MACHINE, { locked: true })
    expect(screen.queryByRole('button', { description: 'Remove component' })).toBeNull()
  })
})

describe('StateMachineCard (characterization): adding states', () => {
  it('adds a state by Enter or the add button, making it initial when there is none, then opens it', async () => {
    const user = userEvent.setup()
    const spies = renderCard({ role: 'player', initial: '', states: {} })

    expect(screen.getByText('no states yet — add the first one')).toBeDefined()
    expect(screen.getByRole('option', { name: '(first state)' })).toBeDefined()
    const field = screen.getByPlaceholderText('new state name…')
    expect(screen.getByRole('button', { name: 'add' }).hasAttribute('disabled')).toBe(true)

    await user.type(field, ' dash {Enter}')
    expect(spies.onPatch).toHaveBeenLastCalledWith({ states: { dash: { transitions: [] } }, initial: 'dash' })
    expect(spies.onEditState).toHaveBeenLastCalledWith('dash')
    expect(field).toHaveProperty('value', '')

    await user.type(field, 'slide')
    await user.click(screen.getByRole('button', { name: 'add' }))
    expect(spies.onEditState).toHaveBeenLastCalledWith('slide')
  })

  it('keeps initial when adding to a machine that has one', async () => {
    const user = userEvent.setup()
    const spies = renderCard(PLAYER_MACHINE)

    await user.type(screen.getByPlaceholderText('new state name…'), 'dash{Enter}')
    expect(spies.onPatch).toHaveBeenLastCalledWith({
      states: { ...PLAYER_MACHINE.states, dash: { transitions: [] } },
    })
  })

  it('refuses taken and reserved names with a warning and a disabled add', async () => {
    const user = userEvent.setup()
    const spies = renderCard(PLAYER_MACHINE)
    const field = screen.getByPlaceholderText('new state name…')

    await user.type(field, 'jump')
    expect(screen.getByText('a state named “jump” already exists')).toBeDefined()
    expect(screen.getByRole('button', { name: 'add' }).hasAttribute('disabled')).toBe(true)
    await user.type(field, '{Enter}')

    await user.clear(field)
    await user.type(field, 'default{Enter}')
    expect(screen.getByText('a state named “default” already exists')).toBeDefined()
    expect(spies.onPatch).not.toHaveBeenCalled()
  })
})
