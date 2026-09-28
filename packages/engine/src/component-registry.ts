import { Component, type ComponentClass } from './component.js'
import type { SceneRegistry } from './scene.js'

/** The namespace returned by importing one project code module. */
export type ComponentModule = Readonly<Record<string, unknown>>

/** Whether `value` is a class that extends Component (the abstract base itself is not). */
export function isComponentClass(value: unknown): value is ComponentClass {
  if (typeof value !== 'function') return false
  const prototype: unknown = Reflect.get(value, 'prototype')
  return prototype instanceof Component
}

/**
 * The class a live component was constructed from. TypeScript types
 * `constructor` as Function; this narrows it for real instead of asserting.
 * Internal: not re-exported from the package entry.
 */
export function componentClassOf(component: Component): ComponentClass {
  const Class: unknown = component.constructor
  if (!isComponentClass(Class)) {
    throw new TypeError('a component was not constructed from a Component class')
  }
  return Class
}

/**
 * Finds exported Component subclasses in project modules. Classes are keyed by
 * their stable componentName, not by the export name, so minification and
 * default exports do not change scene JSON.
 */
export function collectModuleComponents(
  modules: Iterable<ComponentModule>,
  warn: (message: string) => void = console.warn,
): Record<string, ComponentClass> {
  const components: Record<string, ComponentClass> = {}
  for (const module of modules) {
    for (const value of Object.values(module)) {
      if (!isComponentClass(value)) continue
      const Class = value
      // Without its own componentName a class inherits the base's, so nothing
      // could reference it from scene JSON. Silently skipping it looks like
      // the editor lost the file: say so instead.
      if (typeof Class.componentName !== 'string' || Class.componentName === 'Component') {
        warn(
          `[waica] component class "${Class.name || '(anonymous)'}" declares no ` +
            `static componentName — scenes cannot reference it`,
        )
        continue
      }
      components[Class.componentName] = Class
    }
  }
  return components
}

/**
 * Adds project-owned component classes to a registry. Project code is the
 * extension layer, so it deliberately wins a stable-name collision while
 * making that shadowing visible to the host.
 */
export function mergeRegistryComponents(
  registry: SceneRegistry,
  project: Readonly<Record<string, ComponentClass>>,
  warn: (message: string) => void = console.warn,
): SceneRegistry {
  for (const name of Object.keys(project)) {
    if (registry.components[name]) {
      warn(`[waica] project component "${name}" shadows registry component "${name}"`)
    }
  }
  return {
    ...registry,
    components: { ...registry.components, ...project },
  }
}
