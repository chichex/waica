import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DesktopShellConfig } from '../desktop-config.js'
import { fullscreenShortcut, windowOptions, type ShortcutInput } from './window-options.js'

const CONFIG: DesktopShellConfig = {
  name: 'Hero Quest',
  desktop: { fullscreen: false, scale: 2 },
  resolution: { width: 640, height: 360 },
  steam: null,
}
const APP = path.join('/opt', 'hero', 'resources', 'app')

function key(overrides: Partial<ShortcutInput>): ShortcutInput {
  return { type: 'keyDown', key: 'a', alt: false, control: false, shift: false, meta: false, isAutoRepeat: false, ...overrides }
}

describe('the window (issue #200 CA-10)', () => {
  it('opens at resolution × scale, resizable, isolated, with the preload and the icon', () => {
    expect(windowOptions(CONFIG, APP)).toEqual({
      width: 1280,
      height: 720,
      useContentSize: true,
      fullscreen: false,
      // On macOS, Electron turns `fullscreen: false` into a window that can never go fullscreen unless this says otherwise.
      fullscreenable: true,
      resizable: true,
      title: 'Hero Quest',
      icon: path.join(APP, 'icon.png'),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: path.join(APP, 'preload.js'),
      },
    })
  })

  it('takes fullscreen and the scale from the desktop block', () => {
    const options = windowOptions({ ...CONFIG, desktop: { fullscreen: true, scale: 1.5 } }, APP)
    expect(options).toMatchObject({ width: 960, height: 540, fullscreen: true })
  })

  it('opens at 1280×720 when game.json declares no resolution', () => {
    expect(windowOptions({ ...CONFIG, resolution: null }, APP)).toMatchObject({ width: 1280, height: 720 })
  })

  it('rounds a fractional size to whole pixels', () => {
    expect(windowOptions({ ...CONFIG, resolution: { width: 333, height: 201 }, desktop: { fullscreen: false, scale: 1.5 } }, APP)).toMatchObject({
      width: 500,
      height: 302,
    })
  })

})

describe("the window inside the screen's work area (review of #215)", () => {
  it('shrinks to 90% of the work area, keeping the aspect, when resolution × scale is larger', () => {
    const big = { ...CONFIG, resolution: { width: 1920, height: 1080 } }
    expect(windowOptions(big, APP, { width: 1366, height: 728 })).toMatchObject({ width: 1165, height: 655 })
  })

  it('keeps resolution × scale when it already fits', () => {
    expect(windowOptions(CONFIG, APP, { width: 1920, height: 1080 })).toMatchObject({ width: 1280, height: 720 })
  })
})

describe('the fullscreen shortcut (issue #200 CA-10)', () => {
  it.each([
    [key({ key: 'F11' }), true],
    [key({ key: 'Enter', alt: true }), true],
    [key({ key: 'Enter' }), false],
    [key({ key: 'F11', isAutoRepeat: true }), false],
    [key({ key: 'F11', type: 'keyUp' }), false],
    [key({ key: 'Enter', alt: true, control: true }), false],
    [key({ key: 'F10' }), false],
  ])('toggles fullscreen on F11 and Alt+Enter only: %j → %s', (input, toggles) => {
    expect(fullscreenShortcut(input)).toBe(toggles)
  })
})
