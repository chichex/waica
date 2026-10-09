// Test support for the Inspector's render tests; no production module imports it.
import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { vi, type Mock } from 'vitest'
import { ArchetypeContext, resolveArchetype } from '../project/archetype'
import { Inspector, type InspectorSelection } from './Inspector'
import type { ArtItem } from './use-project-art'
import { defined } from '../../../engine/src/test-support'

export const HERO_ART: ArtItem = {
  label: 'hero.png',
  url: 'blob:hero',
  uri: 'src/art/hero.png',
  path: 'src/art/hero.png',
  kind: 'image',
}

export const JUMP_SOUND: ArtItem = {
  label: 'jump.ogg',
  url: 'blob:jump',
  uri: 'src/art/jump.ogg',
  path: 'src/art/jump.ogg',
  kind: 'sound',
}

type InspectorProps = ComponentProps<typeof Inspector>

/**
 * The Inspector's props with every callback a spy the test can assert on,
 * declared as properties so reading one off the object is not an unbound
 * method.
 */
export type SpiedInspectorProps = {
  [K in keyof InspectorProps]-?: NonNullable<InspectorProps[K]> extends (
    ...args: infer A
  ) => infer R
    ? Mock<(...args: A) => R>
    : InspectorProps[K]
}

/** Spies for the edits an entity (or a multi-selection of them) can make. */
function entityCallbacks() {
  return {
    onRename: vi.fn(),
    onMove: vi.fn(),
    onTransform: vi.fn(),
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
    onTilemapBrush: vi.fn(),
    onDelete: vi.fn(),
    onOpenPrefab: vi.fn(),
    onSizeAppearance: vi.fn(),
    onMachinePatch: vi.fn(),
  }
}

/** Spies for the edits a prefab selection makes to its shared blueprint. */
function prefabCallbacks() {
  return {
    onPrefabProp: vi.fn(),
    onPrefabAddComponent: vi.fn(),
    onPrefabRemoveComponent: vi.fn(),
    onPrefabToggleAnimated: vi.fn(),
    onPrefabSetTexture: vi.fn(),
    onPrefabSetShape: vi.fn(),
    onPrefabSetCollision: vi.fn(),
    onPrefabSizeAppearance: vi.fn(),
    onPrefabMachinePatch: vi.fn(),
  }
}

function inspectorProps(
  selection: InspectorSelection,
  overrides: Partial<SpiedInspectorProps>,
): SpiedInspectorProps {
  return {
    selection,
    prefabs: {},
    stats: { points: 0 },
    actions: {},
    art: [HERO_ART, JUMP_SOUND],
    uiPieces: [],
    urlFor: vi.fn((uri: string) => `url:${uri}`),
    onImportArt: vi.fn(() => Promise.resolve()),
    viewportVisibility: { appearance: true, collision: true },
    onViewportVisibility: vi.fn(),
    tilemapBrush: null,
    onEditAnimation: vi.fn(),
    onCameraProp: vi.fn(),
    onRenderProp: vi.fn(),
    pixelsPerUnit: 16,
    resolution: { mode: 'fixed', width: 640, height: 360 },
    sceneCamera: undefined,
    stateFiles: [],
    roleFiles: [],
    onCreateRoleFile: vi.fn(),
    onEditState: vi.fn(),
    ...entityCallbacks(),
    ...prefabCallbacks(),
    ...overrides,
  }
}

/** Renders the platformer Inspector under StrictMode and returns its spied props. */
export function renderInspector(
  selection: InspectorSelection,
  overrides: Partial<SpiedInspectorProps> = {},
): SpiedInspectorProps {
  const props = inspectorProps(selection, overrides)
  render(
    <ArchetypeContext.Provider value={resolveArchetype('platformer')}>
      <Inspector {...props} />
    </ArchetypeContext.Provider>,
    { reactStrictMode: true },
  )
  return props
}

/** The section whose header shows `title` (Appearance, Collision, Framing…). */
export function section(title: string): HTMLElement {
  const heading = screen.getByText(title, { selector: 'header, header > span' })
  const header = heading.tagName === 'HEADER' ? heading : heading.parentElement
  return defined(defined(header, `the ${title} header`).parentElement, `the ${title} section`)
}

/** The row whose leading text is `label`, for rows that are not <label>s. */
export function row(label: string): HTMLElement {
  return defined(screen.getByText(label, { selector: 'span' }).parentElement, `the ${label} row`)
}
