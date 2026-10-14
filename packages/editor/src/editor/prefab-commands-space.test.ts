import { beforeEach, expect, it } from 'vitest'
import { THIRD_PERSON_BUNDLE } from '@waica/archetype-third-person'
import { resolveArchetype } from '../project/archetype'
import { installChassisArchetype } from '../project/chassis'
import { factoryComponents } from './prefab-commands'

// Maintainer decision on issue #181: the editor's New prefab writes the MCP scaffold's 3D set in a 3D archetype.

beforeEach(() => installChassisArchetype(THIRD_PERSON_BUNDLE))

const types = (components: ReturnType<typeof factoryComponents>): string[] => components.map((component) => component.type)

it('builds a new prefab from the 3D set in a 3D archetype and from the 2D chassis in a 2D one', () => {
  const thirdPerson = resolveArchetype('third-person')
  const platformer = resolveArchetype('platformer')

  expect(types(factoryComponents(thirdPerson, 'character', { role: 'player', identity: 'player' })).slice(0, 3)).toEqual(['Model', 'RigidBody', 'Collider'])
  expect(types(factoryComponents(thirdPerson, 'tile'))).toEqual(['Model', 'Collider'])
  expect(types(factoryComponents(platformer, 'tile'))).toEqual(['Sprite', 'Solid'])
})
