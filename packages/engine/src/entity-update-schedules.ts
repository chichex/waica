import type { Component, ComponentClass } from './component.js'
import { componentClassOf } from './component-registry.js'
import { implementsOnUpdate, resolveComponentUpdateSchedule } from './component-update-schedule.js'
import type { Entity } from './entity.js'

/** Maps a resolved update order back to the entity's components; the order only names components it was built from. */
function componentsInOrder(order: readonly string[], byName: ReadonlyMap<string, Component>): Component[] {
  return order.map((name) => {
    const component = byName.get(name)
    if (!component) throw new Error(`Component update schedule names "${name}", which is not on the entity`)
    return component
  })
}

/**
 * Each entity's Component Update Schedule (ADR 0004), as the Game runs it once
 * per Simulation Step: resolved from the entity's composition, cached per
 * composition signature, and reported once per invalid composition.
 */
export class EntityUpdateSchedules {
  private readonly invalidCompositions = new WeakMap<Entity, string>()
  /**
   * The resolved order for the last composition signature seen per entity:
   * the resolve (Tarjan SCC + Kahn sort) it's built from is pure for a fixed
   * composition, so a signature match skips it entirely. Only ever holds a
   * successful resolution — an invalid composition is never cached, since
   * invalidCompositions already dedupes its console.error.
   */
  private readonly cache = new WeakMap<Entity, { signature: string; order: readonly string[] }>()

  /** The entity's components in update order, or null (reported once) when its composition is invalid. */
  of(entity: Entity, registered: Readonly<Record<string, ComponentClass>> = {}): Component[] | null {
    const components = [...entity.components]
    const byName = new Map<string, Component>()
    const names: string[] = []
    const signatureParts: string[] = []
    for (const component of components) {
      const Class = componentClassOf(component)
      const name = Class.componentName
      names.push(name)
      byName.set(name, component)
      signatureParts.push(
        `${name}:${implementsOnUpdate(Class) ? 'updates' : 'passive'}:` +
          [...new Set(Class.updateAfter ?? [])].sort().join(','),
      )
    }
    const signature = signatureParts.sort().join('|')
    const cached = this.cache.get(entity)
    if (cached && cached.signature === signature) return componentsInOrder(cached.order, byName)
    return this.resolve(entity, { components, names, byName, signature }, registered)
  }

  private resolve(
    entity: Entity,
    composition: { components: Component[]; names: string[]; byName: Map<string, Component>; signature: string },
    registered: Readonly<Record<string, ComponentClass>>,
  ): Component[] | null {
    const registry: Record<string, ComponentClass> = { ...registered }
    for (const component of composition.components) {
      const Class = componentClassOf(component)
      registry[Class.componentName] = Class
    }
    const result = resolveComponentUpdateSchedule(composition.names, registry)
    if (!result.ok) {
      this.cache.delete(entity)
      if (this.invalidCompositions.get(entity) !== composition.signature) {
        this.invalidCompositions.set(entity, composition.signature)
        console.error(
          `[waica] invalid component update schedule for "${entity.name}": ` +
            result.issues.map((issue) => issue.cause).join(' '),
        )
      }
      return null
    }
    this.invalidCompositions.delete(entity)
    this.cache.set(entity, { signature: composition.signature, order: result.order })
    return componentsInOrder(result.order, composition.byName)
  }
}
