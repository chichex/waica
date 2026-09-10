// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SceneEntityJson } from '@waica/engine'
import { ArchetypeContext, resolveArchetype } from '../project/archetype'
import { Inspector } from './Inspector'
import type { ArtItem } from './use-project-art'

/**
 * Finding A of the r2-editor review: a sound row in the asset library carries
 * the same 'waica/art' drag payload as an image row, and the Appearance
 * texture drop target (AppearanceSection in Inspector.tsx) accepted whatever
 * uri arrived on that payload without checking ArtItem.kind. Dropping
 * `waica-iso-town-theme.ogg` onto a sprite set a broken texture.
 */

const IMAGE: ArtItem = {
  label: 'hero.png',
  url: 'blob:hero',
  uri: 'src/art/hero.png',
  path: 'src/art/hero.png',
  kind: 'image',
}

const SOUND: ArtItem = {
  label: 'swing.ogg',
  url: 'blob:swing',
  uri: 'src/art/swing.ogg',
  path: 'src/art/swing.ogg',
  kind: 'sound',
}

function entity(texture: string): SceneEntityJson {
  return {
    name: 'Hero',
    components: [{ type: 'Sprite', props: { texture } }],
  }
}

function baseProps(
  overrides: Partial<ComponentProps<typeof Inspector>> = {},
): ComponentProps<typeof Inspector> {
  return {
    selection: null,
    prefabs: {},
    stats: {},
    actions: {},
    art: [IMAGE, SOUND],
    urlFor: (uri) => uri,
    onImportArt: vi.fn(async () => {}),
    viewportVisibility: { appearance: true, collision: true },
    onViewportVisibility: vi.fn(),
    onRename: vi.fn(),
    onMove: vi.fn(),
    onProp: vi.fn(),
    onMultiProp: vi.fn(),
    onResetProp: vi.fn(),
    onApplyProp: vi.fn(),
    onResetAllProps: vi.fn(),
    onApplyAllProps: vi.fn(),
    onAddComponent: vi.fn(),
    onRemoveComponent: vi.fn(),
    onSetEntityCollision: vi.fn(),
    onSetTexture: vi.fn(),
    onDelete: vi.fn(),
    onOpenPrefab: vi.fn(),
    onPrefabProp: vi.fn(),
    onPrefabAddComponent: vi.fn(),
    onPrefabRemoveComponent: vi.fn(),
    onPrefabToggleAnimated: vi.fn(),
    onPrefabSetTexture: vi.fn(),
    onPrefabSetShape: vi.fn(),
    onPrefabSetCollision: vi.fn(),
    onEditAnimation: vi.fn(),
    onCameraProp: vi.fn(),
    onRenderProp: vi.fn(),
    pixelsPerUnit: 16,
    resolution: { mode: 'fixed', width: 640, height: 360 },
    sceneCamera: undefined,
    onSizeAppearance: vi.fn(),
    onPrefabSizeAppearance: vi.fn(),
    stateFiles: [],
    roleFiles: [],
    onMachinePatch: vi.fn(),
    onPrefabMachinePatch: vi.fn(),
    onCreateRoleFile: vi.fn(),
    onEditState: vi.fn(),
    ...overrides,
  }
}

/** Drop payload shaped like the one Explorer.tsx's art rows set on dragstart. */
function artDropEvent(uri: string): { types: string[]; getData(type: string): string } {
  return {
    types: ['waica/art'],
    getData: (type: string) => (type === 'waica/art' ? uri : ''),
  }
}

describe('Appearance texture drop target rejects non-image art (review finding A)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    document.body.innerHTML = ''
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
  })

  function render(props: ComponentProps<typeof Inspector>): void {
    const archetype = resolveArchetype('platformer')
    act(() => {
      root.render(
        createElement(
          ArchetypeContext.Provider,
          { value: archetype },
          createElement(Inspector, props),
        ),
      )
    })
  }

  function dropTarget(): Element {
    const target = container.querySelector('.ed-appear-preview')
    if (!target) throw new Error('missing .ed-appear-preview drop target')
    return target
  }

  it('does not set the texture when a sound uri is dropped on it', () => {
    const onSetTexture = vi.fn()
    render(
      baseProps({
        selection: { kind: 'entity', sceneName: 'main', entity: entity(IMAGE.uri) },
        onSetTexture,
      }),
    )

    const dataTransfer = artDropEvent(SOUND.uri)
    act(() => {
      const event = Object.assign(new Event('drop', { bubbles: true, cancelable: true }), {
        dataTransfer,
      })
      dropTarget().dispatchEvent(event)
    })

    expect(onSetTexture).not.toHaveBeenCalled()
  })

  it('still sets the texture when an image uri is dropped on it (no regression)', () => {
    const onSetTexture = vi.fn()
    render(
      baseProps({
        selection: { kind: 'entity', sceneName: 'main', entity: entity('src/art/other.png') },
        onSetTexture,
      }),
    )

    const dataTransfer = artDropEvent(IMAGE.uri)
    act(() => {
      const event = Object.assign(new Event('drop', { bubbles: true, cancelable: true }), {
        dataTransfer,
      })
      dropTarget().dispatchEvent(event)
    })

    expect(onSetTexture).toHaveBeenCalledExactlyOnceWith('Hero', 'Sprite', IMAGE.uri)
  })
})
