// @vitest-environment happy-dom
import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { PrefabJson } from '@waica/engine'
import { ArchetypeContext, resolveArchetype } from '../project/archetype'
import { Inspector } from './Inspector'
import type { ArtItem } from './use-project-art'

/**
 * A component with ref: 'sound' (Health.hurtSound, MeleeAttack.swingSound —
 * see .sdd/specs/issue-67-engine-audio-subsystem.md CA-17) must render as a
 * picker over the project's sounds, exactly like the pre-existing
 * prefab/stat/action/clip refs, not as free text.
 */
function baseProps(
  overrides: Partial<ComponentProps<typeof Inspector>> = {},
): ComponentProps<typeof Inspector> {
  return {
    selection: null,
    prefabs: {},
    stats: {},
    actions: {},
    art: [],
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

function renderMarkup(props: ComponentProps<typeof Inspector>): void {
  const archetype = resolveArchetype('platformer')
  document.body.innerHTML = renderToStaticMarkup(
    createElement(
      ArchetypeContext.Provider,
      { value: archetype },
      createElement(Inspector, props),
    ),
  )
}

function rowNamed(label: string): Element {
  const row = [...document.querySelectorAll('.ed-row')].find((r) =>
    r.textContent?.startsWith(label),
  )
  if (!row) throw new Error(`missing row "${label}"`)
  return row
}

describe('Inspector sound ref picker (CA-17)', () => {
  it("renders Health's hurtSound as a picker listing only the project's sounds", () => {
    const prefab: PrefabJson = {
      waicaPrefab: 1,
      type: 'character',
      components: [{ type: 'Health', props: {} }],
    }
    const art: ArtItem[] = [
      {
        label: 'hurt.ogg',
        url: 'blob:hurt',
        uri: 'src/art/hurt.ogg',
        path: 'src/art/hurt.ogg',
        kind: 'sound',
      },
      {
        label: 'hero.png',
        url: 'blob:hero',
        uri: 'src/art/hero.png',
        path: 'src/art/hero.png',
        kind: 'image',
      },
    ]
    renderMarkup(
      baseProps({
        selection: { kind: 'prefab', ref: 'characters/hero', prefab },
        prefabs: { 'characters/hero': prefab },
        art,
      }),
    )

    const select = rowNamed('Hurt sound').querySelector('select')
    expect(select).not.toBeNull()
    const options = [...select!.querySelectorAll('option')].map((o) => o.getAttribute('value'))
    expect(options).toContain('src/art/hurt.ogg')
    expect(options).not.toContain('src/art/hero.png')
  })

  it('renders an empty picker (not free text) when the project has no sounds yet', () => {
    const prefab: PrefabJson = {
      waicaPrefab: 1,
      type: 'character',
      components: [{ type: 'Health', props: {} }],
    }
    renderMarkup(
      baseProps({
        selection: { kind: 'prefab', ref: 'characters/hero', prefab },
        prefabs: { 'characters/hero': prefab },
        art: [],
      }),
    )

    const row = rowNamed('Hurt sound')
    expect(row.querySelector('select')).not.toBeNull()
    expect(row.querySelector('input[type="text"]')).toBeNull()
  })
})
