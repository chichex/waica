import { access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { resolveDirectionalClip, type BrowserArchetypeManifest } from '@waica/engine'
import { ARCHETYPE as PLATFORMER } from '../../archetype-platformer/src/index.js'
import { ARCHETYPE as TOPDOWN } from '../../archetype-topdown/src/index.js'
import { archetypePackageName } from '../../editor/src/project/archetype.js'
import { knownArchetype } from './known-archetypes.js'

/**
 * Portable conformance suite: the coherence rules every archetype package
 * must satisfy, run against each shipped manifest. A third archetype joins
 * by adding one entry here.
 */
const MANIFESTS: BrowserArchetypeManifest[] = [PLATFORMER, TOPDOWN]

interface StateMachineProps {
  role?: string
  initial?: string
  states?: Record<string, { clip?: string; transitions?: Array<{ on: string; to: string }> }>
}

interface AnimatedSpriteProps {
  texture?: string
  clips?: Record<string, unknown>
}

describe.each(MANIFESTS.map((manifest) => [manifest.id, manifest] as const))(
  'archetype conformance: %s',
  (id, archetype) => {
    it('registers every component its prefabs name in its own registry', () => {
      const registered = new Set(Object.keys(archetype.registry.components))
      for (const [ref, prefab] of Object.entries(archetype.prefabs)) {
        for (const component of prefab.components) {
          expect(registered.has(component.type), `${ref} → ${component.type}`).toBe(true)
        }
      }
    })

    it('resolves every scene prefab ref and ui piece', () => {
      for (const [label, scene] of [
        ['scene', archetype.scene],
        ['blankScene', archetype.blankScene],
      ] as const) {
        for (const entity of scene.entities) {
          if (!entity.prefab) continue
          expect(archetype.prefabs[entity.prefab], `${label}: ${entity.name}`).toBeDefined()
        }
        for (const piece of scene.ui ?? []) {
          expect(archetype.registry.ui?.[piece], `${label} ui: ${piece}`).toBeDefined()
        }
      }
    })

    it('labels every action it binds, with at least one key each', () => {
      const actions = Object.keys(archetype.bindings)
      expect(actions.length).toBeGreaterThan(0)
      for (const action of actions) {
        expect(archetype.bindings[action]!.length, action).toBeGreaterThan(0)
        expect(archetype.actionLabels[action], action).toBeTruthy()
      }
      expect(Object.keys(archetype.actionLabels).sort()).toEqual(actions.sort())
    })

    it('backs every StateMachine clip with sprite clips, directional contract aware', () => {
      for (const [ref, prefab] of Object.entries(archetype.prefabs)) {
        const machine = prefab.components.find((c) => c.type === 'StateMachine')
        const sprite = prefab.components.find((c) => c.type === 'AnimatedSprite')
        if (!machine || !sprite) continue
        const { states = {} } = (machine.props ?? {}) as StateMachineProps
        const clips = Object.keys(((sprite.props ?? {}) as AnimatedSpriteProps).clips ?? {})
        for (const [state, definition] of Object.entries(states)) {
          for (const edge of definition.transitions ?? []) {
            expect(states[edge.to], `${ref}: ${state} --${edge.on}--> ${edge.to}`).toBeDefined()
          }
          if (state === '*') continue
          const clip = definition.clip ?? state
          const playable =
            clips.includes(clip) ||
            (archetype.animation !== undefined &&
              archetype.animation.directions.every(
                (dir) => resolveDirectionalClip(archetype.animation!, clips, clip, dir).clip,
              ))
          expect(playable, `${ref}: state "${state}" needs a playable clip "${clip}"`).toBe(true)
        }
      }
    })

    it('derives a coherent palette: one piece per prefab, matching categories', () => {
      expect(archetype.palette).toHaveLength(Object.keys(archetype.prefabs).length)
      for (const template of archetype.palette) {
        const made = template.make()
        expect(made.prefab, template.label).toBeTruthy()
        const prefab = archetype.prefabs[made.prefab!]
        expect(prefab, template.label).toBeDefined()
        expect(template.category, template.label).toBe(prefab!.type)
        expect(template.icon, template.label).toBeTruthy()
      }
    })

    it('icons only components its registry knows', () => {
      for (const component of Object.keys(archetype.entityIcons)) {
        expect(archetype.registry.components[component], component).toBeDefined()
      }
    })

    it('bundles every role its prefabs ask for', () => {
      for (const [ref, prefab] of Object.entries(archetype.prefabs)) {
        const machine = prefab.components.find((c) => c.type === 'StateMachine')
        if (!machine) continue
        const { role } = (machine.props ?? {}) as StateMachineProps
        if (!role) continue
        expect(archetype.bundle.roles[role], `${ref} role "${role}"`).toBeDefined()
      }
    })

    it('ships a real asset file for every art row', async () => {
      const known = knownArchetype(id)
      expect(known, `${id} must have a KNOWN_ARCHETYPES row`).toBeDefined()
      for (const art of archetype.art) {
        const file = fileURLToPath(
          new URL(`../../${known!.directory}/assets/${art.file}`, import.meta.url),
        )
        await expect(access(file), art.file).resolves.toBeUndefined()
        expect(archetype.artUrls[art.file], art.file).toBeTruthy()
      }
    })

    it('follows the package-name convention the tooling relies on', () => {
      const known = knownArchetype(id)
      expect(known, `${id} must have a KNOWN_ARCHETYPES row`).toBeDefined()
      expect(archetypePackageName(id)).toBe(known!.packageName)
    })
  },
)
