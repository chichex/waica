// @vitest-environment happy-dom
import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { SceneEntityJson } from '@waica/engine'
import { characterClipsWarning } from './inspector/component-meta'
import { renderInspector, section } from './inspector-test-support'

afterEach(cleanup)

/** A 3D character: a glb Model, an Animator and a machine whose clips live in the glb. */
const RIG: SceneEntityJson = {
  name: 'Hero',
  position: [0, 0, 0],
  components: [
    { type: 'Model', props: { src: 'src/art/hero.glb' } },
    { type: 'Animator', props: { initialClip: 'Idle', fade: 0.2 } },
    { type: 'StateMachine', props: { role: 'player', initial: 'idle', states: { idle: { clip: 'Idle', transitions: [{ on: 'signal:move', to: 'walk' }] }, walk: { clip: 'Walking_A', transitions: [{ on: 'signal:stop', to: 'idle' }] } } } },
  ],
}

describe('a Model + Animator + StateMachine entity in the inspector (issue #166 CA-11)', () => {
  it('renders initialClip and fade through the generic param rows', () => {
    renderInspector({ kind: 'entity', entity: RIG, sceneName: 'main', space: '3d' })
    const behaviours = section('Behaviours')
    expect(within(behaviours).getByRole('textbox', { name: 'Initial clip' })).toHaveProperty('value', 'Idle')
    expect(within(behaviours).getByRole('slider', { name: /^Fade \(s\)/ })).toHaveProperty('value', '0.2')
  })

  it('shows no "No animation for this state" warning: the clips live in the glb', () => {
    renderInspector({ kind: 'entity', entity: RIG, sceneName: 'main', space: '3d' })
    expect(screen.queryByTitle(/has no clip named/)).toBeNull()
    expect(screen.getByRole('button', { name: 'idle', description: 'Edit this state (clip, transitions, code)' })).toBeDefined()
  })
})

describe('characterClipsWarning beside a Model (issue #166 CA-11)', () => {
  it('reports no missing clips when the entity draws a Model', () => {
    const components = RIG.components ?? []
    expect(characterClipsWarning({ type: 'AnimatedSprite', props: { clips: {} } }, components)).toBeUndefined()
    expect(characterClipsWarning({ type: 'AnimatedSprite', props: { clips: {} } }, components.filter((c) => c.type !== 'Model'))).toBe('missing clips: Idle, Walking_A')
  })
})
