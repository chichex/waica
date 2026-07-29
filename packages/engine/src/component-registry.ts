import { Component, type ComponentClass } from './component'
import type { SceneRegistry } from './scene'

/** The namespace returned by importing one project code module. */
export type ComponentModule = Readonly<Record<string, unknown>>

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
      if (typeof value !== 'function') continue
      const Class = value as unknown as ComponentClass
      if (!(Class.prototype instanceof Component)) continue
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
