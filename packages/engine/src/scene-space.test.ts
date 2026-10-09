import { describe, expect, it } from 'vitest'
import { AnimatedSprite } from './components/animated-sprite.js'
import { DynamicBody } from './components/dynamic-body.js'
import { Hitbox } from './components/hitbox.js'
import { Light } from './components/light.js'
import { Model } from './components/model.js'
import { ParticleEmitter } from './components/particle-emitter.js'
import { PointLight } from './components/point-light.js'
import { Solid } from './components/solid.js'
import { Sprite } from './components/sprite.js'
import { Sun } from './components/sun.js'
import { Tilemap } from './components/tilemap.js'
import { Component } from './component.js'
import { StateMachine } from './state/state-machine.js'
import {
  componentSpaceMismatch,
  componentSpaceOf,
  entityTransformIssues,
  resolveSceneSpace,
  sceneSpaceIssues,
} from './scene-space.js'

const TWO_D_CLASSES = [Sprite, AnimatedSprite, Tilemap, Solid, DynamicBody, Hitbox, Light, ParticleEmitter]
const THREE_D_CLASSES = [Model, Sun, PointLight]

describe('resolveSceneSpace (CA-1)', () => {
  it('is 2d unless the render block says 3d', () => {
    expect(resolveSceneSpace(undefined)).toBe('2d')
    expect(resolveSceneSpace({})).toBe('2d')
    expect(resolveSceneSpace({ space: '2d' })).toBe('2d')
    expect(resolveSceneSpace({ space: '3d' })).toBe('3d')
    expect(resolveSceneSpace({ space: 'isometric' })).toBe('2d')
    expect(resolveSceneSpace({ space: 3 })).toBe('2d')
  })
})

describe('sceneSpaceIssues (CA-13)', () => {
  const fields = (render: unknown, camera?: unknown): string[] => sceneSpaceIssues(render, camera).map((issue) => issue.field)

  it('accepts the 2d and 3d scenes the engine supports', () => {
    expect(fields(undefined, undefined)).toEqual([])
    expect(fields({ space: '2d' }, { zoom: 12 })).toEqual([])
    expect(fields({ space: '3d' }, { kind: 'perspective', fov: 50 })).toEqual([])
    expect(fields({ space: '3d' }, undefined)).toEqual([])
    expect(fields({ sort: 'y', projection: 'isometric', batch: false }, { kind: 'orthographic' })).toEqual([])
  })

  it('rejects a space outside 2d | 3d', () => {
    expect(fields({ space: '4d' })).toEqual(['render.space'])
    expect(fields({ space: 3 })).toEqual(['render.space'])
  })

  it('rejects a perspective camera in a 2d scene and an orthographic camera in a 3d one', () => {
    expect(fields({}, { kind: 'perspective' })).toEqual(['camera.kind'])
    expect(fields({ space: '2d' }, { kind: 'perspective' })).toEqual(['camera.kind'])
    expect(fields({ space: '3d' }, { zoom: 12 })).toEqual(['camera.kind'])
    expect(fields({ space: '3d' }, { kind: 'orthographic' })).toEqual(['camera.kind'])
  })

  it('rejects a camera kind that is neither', () => {
    expect(fields({}, { kind: 'fisheye' })).toEqual(['camera.kind'])
  })

  it('reports out-of-range perspective fields', () => {
    expect(fields({ space: '3d' }, { kind: 'perspective', fov: 0, near: -1, position: [1, 2] })).toEqual([
      'camera.position',
      'camera.fov',
      'camera.near',
    ])
  })

  it('rejects render.sort, render.projection and render.batch in a 3d scene (CA-14)', () => {
    expect(fields({ space: '3d', sort: 'y', projection: 'isometric', batch: false }, { kind: 'perspective' })).toEqual([
      'render.sort',
      'render.projection',
      'render.batch',
    ])
  })

  it('keeps render.post and render.lighting legal in 3d (inference 5)', () => {
    expect(fields({ space: '3d', post: { vignette: { intensity: 0.2, radius: 0.5 } }, lighting: { ambient: { intensity: 0.4 } } }, { kind: 'perspective' })).toEqual([])
  })
})

describe('component space marker (CA-1)', () => {
  it('defaults to both when a component declares nothing', () => {
    expect(Component.space).toBeUndefined()
    expect(componentSpaceOf(Component)).toBe('both')
    expect(componentSpaceOf(StateMachine)).toBe('both')
  })

  it('marks the engine components with the space they belong to', () => {
    expect(TWO_D_CLASSES.map((Class) => [Class.componentName, componentSpaceOf(Class)])).toEqual([
      ['Sprite', '2d'],
      ['AnimatedSprite', '2d'],
      ['Tilemap', '2d'],
      ['Solid', '2d'],
      ['DynamicBody', '2d'],
      ['Hitbox', '2d'],
      ['Light', '2d'],
      ['ParticleEmitter', '2d'],
    ])
    expect(THREE_D_CLASSES.map((Class) => [Class.componentName, componentSpaceOf(Class)])).toEqual([
      ['Model', '3d'],
      ['Sun', '3d'],
      ['PointLight', '3d'],
    ])
  })

  it('flags 2D components in 3d and 3D components in 2d, and nothing else', () => {
    for (const Class of TWO_D_CLASSES) {
      expect(componentSpaceMismatch('3d', Class), Class.componentName).toBe(true)
      expect(componentSpaceMismatch('2d', Class), Class.componentName).toBe(false)
    }
    for (const Class of THREE_D_CLASSES) {
      expect(componentSpaceMismatch('2d', Class), Class.componentName).toBe(true)
      expect(componentSpaceMismatch('3d', Class), Class.componentName).toBe(false)
    }
    expect(componentSpaceMismatch('2d', StateMachine)).toBe(false)
    expect(componentSpaceMismatch('3d', StateMachine)).toBe(false)
  })

})

describe('component space marker on any class (CA-1)', () => {
  it('reads the marker of any class, including a project-owned one, and treats an unknown class as neutral', () => {
    class ProjectOnly2d extends Component {
      static override space = '2d' as const
    }
    class ProjectBoth extends Component {
      static override space = 'both' as const
    }
    expect(componentSpaceMismatch('3d', ProjectOnly2d)).toBe(true)
    expect(componentSpaceMismatch('2d', ProjectOnly2d)).toBe(false)
    expect(componentSpaceMismatch('3d', ProjectBoth)).toBe(false)
    expect(componentSpaceMismatch('2d', ProjectBoth)).toBe(false)
    expect(componentSpaceMismatch('3d', undefined)).toBe(false)
    expect(componentSpaceMismatch('2d', undefined)).toBe(false)
  })
})

describe('entityTransformIssues (CA-13)', () => {
  const fields = (entity: unknown): string[] => entityTransformIssues(entity).map((issue) => issue.field)

  it('accepts a position of 2 or 3 numbers and a rotation and scale of 3', () => {
    expect(fields({ name: 'A' })).toEqual([])
    expect(fields({ name: 'A', position: [1, 2] })).toEqual([])
    expect(fields({ name: 'A', position: [1, 2, 3], rotation: [0, 90, 0], scale: [1, 2, 1] })).toEqual([])
  })

  it.each([[[1]], [[1, 2, 3, 4]], [[1, Number.NaN]], ['0,0'], [[1, '2']]])('rejects position %j', (position) => {
    expect(fields({ name: 'A', position })).toEqual(['position'])
  })

  it.each([[[1, 2]], [[1, 2, 3, 4]], [[1, 2, Number.POSITIVE_INFINITY]], [7]])('rejects rotation and scale %j', (value) => {
    expect(fields({ name: 'A', rotation: value, scale: value })).toEqual(['rotation', 'scale'])
  })
})
