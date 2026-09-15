// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Component,
  type ComponentClass,
  type PrefabJson,
  type SceneEntityJson,
} from '@waica/engine'
import {
  ArchetypeContext,
  resolveArchetype,
  type ArchetypeManifest,
} from '../project/archetype'
import { Inspector } from './Inspector'

class GenericStringList extends Component {
  static override componentName = 'GenericStringList'
  static override params = { tokens: { label: 'tokens', kind: 'string-list' as const } }
  tokens: string[] = ['one']
}

class LegacyArray extends Component {
  static override componentName = 'LegacyArray'
  static override params = { values: { label: 'values' } }
  values: string[] = ['read-only']
}

let host: HTMLDivElement
let root: Root

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

function manifest(extra: Record<string, ComponentClass> = {}): ArchetypeManifest {
  const archetype = resolveArchetype('platformer')
  return {
    ...archetype,
    registry: {
      ...archetype.registry,
      components: { ...archetype.registry.components, ...extra },
    },
  }
}

function render(
  props: ComponentProps<typeof Inspector>,
  extra: Record<string, ComponentClass> = {},
): void {
  act(() => {
    root.render(
      createElement(
        ArchetypeContext.Provider,
        { value: manifest(extra) },
        createElement(Inspector, props),
      ),
    )
  })
}

function list(name: string): HTMLElement {
  const field = host.querySelector<HTMLElement>(`[data-param-list="${name}"]`)
  if (!field) throw new Error(`missing string-list field ${name}`)
  return field
}

function setInput(input: HTMLInputElement, value: string): void {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function click(button: HTMLButtonElement): void {
  act(() => button.click())
}

function objectPrefab(hitboxProps: Record<string, unknown>): PrefabJson {
  return {
    waicaPrefab: 1,
    type: 'object',
    components: [{ type: 'Hitbox', props: hitboxProps }],
  }
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  document.body.innerHTML = ''
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

describe('Inspector string-list control', () => {
  it('edits, adds, and removes ordered prefab tokens without normalization', () => {
    const onPrefabProp = vi.fn()
    const prefab = objectPrefab({
      layer: 'projectile',
      collidesWith: ['enemy', 'collectible'],
    })
    const props = baseProps({
      selection: { kind: 'prefab', ref: 'objects/bullet', prefab },
      prefabs: { 'objects/bullet': prefab },
      onPrefabProp,
    })
    render(props)

    const field = list('collidesWith')
    const inputs = [...field.querySelectorAll<HTMLInputElement>('input[type="text"]')]
    expect(inputs.map((input) => input.value)).toEqual(['enemy', 'collectible'])

    setInput(inputs[0]!, ' Enemy ')
    expect(onPrefabProp).toHaveBeenCalledWith(
      'objects/bullet',
      'Hitbox',
      'collidesWith',
      [' Enemy ', 'collectible'],
    )

    click(field.querySelector<HTMLButtonElement>('button[data-list-add]')!)
    expect(onPrefabProp).toHaveBeenCalledWith(
      'objects/bullet',
      'Hitbox',
      'collidesWith',
      ['enemy', 'collectible', ''],
    )

    click(field.querySelectorAll<HTMLButtonElement>('button[data-list-remove]')[1]!)
    expect(onPrefabProp).toHaveBeenCalledWith(
      'objects/bullet',
      'Hitbox',
      'collidesWith',
      ['enemy'],
    )

    const finalPrefab = objectPrefab({ layer: 'projectile', collidesWith: ['enemy'] })
    render(baseProps({
      selection: { kind: 'prefab', ref: 'objects/bullet', prefab: finalPrefab },
      prefabs: { 'objects/bullet': finalPrefab },
      onPrefabProp,
    }))
    click(list('collidesWith').querySelector<HTMLButtonElement>('button[data-list-remove]')!)
    expect(onPrefabProp).toHaveBeenLastCalledWith(
      'objects/bullet',
      'Hitbox',
      'collidesWith',
      [],
    )
  })

  it('uses the same control for inline props and instance reset/apply wiring', () => {
    const onProp = vi.fn()
    const inline: SceneEntityJson = {
      name: 'Inline',
      components: [{ type: 'Hitbox', props: { collidesWith: [] } }],
    }
    render(baseProps({
      selection: { kind: 'entity', entity: inline, sceneName: 'main' },
      onProp,
    }))
    click(list('collidesWith').querySelector<HTMLButtonElement>('button[data-list-add]')!)
    expect(onProp).toHaveBeenCalledWith('Inline', 'Hitbox', 'collidesWith', [''])

    const onResetProp = vi.fn()
    const onApplyProp = vi.fn()
    const prefab = objectPrefab({ collidesWith: ['*'] })
    const instance: SceneEntityJson = {
      name: 'Instance',
      prefab: 'objects/thing',
      overrides: { Hitbox: { collidesWith: ['enemy'] } },
    }
    render(baseProps({
      selection: { kind: 'entity', entity: instance, sceneName: 'main' },
      prefabs: { 'objects/thing': prefab },
      onResetProp,
      onApplyProp,
    }))
    const overrideField = list('collidesWith')
    click(overrideField.querySelector<HTMLButtonElement>('button[title^="Reset"]')!)
    click(overrideField.querySelector<HTMLButtonElement>('button[title^="Apply"]')!)
    expect(onResetProp).toHaveBeenCalledWith('Instance', 'Hitbox', 'collidesWith')
    expect(onApplyProp).toHaveBeenCalledWith('Instance', 'Hitbox', 'collidesWith')
  })

  it('compares multi-selection arrays structurally and writes one complete list', () => {
    const onMultiProp = vi.fn()
    const entities: SceneEntityJson[] = [
      { name: 'A', components: [{ type: 'Hitbox', props: { collidesWith: ['enemy', '*'] } }] },
      { name: 'B', components: [{ type: 'Hitbox', props: { collidesWith: ['enemy', '*'] } }] },
    ]
    render(baseProps({
      selection: { kind: 'multi', entities, sceneName: 'main' },
      onMultiProp,
    }))

    const field = list('collidesWith')
    expect(field.textContent).not.toContain('(mixed)')
    const second = field.querySelectorAll<HTMLInputElement>('input[type="text"]')[1]!
    setInput(second, 'player')
    expect(onMultiProp).toHaveBeenCalledWith(
      ['A', 'B'],
      'Hitbox',
      'collidesWith',
      ['enemy', 'player'],
    )

    const mixed: SceneEntityJson[] = [
      entities[0]!,
      { name: 'B', components: [{ type: 'Hitbox', props: { collidesWith: ['*', 'enemy'] } }] },
    ]
    render(baseProps({
      selection: { kind: 'multi', entities: mixed, sceneName: 'main' },
      onMultiProp,
    }))
    expect(list('collidesWith').textContent).toContain('(mixed)')
  })

  it('honors generic metadata while arrays without it remain read-only', () => {
    const onProp = vi.fn()
    const entity: SceneEntityJson = {
      name: 'Lists',
      components: [
        { type: 'GenericStringList', props: { tokens: ['one', 'two'] } },
        { type: 'LegacyArray', props: { values: ['unchanged'] } },
      ],
    }
    render(
      baseProps({
        selection: { kind: 'entity', entity, sceneName: 'main' },
        onProp,
      }),
      { GenericStringList, LegacyArray },
    )

    expect(list('tokens').querySelectorAll('input[type="text"]')).toHaveLength(2)
    const legacyRow = [...host.querySelectorAll('.ed-row')].find((row) =>
      row.textContent?.startsWith('values'),
    )
    expect(legacyRow?.querySelector('code.ed-obj')).not.toBeNull()
    expect(legacyRow?.querySelector('input')).toBeNull()
  })
})

describe('Inspector collision-category diagnostics', () => {
  it('marks invalid values as errors and duplicate valid tokens only as warnings', () => {
    const prefab = objectPrefab({
      layer: '*',
      collidesWith: ['enemy', 'enemy', 7, 'Enemy'],
    })
    render(baseProps({
      selection: { kind: 'prefab', ref: 'objects/bad', prefab },
      prefabs: { 'objects/bad': prefab },
    }))

    const layer = host.querySelector<HTMLInputElement>('[data-param="layer"] input')!
    expect(layer.value).toBe('*')
    expect(layer.getAttribute('aria-invalid')).toBe('true')
    expect(host.textContent).toContain('A Collision Layer must start with a lowercase letter')

    const inputs = [...list('collidesWith').querySelectorAll<HTMLInputElement>('input')]
    expect(inputs[0]?.hasAttribute('aria-invalid')).toBe(false)
    expect(inputs[1]?.hasAttribute('aria-invalid')).toBe(false)
    expect(inputs[2]?.getAttribute('aria-invalid')).toBe('true')
    expect(inputs[3]?.getAttribute('aria-invalid')).toBe('true')
    expect(host.textContent).toContain('Duplicate Collision Mask entry "enemy"')
    expect(host.textContent).toContain('Collision Mask entry 3 must be a string')
    expect(host.textContent).toContain('Collision Mask entry "Enemy" is invalid')
  })

  it('reports a non-list mask without blocking edits and leaves valid open-vocabulary values clean', () => {
    const onPrefabProp = vi.fn()
    const invalid = objectPrefab({ layer: 'custom-layer', collidesWith: 'enemy' })
    render(baseProps({
      selection: { kind: 'prefab', ref: 'objects/bad-mask', prefab: invalid },
      prefabs: { 'objects/bad-mask': invalid },
      onPrefabProp,
    }))

    const invalidField = list('collidesWith')
    const invalidInput = invalidField.querySelector<HTMLInputElement>('input')!
    expect(invalidInput.getAttribute('aria-invalid')).toBe('true')
    expect(invalidField.textContent).toContain('Collision Mask must be a list of strings')
    expect(invalidInput.value).toBe('enemy')
    setInput(invalidInput, 'enemy-fixed')
    expect(onPrefabProp).toHaveBeenCalledWith(
      'objects/bad-mask',
      'Hitbox',
      'collidesWith',
      ['enemy-fixed'],
    )

    const valid = objectPrefab({ layer: 'unknown-valid-9', collidesWith: ['*'] })
    render(baseProps({
      selection: { kind: 'prefab', ref: 'objects/valid', prefab: valid },
      prefabs: { 'objects/valid': valid },
    }))
    expect(host.querySelectorAll('.ed-param-diagnostic')).toHaveLength(0)
  })
})
