// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>()
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
})

import { Tilemap } from './components/tilemap'
import { Game } from './game'
import {
  loadScene,
  resolveEntityComponents,
  resolveProps,
  type PrefabJson,
  type SceneEntityJson,
  type SceneJson,
} from './scene'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

function makeGame(): Game {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  document.body.append(canvas)
  return new Game({ canvas })
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const SLIME: PrefabJson = {
  waicaPrefab: 1,
  type: 'character',
  components: [
    { type: 'Sprite', props: { src: 'waica:slime', width: 16 } },
    { type: 'Hitbox', props: { w: 14, h: 10 } },
  ],
}

const PREFABS = { 'characters/slime': SLIME }

describe('resolveEntityComponents', () => {
  it('passes inline components through when there is no prefab ref', () => {
    const entity: SceneEntityJson = {
      name: 'coin',
      components: [{ type: 'Sprite', props: { src: 'coin.png' } }],
    }
    expect(resolveEntityComponents(entity, PREFABS)).toEqual([
      { type: 'Sprite', props: { src: 'coin.png' } },
    ])
  })

  it('resolves to an empty list without prefab or components', () => {
    expect(resolveEntityComponents({ name: 'empty' })).toEqual([])
  })

  it('expands the prefab components', () => {
    const entity: SceneEntityJson = { name: 'slime-1', prefab: 'characters/slime' }
    expect(resolveEntityComponents(entity, PREFABS)).toEqual([
      { type: 'Sprite', props: { src: 'waica:slime', width: 16 } },
      { type: 'Hitbox', props: { w: 14, h: 10 } },
    ])
  })

  it('shallow-merges overrides on top of the prefab props', () => {
    const entity: SceneEntityJson = {
      name: 'slime-1',
      prefab: 'characters/slime',
      overrides: { Sprite: { width: 32 } },
    }
    const [sprite, hitbox] = resolveEntityComponents(entity, PREFABS)
    expect(sprite).toEqual({ type: 'Sprite', props: { src: 'waica:slime', width: 32 } })
    expect(hitbox).toEqual({ type: 'Hitbox', props: { w: 14, h: 10 } })
  })

  it('ignores overrides for a component type the prefab lacks', () => {
    const entity: SceneEntityJson = {
      name: 'slime-1',
      prefab: 'characters/slime',
      overrides: { Patrol: { speed: 40 } },
    }
    const result = resolveEntityComponents(entity, PREFABS)
    expect(result.map((c) => c.type)).toEqual(['Sprite', 'Hitbox'])
  })

  it('appends inline components after the prefab ones', () => {
    const entity: SceneEntityJson = {
      name: 'slime-1',
      prefab: 'characters/slime',
      components: [{ type: 'Patrol', props: { speed: 40 } }],
    }
    const result = resolveEntityComponents(entity, PREFABS)
    expect(result.map((c) => c.type)).toEqual(['Sprite', 'Hitbox', 'Patrol'])
    expect(result[2]).toEqual({ type: 'Patrol', props: { speed: 40 } })
  })

  it('warns and falls back to inline components on an unknown prefab', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const entity: SceneEntityJson = {
      name: 'ghost',
      prefab: 'characters/ghost',
      components: [{ type: 'Sprite', props: { src: 'ghost.png' } }],
    }
    expect(resolveEntityComponents(entity, PREFABS)).toEqual([
      { type: 'Sprite', props: { src: 'ghost.png' } },
    ])
    expect(warn).toHaveBeenCalledWith('[waica] unknown prefab in scene: "characters/ghost" (ghost)')
    warn.mockRestore()
  })

  it('warns too when no prefab map is given at all', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveEntityComponents({ name: 'ghost', prefab: 'characters/ghost' })).toEqual([])
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('never mutates its inputs and returns fresh component objects', () => {
    const prefab: PrefabJson = {
      waicaPrefab: 1,
      type: 'object',
      components: [{ type: 'Sprite', props: { width: 16 } }],
    }
    const entity: SceneEntityJson = {
      name: 'box',
      prefab: 'objects/box',
      overrides: { Sprite: { width: 32 } },
    }
    const [sprite] = resolveEntityComponents(entity, { 'objects/box': prefab })
    expect(sprite).not.toBe(prefab.components[0])
    sprite!.props!.width = 99
    expect(prefab.components[0]!.props).toEqual({ width: 16 })
    expect(entity.overrides).toEqual({ Sprite: { width: 32 } })
  })
})

describe('resolveProps', () => {
  const registry = {
    components: {},
    resolveAsset: (uri: string) =>
      ({ 'waica:dog': '/assets/dog.png', 'src/art/hero.png': 'blob:hero' })[uri] ?? uri,
  }

  it('resolves every string prop the registry resolver knows', () => {
    const props = { texture: 'src/art/hero.png', fallback: 'waica:dog', width: 16 }
    expect(resolveProps(props, registry)).toEqual({
      texture: 'blob:hero',
      fallback: '/assets/dog.png',
      width: 16,
    })
  })

  it('leaves unknown strings and non-strings unchanged', () => {
    const props = { initialClip: 'idle', pixelArt: true }
    expect(resolveProps(props, registry)).toEqual(props)
  })

  it('passes everything through without a resolver', () => {
    const props = { texture: 'waica:dog' }
    expect(resolveProps(props, { components: {} })).toEqual(props)
  })

  it('resolves strings nested in arrays and plain objects', () => {
    const props = {
      texture: 'src/art/hero.png',
      extraSheets: [{ texture: 'waica:dog', cols: 2, rows: 1 }],
      clips: { idle: { frames: [0, 1], fps: 5 } },
    }
    expect(resolveProps(props, registry)).toEqual({
      texture: 'blob:hero',
      extraSheets: [{ texture: '/assets/dog.png', cols: 2, rows: 1 }],
      clips: { idle: { frames: [0, 1], fps: 5 } },
    })
    // Inputs are never mutated by the deep walk.
    expect(props.extraSheets[0]!.texture).toBe('waica:dog')
  })
})

describe('loadScene replacing an already-loaded scene (CA-3)', () => {
  it('leaves exactly one Player and one Tilemap, dropping the outgoing scene', () => {
    const game = makeGame()
    const outgoing: SceneJson = {
      waicaScene: 3,
      entities: [
        { name: 'Player', components: [{ type: 'Tilemap' }] },
        { name: 'Rock' },
      ],
    }
    const incoming: SceneJson = {
      waicaScene: 3,
      entities: [
        { name: 'Player', components: [{ type: 'Tilemap' }] },
        { name: 'Torch' },
      ],
    }
    loadScene(game, outgoing, { components: { Tilemap } })

    loadScene(game, incoming, { components: { Tilemap } })

    expect(game.entities.filter((e) => e.name === 'Player')).toHaveLength(1)
    expect(game.entities.filter((e) => e.has(Tilemap))).toHaveLength(1)
    expect(game.find('Rock')).toBeUndefined()
    expect(game.find('Torch')).toBeDefined()
    game.dispose()
  })
})
