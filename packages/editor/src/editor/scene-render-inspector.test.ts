// @vitest-environment happy-dom
import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { PrefabJson, SceneJson } from '@waica/engine'
import { ArchetypeContext, resolveArchetype } from '../project/archetype'
import { Inspector, type InspectorSelection } from './Inspector'

function props(selection: InspectorSelection): ComponentProps<typeof Inspector> {
  return {
    selection,
    prefabs: {} as Record<string, PrefabJson>,
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
  }
}

function render(selection: InspectorSelection): void {
  document.body.innerHTML = renderToStaticMarkup(
    createElement(
      ArchetypeContext.Provider,
      { value: resolveArchetype() },
      createElement(Inspector, props(selection)),
    ),
  )
}

describe('CameraInspector vertical lookahead', () => {
  it('offers the lookaheadY slider while following, next to lookahead', () => {
    render({ kind: 'camera', camera: { follow: 'Player', lookaheadY: 1 }, entityNames: ['Player'] })
    const sliders = [...document.querySelectorAll('.ed-row-slider')].map(
      (row) => row.querySelector('span')?.textContent,
    )
    expect(sliders).toContain('Lookahead (vertical)')
    expect(sliders.indexOf('Lookahead (vertical)')).toBeGreaterThan(sliders.indexOf('Lookahead'))
  })

  it('hides both lookahead sliders without a follow target', () => {
    render({ kind: 'camera', camera: {}, entityNames: [] })
    expect(document.body.textContent).not.toContain('Lookahead (vertical)')
  })
})

describe('SceneInspector y-sort toggle', () => {
  const scene = (render?: SceneJson['render']): SceneJson => ({
    waicaScene: 3,
    entities: [],
    ...(render ? { render } : {}),
  })

  it('shows the toggle unchecked for scenes without a render block', () => {
    render({ kind: 'scene', name: 'main', scene: scene() })
    const toggle = document.querySelector<HTMLInputElement>('input[data-testid="ysort-toggle"]')
    expect(toggle).not.toBeNull()
    expect(toggle!.checked).toBe(false)
  })

  it('shows the toggle checked when the scene sorts by Y', () => {
    render({ kind: 'scene', name: 'main', scene: scene({ sort: 'y' }) })
    const toggle = document.querySelector<HTMLInputElement>('input[data-testid="ysort-toggle"]')
    expect(toggle!.checked).toBe(true)
  })
})
