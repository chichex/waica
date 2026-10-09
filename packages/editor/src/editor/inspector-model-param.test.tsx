// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { SceneEntityJson } from '@waica/engine'
import { HERO_ART, JUMP_SOUND, renderInspector } from './inspector-test-support'
import type { ArtItem } from './use-project-art'

afterEach(cleanup)

const TREE: ArtItem = { label: 'tree.glb', url: 'blob:tree', uri: 'src/art/tree.glb', path: 'src/art/tree.glb', kind: 'model' }
const ROCK: ArtItem = { label: 'rock.gltf', url: 'blob:rock', uri: 'src/art/rock.gltf', path: 'src/art/rock.gltf', kind: 'model' }

const ART = [HERO_ART, JUMP_SOUND, TREE, ROCK]

function crate(props: Record<string, unknown> = {}): SceneEntityJson {
  return { name: 'Crate', components: [{ type: 'Model', props }] }
}

describe('Model params in the inspector (issue #154 CA-8, CA-9)', () => {
  it('renders src as a select over the project\'s model art only', () => {
    renderInspector({ kind: 'entity', sceneName: 'main', entity: crate({ src: 'src/art/tree.glb' }) }, { art: ART })

    const select = screen.getByRole<HTMLSelectElement>('combobox', { name: /model file/i })
    expect(select.value).toBe('src/art/tree.glb')
    const options = within(select).getAllByRole('option').map((option) => option.textContent)
    expect(options).toEqual(['none (use the shape)', 'tree.glb', 'rock.gltf'])
  })

  it('offers only the models validate_project and the build resolve: src/art/<file> and the archetype\'s own', () => {
    const nested: ArtItem = { ...TREE, label: 'models/pine.glb', uri: 'src/art/models/pine.glb', path: 'src/art/models/pine.glb' }
    const inPublic: ArtItem = { ...TREE, label: 'public/oak.glb', uri: 'public/oak.glb', path: 'public/oak.glb' }
    const bundled: ArtItem = { ...TREE, label: 'iso-tree.glb', uri: 'waica:iso-tree', path: 'waica:iso-tree' }
    renderInspector({ kind: 'entity', sceneName: 'main', entity: crate() }, { art: [TREE, nested, inPublic, bundled] })

    const select = screen.getByRole<HTMLSelectElement>('combobox', { name: /model file/i })
    const options = within(select).getAllByRole('option').map((option) => option.textContent)
    expect(options).toEqual(['none (use the shape)', 'tree.glb', 'iso-tree.glb'])
  })

  it('commits the chosen model, and an empty choice clears it', () => {
    const props = renderInspector({ kind: 'entity', sceneName: 'main', entity: crate() }, { art: ART })
    const select = screen.getByRole<HTMLSelectElement>('combobox', { name: /model file/i })

    fireEvent.change(select, { target: { value: 'src/art/rock.gltf' } })
    expect(props.onProp).toHaveBeenLastCalledWith('Crate', 'Model', 'src', 'src/art/rock.gltf')
    fireEvent.change(select, { target: { value: '' } })
    expect(props.onProp).toHaveBeenLastCalledWith('Crate', 'Model', 'src', '')
  })

  it('keeps a saved model that is no longer in the project visible and marked missing', () => {
    renderInspector({ kind: 'entity', sceneName: 'main', entity: crate({ src: 'src/art/gone.glb' }) }, { art: ART })
    const select = screen.getByRole<HTMLSelectElement>('combobox', { name: /model file/i })
    expect(select.value).toBe('src/art/gone.glb')
    expect(select.className).toContain('is-missing')
    expect(within(select).getByText(/gone\.glb — missing/)).toBeDefined()
  })

  it('offers shape as a dropdown, color as a picker and size as a number', () => {
    const props = renderInspector({ kind: 'entity', sceneName: 'main', entity: crate({ shape: 'box', color: 0x112233, size: 2 }) }, { art: ART })
    const shape = screen.getByRole<HTMLSelectElement>('combobox', { name: /shape/i })
    expect(within(shape).getAllByRole('option').map((option) => option.textContent)).toEqual(['box', 'sphere', 'plane'])
    fireEvent.change(shape, { target: { value: 'sphere' } })
    expect(props.onProp).toHaveBeenLastCalledWith('Crate', 'Model', 'shape', 'sphere')
    const color = screen.getByLabelText<HTMLInputElement>('Color')
    expect(color.type).toBe('color')
    expect(color.value).toBe('#112233')
  })
})

describe('Sun direction in the inspector (issue #154 CA-11)', () => {
  it('edits the direction as X/Y/Z', () => {
    const entity: SceneEntityJson = { name: 'Daylight', components: [{ type: 'Sun', props: { direction: [-1, -2, -1] } }] }
    const props = renderInspector({ kind: 'entity', sceneName: 'main', entity }, { art: ART })

    const [x, y, z] = [
      screen.getByRole('spinbutton', { name: 'Direction x' }),
      screen.getByRole('spinbutton', { name: 'Direction y' }),
      screen.getByRole('spinbutton', { name: 'Direction z' }),
    ]
    expect([x, y, z].map((field) => (field as HTMLInputElement).value)).toEqual(['-1', '-2', '-1'])
    fireEvent.change(z, { target: { value: '0.5' } })
    expect(props.onProp).toHaveBeenLastCalledWith('Daylight', 'Sun', 'direction', [-1, -2, 0.5])
  })
})
