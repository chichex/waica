// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Viewport.tsx pulls THREE through @waica/engine's re-export, so the mock
// targets the engine's own copy of three — the one thing happy-dom cannot
// host — exactly like examples/isometric/src/demo-combat.test.ts.
const rendererHooks = vi.hoisted(() => ({
  loop: null as ((time: number) => void) | null,
}))

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
      setAnimationLoop(loop: ((time: number) => void) | null): void {
        rendererHooks.loop = loop
      }
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
const PATH_A = 'src/scenes/a.scene.json'
const PATH_B = 'src/scenes/b.scene.json'
const SCENE_A: SceneJson = { waicaScene: 3, entities: [{ name: 'A' }] }
const SCENE_B: SceneJson = { waicaScene: 3, entities: [{ name: 'B' }] }

interface HandleBox {
  current: ViewportHandle | null
}

interface RenderOptions {
  scenePath?: string
  sceneCatalog?: Record<string, SceneJson>
  epoch?: number
  mode?: 'edit' | 'play'
  selected?: string | null
  onSelect?(name: string | null): void
}

function render(root: Root, box: HandleBox, scene: SceneJson, options: RenderOptions = {}): void {
  const {
    scenePath = PATH_A,
    sceneCatalog,
    epoch = 1,
    mode = 'edit',
    selected = null,
    onSelect = () => {},
  } = options
  act(() => {
    root.render(
      <Viewport
        ref={(instance) => {
          box.current = instance
        }}
        scene={scene}
        scenePath={scenePath}
        sceneCatalog={sceneCatalog}
        registry={REGISTRY}
        epoch={epoch}
        mode={mode}
        selected={selected}
        onSelect={onSelect}
        onMoved={() => {}}
      />,
    )
  })
}

describe('Viewport scene swap (CA-19)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    document.body.innerHTML = ''
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    rendererHooks.loop = null
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  })

  afterEach(() => {
    act(() => root.unmount())
    vi.unstubAllGlobals()
  })

  it('loads the incoming scene over the same Game, the outgoing entities gone', () => {
    const box: HandleBox = { current: null }
    render(root, box, SCENE_A)
    const game = box.current!.game()!
    expect(game.find('A')).toBeDefined()
    expect(game.find('B')).toBeUndefined()

    render(root, box, SCENE_B, { scenePath: PATH_B })

    const sameGame = box.current!.game()
    expect(sameGame).toBe(game)
    expect(sameGame!.find('A')).toBeUndefined()
    expect(sameGame!.find('B')).toBeDefined()
  })

  it('clears the selection on a scene swap', () => {
    const box: HandleBox = { current: null }
    const onSelect = vi.fn()
    render(root, box, SCENE_A, { selected: 'A', onSelect })

    render(root, box, SCENE_B, { scenePath: PATH_B, selected: 'A', onSelect })

    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('leaves the live entities alone when an edit rewrites the scene of the SAME file', () => {
    const box: HandleBox = { current: null }
    const onSelect = vi.fn()
    render(root, box, SCENE_A, { selected: 'A', onSelect })
    const game = box.current!.game()!
    const entity = game.find('A')

    // What every edit looks like: ops.* are pure, so a drag or a prop tweak
    // commits a brand-new SceneJson for the very same file. Reloading here
    // would destroy and respawn the entity mid-drag and drop the selection.
    const edited: SceneJson = { waicaScene: 3, entities: [{ name: 'A', position: [5, 0] }] }
    render(root, box, edited, { selected: 'A', onSelect })

    expect(box.current!.game()).toBe(game)
    expect(game.find('A')).toBe(entity)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('registers the scene catalog so Play can resolve a SceneTransition', () => {
    const box: HandleBox = { current: null }
    render(root, box, SCENE_A, { sceneCatalog: { a: SCENE_A, b: SCENE_B } })

    const game = box.current!.game()!
    expect(game.availableScenes).toEqual(['a', 'b'])
    expect(game.loadSceneByName('b')).toBe(true)
    expect(game.find('B')).toBeDefined()
  })

  it('preserves the editor pan across a scene swap', () => {
    const box: HandleBox = { current: null }
    render(root, box, SCENE_A)
    const game = box.current!.game()!
    // Pan the live camera and let the per-frame loop (game.onUpdate) sync it
    // into the editor's own cam ref, exactly as a real drag would.
    game.camera.position.x = 42
    game.camera.position.y = -7
    act(() => rendererHooks.loop?.(16))

    render(root, box, SCENE_B, { scenePath: PATH_B })

    // loadScene's own camera framing is overridden back to the panned position.
    expect(game.camera.position.x).toBe(42)
    expect(game.camera.position.y).toBe(-7)
  })

  it('does not reload the scene, and does not clear selection, on an unrelated re-render', () => {
    const box: HandleBox = { current: null }
    const onSelect = vi.fn()
    render(root, box, SCENE_A, { selected: 'A', onSelect })
    const game = box.current!.game()!

    // Same scene reference, same epoch/mode: a re-render carrying unrelated
    // prop churn must not touch the live entities or fire onSelect.
    render(root, box, SCENE_A, { selected: 'A', onSelect })

    expect(box.current!.game()).toBe(game)
    expect(game.find('A')).toBeDefined()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('recreates the Game when epoch changes, even with the same scene reference', () => {
    const box: HandleBox = { current: null }
    render(root, box, SCENE_A)
    const game = box.current!.game()

    render(root, box, SCENE_A, { epoch: 2 })

    expect(box.current!.game()).not.toBe(game)
  })

  it('recreates the Game on a mode change', () => {
    const box: HandleBox = { current: null }
    render(root, box, SCENE_A, { mode: 'edit' })
    const game = box.current!.game()

    render(root, box, SCENE_A, { mode: 'play' })

    expect(box.current!.game()).not.toBe(game)
  })
})
