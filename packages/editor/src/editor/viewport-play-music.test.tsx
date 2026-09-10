// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Viewport.tsx pulls THREE through @waica/engine's re-export, so the mock
// targets the engine's own copy of three — the one thing happy-dom cannot
// host — exactly like viewport-scene-swap.test.tsx and
// examples/isometric/src/demo-combat.test.ts.
vi.mock(
  new URL(
    '../../../../packages/engine/node_modules/three/build/three.module.js',
    import.meta.url,
  ).pathname,
  async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>()
    class WebGLRenderer {
      readonly domElement: HTMLCanvasElement
      constructor({ canvas }: { canvas: HTMLCanvasElement }) {
        this.domElement = canvas
      }
      setPixelRatio(): void {}
      setSize(): void {}
      setViewport(): void {}
      setScissor(): void {}
      setScissorTest(): void {}
      setClearColor(): void {}
      clear(): void {}
      render(): void {}
      setAnimationLoop(): void {}
      dispose(): void {}
    }
    return { ...actual, WebGLRenderer }
  },
)

import type { SceneJson, SceneRegistry } from '@waica/engine'
import { Viewport, type ViewportHandle } from './Viewport'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

const REGISTRY: SceneRegistry = { components: {} }
const SCENE: SceneJson = { waicaScene: 3, entities: [{ name: 'A' }] }
const MUSIC = 'waica:iso-town-theme'

interface HandleBox {
  current: ViewportHandle | null
}

interface RenderOptions {
  epoch?: number
  mode?: 'edit' | 'play'
  music?: string
}

function render(root: Root, box: HandleBox, options: RenderOptions = {}): void {
  const { epoch = 1, mode = 'edit', music } = options
  act(() => {
    root.render(
      <Viewport
        ref={(instance) => {
          box.current = instance
        }}
        scene={SCENE}
        scenePath="src/scenes/a.scene.json"
        registry={REGISTRY}
        epoch={epoch}
        mode={mode}
        music={music}
        selected={null}
        onSelect={() => {}}
        onMoved={() => {}}
      />,
    )
  })
}

/**
 * Review finding 2: the editor's Play mode builds its own Game
 * (Viewport.tsx) instead of running the shipped template's main.ts, and
 * never did the `if (ARCHETYPE.music) game.audio.play(...)` step that file
 * does on boot — so the same project has music under `pnpm dev` and in an
 * MCP Run Session, but none when Play is pressed inside the editor, even
 * though the combat sounds (carried on prefab props) still play there.
 * See .sdd/specs/issue-67-engine-audio-subsystem.md CA-17/CA-18/CA-19.
 */
describe('Viewport Play-mode music (review finding 2)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    document.body.innerHTML = ''
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  })

  afterEach(() => {
    act(() => root.unmount())
    vi.unstubAllGlobals()
  })

  it('starts the archetype music bed, looping and session-scoped, only once Play is pressed', () => {
    const box: HandleBox = { current: null }
    render(root, box, { mode: 'edit', music: MUSIC })

    expect(box.current!.game()!.audio.liveSounds()).toEqual([])

    render(root, box, { mode: 'play', music: MUSIC })

    expect(box.current!.game()!.audio.liveSounds()).toEqual([
      { uri: MUSIC, channel: 'music', scope: 'session' },
    ])
  })

  it('never starts music while still in edit mode', () => {
    const box: HandleBox = { current: null }
    render(root, box, { mode: 'edit', music: MUSIC })

    expect(box.current!.game()!.audio.liveSounds()).toEqual([])
  })

  it('does not survive going back to edit: the rebuilt edit-mode Game has no music playing', () => {
    const box: HandleBox = { current: null }
    render(root, box, { mode: 'play', music: MUSIC })
    const playGame = box.current!.game()!
    expect(playGame.audio.liveSounds()).not.toEqual([])

    render(root, box, { mode: 'edit', music: MUSIC })

    // mode is part of the [epoch, mode] effect's own dependencies (ADR: a
    // mode change always rebuilds the Game), so this is a fresh instance —
    // the old one, and every live sound it held, was disposed (CA-10).
    expect(box.current!.game()).not.toBe(playGame)
    expect(box.current!.game()!.audio.liveSounds()).toEqual([])
  })

  it('starts nothing for an archetype with no music', () => {
    const box: HandleBox = { current: null }
    render(root, box, { mode: 'play' })

    expect(box.current!.game()!.audio.liveSounds()).toEqual([])
  })
})
