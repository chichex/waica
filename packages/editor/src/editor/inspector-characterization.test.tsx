// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vitest'
import type { InspectorSelection } from './Inspector'
import { renderInspector, row, section } from './inspector-test-support'

/**
 * Characterization of the Inspector shell before it is split by
 * responsibility: the context header of every selection kind, the read-only
 * kinds, the scene summary and the multi-selection batch editor. The
 * expectations pin the behavior observed on the unsplit component.
 */

afterEach(cleanup)

it('shows a hint when nothing is selected', () => {
  renderInspector(null)

  expect(screen.getByText('Inspector')).toBeDefined()
  expect(screen.getByText('nothing selected')).toBeDefined()
})

interface HeaderCase {
  selection: InspectorSelection
  name: string
  badge: string
  scope: string | null
}

const HEADER_CASES: HeaderCase[] = [
  {
    selection: { kind: 'ui', name: 'hud' },
    name: 'hud',
    badge: 'ui piece',
    scope: 'HTML drawn over the game while it plays',
  },
  {
    selection: { kind: 'script', name: 'Health' },
    name: 'Health',
    badge: 'built-in script',
    scope: 'read-only — its params appear wherever the script is used',
  },
  {
    selection: { kind: 'art', label: 'hero.png', dims: [32, 16] },
    name: 'hero.png',
    badge: 'image',
    scope: null,
  },
  {
    selection: { kind: 'controls' },
    name: 'controls',
    badge: 'project',
    scope: 'which keys fire each action — applies to every scene',
  },
  {
    selection: { kind: 'stats' },
    name: 'stats',
    badge: 'project',
    scope: 'what the game keeps track of while playing — shared by every scene',
  },
  {
    selection: { kind: 'game' },
    name: 'game',
    badge: 'project',
    scope: 'global settings of the shipped game',
  },
  {
    selection: { kind: 'camera', camera: undefined, entityNames: [] },
    name: 'Camera',
    badge: 'scene camera',
    scope: 'built-in — this frame is what the player sees when the game runs',
  },
]

it.each(HEADER_CASES)('names the $name selection with its badge and scope', (header) => {
  renderInspector(header.selection)

  expect(screen.getAllByText(header.name).length).toBeGreaterThan(0)
  expect(screen.getByText(header.badge)).toBeDefined()
  if (header.scope) expect(screen.getByText(header.scope)).toBeDefined()
})

it('describes read-only project kinds in the body', () => {
  renderInspector({ kind: 'art', label: 'hero.png', dims: [32, 16] })
  expect(within(row('size')).getByText('32 × 16 px')).toBeDefined()
  cleanup()

  renderInspector({ kind: 'art', label: 'hero.png', dims: null })
  expect(within(row('size')).getByText('…')).toBeDefined()
  cleanup()

  renderInspector({ kind: 'stats' })
  expect(screen.getByText('edited in the center pane')).toBeDefined()
  cleanup()

  renderInspector({ kind: 'ui', name: 'hud' })
  expect(screen.getByText(/a UI piece is plain HTML/)).toBeDefined()
})

it('lists a built-in script’s params with their defaults', () => {
  renderInspector({ kind: 'script', name: 'Health' })

  expect(screen.getByText(/params declared in the code/)).toBeDefined()
  expect(within(row('Max health')).getByText('3')).toBeDefined()
  cleanup()

  renderInspector({ kind: 'script', name: 'NoSuchScript' })
  expect(screen.getByText('unknown script')).toBeDefined()
})

it('summarizes the scene and toggles its render options', async () => {
  const user = userEvent.setup()
  const props = renderInspector({
    kind: 'scene',
    name: 'main',
    scene: {
      waicaScene: 3,
      entities: [{ name: 'Hero' }, { name: 'Coin' }],
      ui: ['hud', 'score'],
      camera: { follow: 'Hero' },
      render: { sort: 'y' },
    },
  })

  expect(screen.getByText('main')).toBeDefined()
  expect(screen.getByText('scene')).toBeDefined()
  expect(screen.getByText('the world the game loads — click an entity to edit it')).toBeDefined()
  expect(within(row('entities')).getByText('2')).toBeDefined()
  expect(within(row('ui pieces')).getByText('hud, score')).toBeDefined()
  expect(within(row('camera')).getByText('follows Hero')).toBeDefined()

  const ysort = screen.getByRole<HTMLInputElement>('checkbox', { name: 'y-sort draw order' })
  const iso = screen.getByRole<HTMLInputElement>('checkbox', { name: 'Isometric projection' })
  expect(ysort.checked).toBe(true)
  expect(iso.checked).toBe(false)
  await user.click(ysort)
  expect(props.onRenderProp).toHaveBeenLastCalledWith('sort', undefined)
  await user.click(iso)
  expect(props.onRenderProp).toHaveBeenLastCalledWith('projection', 'isometric')
})

it('shows a fixed scene camera position and no ui pieces', () => {
  renderInspector({
    kind: 'scene',
    name: 'main',
    scene: { waicaScene: 3, entities: [], camera: { position: [2, 3] } },
  })

  expect(within(row('ui pieces')).getByText('none')).toBeDefined()
  expect(within(row('camera')).getByText('fixed at 2, 3')).toBeDefined()
})

it('lists a multi-selection and edits its shared props in one stroke', () => {
  const props = renderInspector({
    kind: 'multi',
    sceneName: 'main',
    entities: [
      { name: 'A', components: [{ type: 'Sprite', props: { width: 2 } }, { type: 'Health' }] },
      { name: 'B', components: [{ type: 'Sprite', props: { width: 3 } }] },
    ],
  })

  expect(screen.getByText('2 entities')).toBeDefined()
  expect(screen.getByText('selection')).toBeDefined()
  expect(screen.getByText('A')).toBeDefined()
  expect(screen.getByText('B')).toBeDefined()
  expect(screen.queryByText('Health')).toBeNull()
  expect(within(section('Sprite')).getByRole('spinbutton', { name: /^x offset$/ })).toBeDefined()

  const width = screen.getByRole<HTMLInputElement>('spinbutton', { name: /^width \(mixed\)/ })
  expect(width.value).toBe('2')
  fireEvent.change(width, { target: { value: '5' } })
  expect(props.onMultiProp).toHaveBeenLastCalledWith(['A', 'B'], 'Sprite', 'width', 5)
})
