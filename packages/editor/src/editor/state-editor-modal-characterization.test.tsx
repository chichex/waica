// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { StateJson } from '@waica/engine'
import { PLATFORMER_BUNDLE } from '@waica/archetype-platformer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installChassisArchetype } from '../project/chassis'
import type { MachineProps } from '../project/states'
import { StateEditorModal } from './StateMachinePanel'
import { defined, match } from '../../../engine/src/test-support'

// Characterization of the state editor modal, pinned before splitting
// StateMachinePanel.tsx by responsibility: what it renders and what it
// saves for its main interactions.

beforeEach(() => installChassisArchetype(PLATFORMER_BUNDLE))
afterEach(cleanup)

const PLAYER_MACHINE = {
  role: 'player',
  initial: 'idle',
  states: {
    idle: { transitions: [{ on: 'input:jump', to: 'jump' }] },
    jump: { transitions: [{ on: 'signal:land', to: 'idle' }] },
    lonely: { transitions: [] },
  },
}

function modalSpies() {
  return {
    onCreateFile: vi.fn<(state: string) => void>(),
    onSave: vi.fn<(patch: { states: Record<string, StateJson>; initial: string }) => void>(),
    onCancel: vi.fn<() => void>(),
  }
}

function renderStateModal(
  machine: MachineProps,
  state: string,
  options: { clips?: string[]; stateFiles?: string[] } = {},
): ReturnType<typeof modalSpies> {
  const spies = modalSpies()
  render(
    <StateEditorModal
      title="characters/hero"
      machine={machine}
      state={state}
      clips={options.clips ?? ['idle', 'jump', 'run']}
      inputActions={['jump', 'left']}
      stateFiles={options.stateFiles ?? []}
      onCreateFile={spies.onCreateFile}
      onSave={spies.onSave}
      onCancel={spies.onCancel}
    />,
    { reactStrictMode: true },
  )
  return spies
}

describe('StateEditorModal (characterization): what it shows', () => {
  it('shows the state, its incoming edges, its transitions and its built-in code', () => {
    renderStateModal(PLAYER_MACHINE, 'jump')

    expect(screen.getByText('State “jump” — characters/hero')).toBeDefined()
    expect(screen.getByRole('textbox', { name: 'name' })).toHaveProperty('value', 'jump')
    expect(screen.getByRole('combobox', { name: 'animation' })).toHaveProperty('value', '')
    expect(screen.getByRole('option', { name: 'same name (jump)' })).toBeDefined()
    expect(screen.getByText('⬅ reached from idle (key press jump)')).toBeDefined()
    expect(screen.getByDisplayValue('signal')).toBeDefined()
    expect(screen.getByDisplayValue('land')).toBeDefined()
    expect(screen.getByText('✓ Built into the “player” role — runs in editor Play and in your game')).toBeDefined()
  })

  it('explains an initial state and an unreachable one', () => {
    renderStateModal({ role: 'npc', initial: 'a', states: { a: { transitions: [] } } }, 'a', { clips: ['a'] })
    expect(screen.getByText('⬅ the initial state — the machine starts here')).toBeDefined()
    cleanup()
    renderStateModal(PLAYER_MACHINE, 'lonely')
    expect(screen.getByText(/Nothing leads here yet/)).toBeDefined()
    expect(screen.getByText('no transitions — this state never leaves by itself')).toBeDefined()
    expect(screen.getByText(/No animation for this state/)).toBeDefined()
  })

  it('flags a transition to a missing state', () => {
    renderStateModal({ role: 'npc', initial: 'a', states: { a: { transitions: [{ on: 'signal:go', to: 'gone' }] } } }, 'a')
    expect(screen.getByRole('option', { name: 'gone ⚠' })).toBeDefined()
  })
})

describe('StateEditorModal (characterization): renaming', () => {
  it('renames a state, retargeting every edge and the initial state', async () => {
    const user = userEvent.setup()
    const spies = renderStateModal(PLAYER_MACHINE, 'idle')

    const name = screen.getByRole('textbox', { name: 'name' })
    await user.clear(name)
    await user.type(name, 'rest')
    await user.selectOptions(screen.getByRole('combobox', { name: 'animation' }), 'run')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(spies.onSave).toHaveBeenCalledWith({
      states: {
        rest: { clip: 'run', transitions: [{ on: 'input:jump', to: 'jump' }] },
        jump: { transitions: [{ on: 'signal:land', to: 'rest' }] },
        lonely: { transitions: [] },
      },
      initial: 'rest',
    })
  })

  it('blocks a rename onto a taken or reserved name', async () => {
    const user = userEvent.setup()
    const spies = renderStateModal(PLAYER_MACHINE, 'idle')
    const name = screen.getByRole('textbox', { name: 'name' })

    await user.clear(name)
    await user.type(name, 'jump')
    expect(screen.getByText('a state named “jump” already exists')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true)

    await user.clear(name)
    await user.type(name, 'default')
    expect(screen.getByText('“default” is reserved for the role\'s own hooks')).toBeDefined()
    expect(spies.onSave).not.toHaveBeenCalled()
  })
})

describe('StateEditorModal (characterization): transitions', () => {
  it('edits transitions with a picker per trigger kind', async () => {
    const user = userEvent.setup()
    const spies = renderStateModal(PLAYER_MACHINE, 'lonely')

    await user.click(screen.getByRole('button', { name: '+ transition' }))
    const kind = screen.getByDisplayValue('signal')
    expect(screen.getByPlaceholderText('signal name…')).toBeDefined()
    expect(document.getElementById('ed-sm-signals')?.querySelectorAll('option')).toHaveLength(5)

    await user.selectOptions(kind, 'timer')
    await user.type(screen.getByPlaceholderText('seconds…'), '2')
    await user.click(screen.getByRole('button', { name: '+ transition' }))
    await user.selectOptions(defined(screen.getAllByDisplayValue('signal')[0]), 'input')
    await user.selectOptions(screen.getByDisplayValue('action…'), 'left')
    await user.selectOptions(defined(screen.getAllByDisplayValue('idle')[1]), 'jump')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(spies.onSave).toHaveBeenLastCalledWith({
      states: {
        ...PLAYER_MACHINE.states,
        lonely: { transitions: [{ on: 'timer:2', to: 'idle' }, { on: 'input:left', to: 'jump' }] },
      },
      initial: 'idle',
    })
  })

  it('removes a transition', async () => {
    const user = userEvent.setup()
    const spies = renderStateModal(PLAYER_MACHINE, 'jump')

    await user.click(screen.getByRole('button', { description: 'Remove this transition' }))
    expect(screen.getByText('no transitions — this state never leaves by itself')).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(spies.onSave).toHaveBeenLastCalledWith(
      match.objectContaining({ states: match.objectContaining({ jump: { transitions: [] } }) }),
    )
  })
})

describe('StateEditorModal (characterization): code and closing', () => {
  it('reports a code file, or offers to create one under the current name', async () => {
    const user = userEvent.setup()
    const machine = { role: 'npc', initial: 'wave', states: { wave: { transitions: [] } } }
    renderStateModal(machine, 'wave', { stateFiles: ['wave.ts'] })
    expect(screen.getByText(/✓ Code file: src\/states\/wave\.ts/)).toBeDefined()

    cleanup()
    const spies = renderStateModal(machine, 'wave')
    const name = screen.getByRole('textbox', { name: 'name' })
    await user.clear(name)
    await user.type(name, 'greet')
    await user.click(screen.getByRole('button', { name: '✚ Create code file — src/states/greet.ts' }))
    expect(spies.onCreateFile).toHaveBeenCalledWith('greet')
  })

  it('cancels from the close button, the Cancel button and Escape', async () => {
    const user = userEvent.setup()
    const spies = renderStateModal(PLAYER_MACHINE, 'idle')

    // The first ✕ closes the modal; the others remove transitions.
    await user.click(defined(screen.getAllByRole('button', { name: '✕' })[0]))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.keyboard('{Escape}')
    expect(spies.onCancel).toHaveBeenCalledTimes(3)
    expect(spies.onSave).not.toHaveBeenCalled()
  })
})
