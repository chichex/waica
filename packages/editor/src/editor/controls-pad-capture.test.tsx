// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ArchetypeContext, resolveArchetype } from '../project/archetype'
import type { ProjectControls } from '../project/controls'
import { ControlsEditor } from './ProjectPane'
import type { GamepadLike } from '../../../engine/src/gamepad'
import { defined } from '../../../engine/src/test-support'

/**
 * Issue #75 CA-16: while the controls panel captures for an action it reads
 * the pad each animation frame; the first button or stick half to rise to
 * 0.5 from below is appended and the capture ends.
 */

interface FakePad extends GamepadLike {
  axes: number[]
  buttons: { value: number }[]
}

const pad: FakePad = {
  index: 0,
  id: 'pad-0',
  mapping: 'standard',
  connected: true,
  axes: [0, 0, 0, 0],
  buttons: [],
}
const getGamepads = vi.fn(() => [pad])
const frames = new Map<number, FrameRequestCallback>()
let nextFrame = 1

/** Runs every animation frame requested so far, like one browser frame. */
function animationFrame(): void {
  const pending = [...frames.values()]
  frames.clear()
  act(() => {
    for (const callback of pending) callback(0)
  })
}

const LISTENING = { name: 'press a key or pad control… (Esc cancels)' }

function renderControls(controls: ProjectControls) {
  const onChange = vi.fn<(next: ProjectControls) => void>()
  const view = render(
    <ArchetypeContext.Provider value={resolveArchetype('platformer')}>
      <ControlsEditor controls={controls} onChange={onChange} />
    </ArchetypeContext.Provider>,
    { reactStrictMode: true },
  )
  return { onChange, view }
}

async function startCapture(): Promise<void> {
  await userEvent.setup().click(defined(screen.getAllByRole('button', { name: '+ key or pad' })[0]))
  expect(screen.getByRole('button', LISTENING)).toBeDefined()
}

beforeEach(() => {
  pad.axes = [0, 0, 0, 0]
  pad.buttons = Array.from({ length: 17 }, () => ({ value: 0 }))
  getGamepads.mockReset()
  getGamepads.mockImplementation(() => [pad])
  frames.clear()
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: getGamepads })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextFrame++
    frames.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id)
  })
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(navigator, 'getGamepads')
  vi.unstubAllGlobals()
})

it('appends the first pad button pressed during the capture and ends it', async () => {
  const { onChange } = renderControls({ bindings: { jump: ['Space'] }, labels: {} })
  await startCapture()

  animationFrame()
  pad.buttons[1] = { value: 1 }
  animationFrame()

  expect(onChange).toHaveBeenLastCalledWith({ bindings: { jump: ['Space', 'Gamepad:B'] }, labels: {} })
  expect(screen.queryByRole('button', LISTENING)).toBeNull()
})

it('captures a stick half that rises past the threshold', async () => {
  const { onChange } = renderControls({ bindings: { jump: ['Space'] }, labels: {} })
  await startCapture()

  animationFrame()
  pad.axes[0] = -0.4 // dead-zoned to 0.25: not yet
  animationFrame()
  expect(onChange).not.toHaveBeenCalled()
  pad.axes[0] = -1
  animationFrame()

  expect(onChange).toHaveBeenLastCalledWith({
    bindings: { jump: ['Space', 'Gamepad:LeftStickLeft'] },
    labels: {},
  })
})

it('ignores a control already held when the capture began until it is pressed again', async () => {
  pad.buttons[0] = { value: 1 }
  const { onChange } = renderControls({ bindings: { jump: ['Space'] }, labels: {} })
  await startCapture()

  animationFrame()
  animationFrame()
  expect(onChange).not.toHaveBeenCalled()
  expect(screen.getByRole('button', LISTENING)).toBeDefined()

  pad.buttons[0] = { value: 0 }
  animationFrame()
  pad.buttons[0] = { value: 1 }
  animationFrame()
  expect(onChange).toHaveBeenLastCalledWith({ bindings: { jump: ['Space', 'Gamepad:A'] }, labels: {} })
})

it('captures the first press of a pad that was not present when the capture began', async () => {
  getGamepads.mockImplementation(() => [])
  const { onChange } = renderControls({ bindings: { jump: ['Space'] }, labels: {} })
  await startCapture()

  animationFrame()
  pad.buttons[1] = { value: 1 }
  getGamepads.mockImplementation(() => [pad])
  animationFrame()

  expect(onChange).toHaveBeenLastCalledWith({ bindings: { jump: ['Space', 'Gamepad:B'] }, labels: {} })
  expect(screen.queryByRole('button', LISTENING)).toBeNull()
})

it('never duplicates a pad code the action already has, but still ends the capture', async () => {
  const { onChange } = renderControls({ bindings: { jump: ['Gamepad:A'] }, labels: {} })
  await startCapture()

  animationFrame()
  pad.buttons[0] = { value: 1 }
  animationFrame()

  expect(onChange).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', LISTENING)).toBeNull()
})

it('keeps key capture and Escape as before, and stops reading the pad when the capture ends', async () => {
  const { onChange } = renderControls({ bindings: { jump: ['Space'] }, labels: {} })
  await startCapture()
  fireEvent.keyDown(window, { code: 'KeyJ' })
  expect(onChange).toHaveBeenLastCalledWith({ bindings: { jump: ['Space', 'KeyJ'] }, labels: {} })

  await startCapture()
  fireEvent.keyDown(window, { code: 'Escape' })
  expect(onChange).toHaveBeenCalledTimes(1)

  getGamepads.mockClear()
  animationFrame()
  expect(frames.size).toBe(0)
  expect(getGamepads).not.toHaveBeenCalled()
})

it('reads nothing before a capture starts and stops reading on unmount', async () => {
  const { view } = renderControls({ bindings: { jump: ['Space'] }, labels: {} })
  expect(frames.size).toBe(0)

  await startCapture()
  animationFrame()
  expect(getGamepads).toHaveBeenCalled()
  expect(frames.size).toBe(1)

  view.unmount()
  expect(frames.size).toBe(0)
})
