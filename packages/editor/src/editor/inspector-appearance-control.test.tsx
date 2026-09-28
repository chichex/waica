// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ArchetypeContext, resolveArchetype } from '../project/archetype'
import { Inspector } from './Inspector'
import type { ArtItem } from './use-project-art'

const HERO: ArtItem = {
  label: 'hero.png',
  url: 'blob:hero',
  uri: 'src/art/hero.png',
  path: 'src/art/hero.png',
  kind: 'image',
}

const noop = (): void => {}

/** Everything the Inspector needs besides the selection, as inert handlers. */
const INSPECTOR_PROPS: Omit<ComponentProps<typeof Inspector>, 'selection'> = {
  prefabs: {},
  stats: {},
  actions: {},
  art: [HERO],
  urlFor: (uri) => uri,
  onImportArt: () => Promise.resolve(),
  viewportVisibility: { appearance: true, collision: true },
  onViewportVisibility: noop,
  onRename: noop,
  onMove: noop,
  onProp: noop,
  onMultiProp: noop,
  onResetProp: noop,
  onApplyProp: noop,
  onResetAllProps: noop,
  onApplyAllProps: noop,
  onAddComponent: noop,
  onRemoveComponent: noop,
  onSetEntityCollision: noop,
  onSetTexture: noop,
  onDelete: noop,
  onOpenPrefab: noop,
  onPrefabProp: noop,
  onPrefabAddComponent: noop,
  onPrefabRemoveComponent: noop,
  onPrefabToggleAnimated: noop,
  onPrefabSetTexture: noop,
  onPrefabSetShape: noop,
  onPrefabSetCollision: noop,
  onEditAnimation: noop,
  onCameraProp: noop,
  onRenderProp: noop,
  pixelsPerUnit: 16,
  resolution: { mode: 'fixed', width: 640, height: 360 },
  sceneCamera: undefined,
  onSizeAppearance: noop,
  onPrefabSizeAppearance: noop,
  stateFiles: [],
  roleFiles: [],
  onMachinePatch: noop,
  onPrefabMachinePatch: noop,
  onCreateRoleFile: noop,
  onEditState: noop,
}

function renderInspector(): void {
  render(
    <ArchetypeContext.Provider value={resolveArchetype('platformer')}>
      <Inspector
        {...INSPECTOR_PROPS}
        selection={{
          kind: 'entity',
          sceneName: 'main',
          entity: { name: 'Hero', components: [{ type: 'Sprite', props: { texture: HERO.uri } }] },
        }}
      />
    </ArchetypeContext.Provider>,
    { reactStrictMode: true },
  )
}

afterEach(cleanup)

describe('Appearance image chip (CA-25)', () => {
  it('is a button that opens the art picker on click', async () => {
    const user = userEvent.setup()
    renderInspector()

    await user.click(screen.getByRole('button', { name: /hero\.png/ }))

    expect(screen.getByRole('button', { name: 'Keep current image' })).toBeDefined()
  })

  it('opens the art picker from the keyboard too', async () => {
    const user = userEvent.setup()
    renderInspector()

    screen.getByRole('button', { name: /hero\.png/ }).focus()
    await user.keyboard('{Enter}')

    expect(screen.getByRole('button', { name: 'Keep current image' })).toBeDefined()
  })
})
