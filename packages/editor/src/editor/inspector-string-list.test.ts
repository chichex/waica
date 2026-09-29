// @vitest-environment happy-dom
import { cleanup, render as renderUi, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type ComponentProps, createElement, type ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
import { defined } from '../../../engine/src/test-support'

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

/** Re-renders the mounted Inspector: later renders in a test update the same root. */
let rerender: ((ui: ReactElement) => void) | undefined

function render(
  props: ComponentProps<typeof Inspector>,
  extra: Record<string, ComponentClass> = {},
): void {
  const ui: ReactElement = createElement(
    ArchetypeContext.Provider,
    { value: manifest(extra) },
    createElement(Inspector, props),
  )
  if (rerender) {
    rerender(ui)
    return
  }
  const view = renderUi(ui, { reactStrictMode: true })
  rerender = (next) => view.rerender(next)
}

/** The entry textboxes of a string-list param, in order (labelled "<param> entry <n>"). */
function entries(param: string): HTMLInputElement[] {
  return screen.getAllByRole<HTMLInputElement>('textbox', {
    name: new RegExp(`^${param} entry \\d+$`),
  })
}

/** Replaces a text field's whole value in one input event (select all, then paste). */
async function replaceText(input: HTMLInputElement, value: string): Promise<void> {
  const user = userEvent.setup()
  await user.tripleClick(input)
  await user.paste(value)
}

async function click(button: HTMLElement): Promise<void> {
  await userEvent.setup().click(button)
}

function objectPrefab(hitboxProps: Record<string, unknown>): PrefabJson {
  return {
    waicaPrefab: 1,
    type: 'object',
    components: [{ type: 'Hitbox', props: hitboxProps }],
  }
}

afterEach(() => {
  cleanup()
  rerender = undefined
})

describe('Inspector string-list control', () => {
  it('edits, adds, and removes ordered prefab tokens without normalization', async () => {
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

    const inputs = entries('collidesWith')
    expect(inputs.map((input) => input.value)).toEqual(['enemy', 'collectible'])

    await replaceText(defined(inputs[0]), ' Enemy ')
    expect(onPrefabProp).toHaveBeenCalledWith(
      'objects/bullet',
      'Hitbox',
      'collidesWith',
      [' Enemy ', 'collectible'],
    )

    await click(screen.getByRole('button', { name: '+ add' }))
    expect(onPrefabProp).toHaveBeenCalledWith(
      'objects/bullet',
      'Hitbox',
      'collidesWith',
      ['enemy', 'collectible', ''],
    )

    await click(screen.getByRole('button', { name: 'Remove collidesWith entry 2' }))
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
    await click(screen.getByRole('button', { name: 'Remove collidesWith entry 1' }))
    expect(onPrefabProp).toHaveBeenLastCalledWith(
      'objects/bullet',
      'Hitbox',
      'collidesWith',
      [],
    )
  })

  it('uses the same control for inline props and instance reset/apply wiring', async () => {
    const onProp = vi.fn()
    const inline: SceneEntityJson = {
      name: 'Inline',
      components: [{ type: 'Hitbox', props: { collidesWith: [] } }],
    }
    render(baseProps({
      selection: { kind: 'entity', entity: inline, sceneName: 'main' },
      onProp,
    }))
    await click(screen.getByRole('button', { name: '+ add' }))
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
    await click(screen.getByRole('button', { description: /^Reset/ }))
    await click(screen.getByRole('button', { description: /^Apply/ }))
    expect(onResetProp).toHaveBeenCalledWith('Instance', 'Hitbox', 'collidesWith')
    expect(onApplyProp).toHaveBeenCalledWith('Instance', 'Hitbox', 'collidesWith')
  })

  it('compares multi-selection arrays structurally and writes one complete list', async () => {
    const onMultiProp = vi.fn()
    const entities: SceneEntityJson[] = [
      { name: 'A', components: [{ type: 'Hitbox', props: { collidesWith: ['enemy', '*'] } }] },
      { name: 'B', components: [{ type: 'Hitbox', props: { collidesWith: ['enemy', '*'] } }] },
    ]
    render(baseProps({
      selection: { kind: 'multi', entities, sceneName: 'main' },
      onMultiProp,
    }))

    expect(screen.getByText(/^Collision Mask/).textContent).not.toContain('(mixed)')
    const second = defined(entries('collidesWith')[1])
    await replaceText(second, 'player')
    expect(onMultiProp).toHaveBeenCalledWith(
      ['A', 'B'],
      'Hitbox',
      'collidesWith',
      ['enemy', 'player'],
    )

    const mixed: SceneEntityJson[] = [
      defined(entities[0]),
      { name: 'B', components: [{ type: 'Hitbox', props: { collidesWith: ['*', 'enemy'] } }] },
    ]
    render(baseProps({
      selection: { kind: 'multi', entities: mixed, sceneName: 'main' },
      onMultiProp,
    }))
    expect(screen.getByText(/^Collision Mask/).textContent).toContain('(mixed)')
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

    expect(entries('tokens')).toHaveLength(2)
    const legacyRow = within(defined(screen.getByText('values').parentElement))
    expect(legacyRow.getByText('{…}').tagName).toBe('CODE')
    // No form control of any kind shows a value in the read-only row.
    expect(legacyRow.queryAllByDisplayValue(() => true)).toHaveLength(0)
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

    const layer = screen.getByLabelText<HTMLInputElement>('Collision Layer')
    expect(layer.value).toBe('*')
    expect(layer.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText(/A Collision Layer must start with a lowercase letter/)).toBeDefined()

    const inputs = entries('collidesWith')
    expect(inputs[0]?.hasAttribute('aria-invalid')).toBe(false)
    expect(inputs[1]?.hasAttribute('aria-invalid')).toBe(false)
    expect(inputs[2]?.getAttribute('aria-invalid')).toBe('true')
    expect(inputs[3]?.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText(/Duplicate Collision Mask entry "enemy"/)).toBeDefined()
    expect(screen.getByText(/Collision Mask entry 3 must be a string/)).toBeDefined()
    expect(screen.getByText(/Collision Mask entry "Enemy" is invalid/)).toBeDefined()
  })

  it('aggregates diagnostics from every entity in a mixed multi-selection', () => {
    const entities: SceneEntityJson[] = [
      {
        name: 'Valid A',
        components: [{
          type: 'Hitbox',
          props: { layer: 'player', collidesWith: ['enemy'] },
        }],
      },
      {
        name: 'Invalid B',
        components: [{
          type: 'Hitbox',
          props: { layer: 'Enemy', collidesWith: ['enemy', 'enemy', 7] },
        }],
      },
    ]
    render(baseProps({ selection: { kind: 'multi', entities, sceneName: 'main' } }))

    const layer = screen.getByLabelText<HTMLInputElement>(/^Collision Layer/)
    const mask = defined(entries('collidesWith')[0])
    expect(layer.getAttribute('aria-invalid')).toBe('true')
    expect(mask.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText(/Invalid B: A Collision Layer must start/)).toBeDefined()
    expect(screen.getByText(/Invalid B: Duplicate Collision Mask entry "enemy"/)).toBeDefined()
    expect(screen.getByText(/Invalid B: Collision Mask entry 3 must be a string/)).toBeDefined()
    expect(document.body.textContent).not.toContain('Valid A:')
  })

  it('reports a non-list mask without blocking edits and leaves valid open-vocabulary values clean', async () => {
    const onPrefabProp = vi.fn()
    const invalid = objectPrefab({ layer: 'custom-layer', collidesWith: 'enemy' })
    render(baseProps({
      selection: { kind: 'prefab', ref: 'objects/bad-mask', prefab: invalid },
      prefabs: { 'objects/bad-mask': invalid },
      onPrefabProp,
    }))

    // The single fallback textbox carries the field diagnostic as its description.
    const invalidInput = screen.getByRole<HTMLInputElement>('textbox', {
      name: 'collidesWith',
      description: /Collision Mask must be a list of strings/,
    })
    expect(invalidInput.getAttribute('aria-invalid')).toBe('true')
    expect(invalidInput.value).toBe('enemy')
    await replaceText(invalidInput, 'enemy-fixed')
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
    // Diagnostics render as alerts (errors) or statuses (warnings).
    expect(screen.queryAllByRole('alert')).toHaveLength(0)
    expect(screen.queryAllByRole('status')).toHaveLength(0)
  })
})
