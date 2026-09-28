// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { ArchetypeContext, resolveArchetype } from '../project/archetype'
import type { ProjectControls } from '../project/controls'
import type { GameSettings } from '../project/game'
import type { ProjectStats } from '../project/stats'
import { ControlsEditor, GameSettingsEditor, ProjectPane, StatsEditor } from './ProjectPane'
import { defined } from '../../../engine/src/test-support'

/**
 * Characterization of the project-wide editors before they are split by
 * responsibility: what each renders and the whole value each change commits.
 */

afterEach(cleanup)

function renderUi(ui: ReactElement): void {
  render(
    <ArchetypeContext.Provider value={resolveArchetype('platformer')}>{ui}</ArchetypeContext.Provider>,
    { reactStrictMode: true },
  )
}

it('hosts a project editor above its save path', () => {
  renderUi(
    <ProjectPane savePath="src/controls.json">
      <p>body</p>
    </ProjectPane>,
  )

  expect(screen.getByText('body')).toBeDefined()
  expect(screen.getByText('saved to src/controls.json')).toBeDefined()
})

const CONTROLS: ProjectControls = {
  bindings: { jump: ['Space'], dash: ['KeyK'], idle: [] },
  labels: { dash: 'Dash!' },
}

function renderControls() {
  const onChange = vi.fn<(next: ProjectControls) => void>()
  renderUi(<ControlsEditor controls={CONTROLS} onChange={onChange} />)
  return onChange
}

it('lists each action with its keys and label', () => {
  renderControls()

  expect(screen.getByText('Jump')).toBeDefined()
  expect(screen.getByText('Dash!')).toBeDefined()
  expect(screen.getByText('idle')).toBeDefined()
  expect(screen.getByRole('button', { name: 'Space ×' })).toBeDefined()
  expect(screen.getByRole('button', { name: 'K ×' })).toBeDefined()
  expect(screen.getByText("no keys — this action can't fire")).toBeDefined()
  expect(screen.getAllByTitle('Remove this action')).toHaveLength(2)
})

it('removes a key, and an action together with its label', async () => {
  const user = userEvent.setup()
  const onChange = renderControls()

  await user.click(screen.getByRole('button', { name: 'K ×' }))
  expect(onChange).toHaveBeenLastCalledWith({
    bindings: { jump: ['Space'], dash: [], idle: [] },
    labels: { dash: 'Dash!' },
  })

  await user.click(defined(screen.getAllByTitle('Remove this action')[0]))
  expect(onChange).toHaveBeenLastCalledWith({ bindings: { jump: ['Space'], idle: [] }, labels: {} })
})

it('captures the next key press for an action and ignores Escape', async () => {
  const user = userEvent.setup()
  const onChange = renderControls()
  const listening = { name: 'press a key… (Esc cancels)' }

  await user.click(defined(screen.getAllByRole('button', { name: '+ key' })[0]))
  expect(screen.getByRole('button', listening)).toBeDefined()
  fireEvent.keyDown(window, { code: 'KeyJ' })
  expect(onChange).toHaveBeenLastCalledWith({
    bindings: { jump: ['Space', 'KeyJ'], dash: ['KeyK'], idle: [] },
    labels: { dash: 'Dash!' },
  })
  expect(screen.queryByRole('button', listening)).toBeNull()

  await user.click(defined(screen.getAllByRole('button', { name: '+ key' })[0]))
  fireEvent.keyDown(window, { code: 'Escape' })
  expect(onChange).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('button', listening)).toBeNull()
})

it('adds a new action and starts listening for its key', async () => {
  const user = userEvent.setup()
  const onChange = renderControls()

  const name = screen.getByPlaceholderText('new action name…')
  await user.type(name, 'jump')
  expect(screen.getByText('an action named “jump” already exists')).toBeDefined()
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'add' }).disabled).toBe(true)

  await user.clear(name)
  await user.type(name, 'fireBall{Enter}')
  expect(onChange).toHaveBeenLastCalledWith({
    bindings: { jump: ['Space'], dash: ['KeyK'], idle: [], fireBall: [] },
    labels: { dash: 'Dash!', fireBall: 'Fire ball' },
  })
  expect(screen.getByPlaceholderText<HTMLInputElement>('new action name…').value).toBe('')
})

it('resets the controls to the archetype defaults', async () => {
  const user = userEvent.setup()
  const onChange = renderControls()

  await user.click(screen.getByRole('button', { name: '↺ Reset to defaults' }))
  expect(onChange).toHaveBeenLastCalledWith({
    bindings: {
      left: ['ArrowLeft', 'KeyA'],
      right: ['ArrowRight', 'KeyD'],
      jump: ['Space', 'ArrowUp', 'KeyW'],
    },
    labels: {},
  })
})

const STATS: ProjectStats = { points: 3, alive: true, title: 'hi' }

function renderStats(stats: ProjectStats = STATS) {
  const onChange = vi.fn<(next: ProjectStats) => void>()
  renderUi(<StatsEditor stats={stats} onChange={onChange} />)
  return onChange
}

it('edits each stat with a control for its type and removes it', async () => {
  const user = userEvent.setup()
  const onChange = renderStats()

  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '9' } })
  expect(onChange).toHaveBeenLastCalledWith({ points: 9, alive: true, title: 'hi' })
  await user.click(screen.getByRole('checkbox'))
  expect(onChange).toHaveBeenLastCalledWith({ points: 3, alive: false, title: 'hi' })
  fireEvent.change(screen.getByDisplayValue('hi'), { target: { value: 'yo' } })
  expect(onChange).toHaveBeenLastCalledWith({ points: 3, alive: true, title: 'yo' })

  await user.click(defined(screen.getAllByTitle('Remove this stat')[0]))
  expect(onChange).toHaveBeenLastCalledWith({ alive: true, title: 'hi' })
})

it('adds a stat of the chosen kind and refuses a taken name', async () => {
  const user = userEvent.setup()
  const onChange = renderStats()

  const name = screen.getByPlaceholderText('new stat name…')
  await user.type(name, 'points')
  expect(screen.getByText('a stat named “points” already exists')).toBeDefined()

  await user.clear(name)
  await user.type(name, 'lives')
  await user.selectOptions(screen.getByDisplayValue('number'), 'on/off')
  await user.click(screen.getByRole('button', { name: 'add' }))
  expect(onChange).toHaveBeenLastCalledWith({ ...STATS, lives: false })
  expect(screen.getByPlaceholderText<HTMLInputElement>('new stat name…').value).toBe('')

  await user.type(screen.getByPlaceholderText('new stat name…'), 'name{Enter}')
  expect(onChange).toHaveBeenLastCalledWith({ ...STATS, name: false })
})

it('invites a first stat when there are none', () => {
  renderStats({})

  expect(screen.getByText('no stats yet — try points or lives')).toBeDefined()
})

const SETTINGS: GameSettings = {
  archetype: 'platformer',
  resolution: { mode: 'fixed', width: 320, height: 180 },
  pixelsPerUnit: 16,
}

function renderSettings(settings: GameSettings = SETTINGS) {
  const onChange = vi.fn<(next: GameSettings) => void>()
  renderUi(<GameSettingsEditor settings={settings} onChange={onChange} />)
  return onChange
}

it('edits a fixed resolution, clamped to at least one pixel', () => {
  const onChange = renderSettings()

  expect(screen.getByText(/always shows a 320×180 view/)).toBeDefined()
  fireEvent.change(screen.getByRole('spinbutton', { name: 'width' }), { target: { value: '0' } })
  expect(onChange).toHaveBeenLastCalledWith({
    ...SETTINGS,
    resolution: { mode: 'fixed', width: 1, height: 180 },
  })
  fireEvent.change(screen.getByRole('spinbutton', { name: 'height' }), { target: { value: '240' } })
  expect(onChange).toHaveBeenLastCalledWith({
    ...SETTINGS,
    resolution: { mode: 'fixed', width: 320, height: 240 },
  })
})

it('edits the art scale and switches to fill mode', async () => {
  const user = userEvent.setup()
  const onChange = renderSettings()

  fireEvent.change(screen.getByRole('spinbutton', { name: 'pixels per unit' }), {
    target: { value: '32' },
  })
  expect(onChange).toHaveBeenLastCalledWith({ ...SETTINGS, pixelsPerUnit: 32 })
  await user.selectOptions(screen.getByRole('combobox', { name: 'mode' }), 'fill')
  expect(onChange).toHaveBeenLastCalledWith({
    ...SETTINGS,
    resolution: { mode: 'fill', width: 320, height: 180 },
  })
})

it('hides the size rows in fill mode', () => {
  renderSettings({ ...SETTINGS, resolution: { mode: 'fill', width: 640, height: 360 } })

  expect(screen.queryByRole('spinbutton', { name: 'width' })).toBeNull()
  expect(screen.getByText('the view stretches to whatever window the game runs in')).toBeDefined()
})
