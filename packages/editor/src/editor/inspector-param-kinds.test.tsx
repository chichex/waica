// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vitest'
import type { PrefabJson, SceneEntityJson } from '@waica/engine'
import { HERO_ART, JUMP_SOUND, renderInspector } from './inspector-test-support'
import { defined } from '../../../engine/src/test-support'

afterEach(cleanup)

const emitterProps = {
  positionSpread: [1, 2],
  startColor: 0x123456,
  texture: HERO_ART.uri,
}

function inline(name = 'Smoke'): SceneEntityJson {
  return {
    name,
    components: [{ type: 'ParticleEmitter', props: emitterProps }],
  }
}

it('edits vector2, metadata color and image-only texture controls on an inline card (CA-12)', async () => {
    const user = userEvent.setup()
    const props = renderInspector({ kind: 'entity', sceneName: 'main', entity: inline() })

    const x = screen.getByRole('spinbutton', { name: 'Position spread x' })
    const y = screen.getByRole('spinbutton', { name: 'Position spread y' })
    fireEvent.change(x, { target: { value: '3' } })
    expect(props.onProp).toHaveBeenLastCalledWith('Smoke', 'ParticleEmitter', 'positionSpread', [3, 2])
    fireEvent.change(y, { target: { value: '-4' } })
    expect(props.onProp).toHaveBeenLastCalledWith('Smoke', 'ParticleEmitter', 'positionSpread', [1, -4])

    const color = screen.getByLabelText<HTMLInputElement>('Start color')
    expect(color.type).toBe('color')
    expect(color.value).toBe('#123456')
    fireEvent.change(color, { target: { value: '#abcdef' } })
    expect(props.onProp).toHaveBeenLastCalledWith('Smoke', 'ParticleEmitter', 'startColor', 0xabcdef)

    await user.click(screen.getByRole('button', { name: /hero\.png/ }))
    expect(screen.getByTitle('hero.png')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'jump.ogg' })).toBeNull()
    const file = new File(['pixels'], 'spark.png', { type: 'image/png' })
    const fileInput = defined(document.querySelector<HTMLInputElement>('input[type="file"]'))
    fireEvent.change(fileInput, { target: { files: [file] } })
    expect(props.onImportArt).toHaveBeenCalledWith([{ file, relativePath: 'spark.png' }])
    await user.click(screen.getByRole('button', { name: 'Clear image' }))
    expect(props.onProp).toHaveBeenLastCalledWith('Smoke', 'ParticleEmitter', 'texture', '')
  })

  it('writes specialized values through a prefab card (CA-12)', () => {
    const prefab: PrefabJson = {
      waicaPrefab: 1,
      type: 'object',
      components: [{ type: 'ParticleEmitter', props: emitterProps }],
    }
    const props = renderInspector(
      { kind: 'prefab', ref: 'objects/smoke', prefab },
      { prefabs: { 'objects/smoke': prefab } },
    )

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Position spread x' }), {
      target: { value: '6' },
    })
    expect(props.onPrefabProp).toHaveBeenCalledWith(
      'objects/smoke',
      'ParticleEmitter',
      'positionSpread',
      [6, 2],
    )
  })

  it('preserves prefab and instance reset/apply wiring for specialized values (CA-12)', async () => {
    const user = userEvent.setup()
    const prefab: PrefabJson = {
      waicaPrefab: 1,
      type: 'object',
      components: [{ type: 'ParticleEmitter', props: emitterProps }],
    }
    const instance: SceneEntityJson = {
      name: 'Instance',
      prefab: 'objects/smoke',
      overrides: { ParticleEmitter: { positionSpread: [8, 9] } },
    }
    const props = renderInspector(
      { kind: 'entity', sceneName: 'main', entity: instance },
      { prefabs: { 'objects/smoke': prefab } },
    )

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Position spread x' }), {
      target: { value: '10' },
    })
    expect(props.onProp).toHaveBeenLastCalledWith(
      'Instance',
      'ParticleEmitter',
      'positionSpread',
      [10, 9],
    )
    await user.click(screen.getByTitle('Reset to the prefab\'s value'))
    expect(props.onResetProp).toHaveBeenCalledWith('Instance', 'ParticleEmitter', 'positionSpread')
    await user.click(screen.getByTitle('Apply to the prefab — every instance gets this value'))
    expect(props.onApplyProp).toHaveBeenCalledWith('Instance', 'ParticleEmitter', 'positionSpread')
  })

it('writes one complete vector value across a multi-selection (CA-12)', () => {
  const props = renderInspector({
    kind: 'multi',
    sceneName: 'main',
    entities: [inline('One'), inline('Two')],
  })

  fireEvent.change(screen.getByRole('spinbutton', { name: 'Position spread y' }), {
    target: { value: '7' },
  })
  expect(props.onMultiProp).toHaveBeenCalledWith(
    ['One', 'Two'],
    'ParticleEmitter',
    'positionSpread',
    [1, 7],
  )
})

it('accepts image art and rejects audio art across a multi-selection (CA-12)', () => {
  const props = renderInspector({
    kind: 'multi',
    sceneName: 'main',
    entities: [inline('One'), inline('Two')],
  })
  const textureButton = defined(screen.getByRole('button', { name: /hero\.png/ }))
  const drop = (uri: string): void => {
    fireEvent.drop(textureButton, {
      dataTransfer: {
        types: ['waica/art'],
        getData: () => uri,
        dropEffect: 'copy',
      },
    })
  }

  drop(JUMP_SOUND.uri)
  expect(props.onMultiProp).not.toHaveBeenCalledWith(
    ['One', 'Two'], 'ParticleEmitter', 'texture', JUMP_SOUND.uri,
  )
  drop(HERO_ART.uri)
  expect(props.onMultiProp).toHaveBeenCalledWith(
    ['One', 'Two'], 'ParticleEmitter', 'texture', HERO_ART.uri,
  )
})
