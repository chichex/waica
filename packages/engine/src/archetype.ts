import type { InputBindings } from './input.js'
import type { PrefabJson, SceneEntityJson, SceneJson, SceneRegistry } from './scene.js'
import type { ArchetypeBundle } from './state/hooks.js'

/** One entity template exposed in an archetype's editor palette. */
export interface EntityTemplate {
  label: string
  icon: string
  category: PrefabJson['type']
  /** Builds the JSON for a new instance (no position; the editor sets it). */
  make: () => SceneEntityJson
}

/** One stock-art file shipped by an archetype package. */
export interface ArchetypeArt {
  /** File name under the archetype's assets/ and a demo project's src/art/. */
  file: string
  /** Registry URI resolved by the archetype at runtime. */
  uri: string
}

/** The conventional contract exported by every archetype package. */
export interface ArchetypeManifest {
  id: string
  label: string
  scene: SceneJson
  blankScene: SceneJson
  registry: SceneRegistry
  palette: EntityTemplate[]
  prefabs: Record<string, PrefabJson>
  art: ArchetypeArt[]
  entityIcons: Readonly<Record<string, string>>
  bindings: Readonly<InputBindings>
  actionLabels: Readonly<Record<string, string>>
  bundle: ArchetypeBundle
}

/** Browser manifest enriched with URLs produced by an asset-aware bundler. */
export interface BrowserArchetypeManifest extends ArchetypeManifest {
  artUrls: Readonly<Record<string, string>>
}

type AssertArchetypeManifest<T extends ArchetypeManifest> = T

// Type-only fixture: checked by tsc and erased completely from the engine dist.
type _ArchetypeManifestTypeFixture = AssertArchetypeManifest<{
  id: 'fixture'
  label: 'Fixture'
  scene: { waicaScene: 3; entities: [] }
  blankScene: { waicaScene: 3; entities: [] }
  registry: { components: {} }
  palette: []
  prefabs: {}
  art: []
  entityIcons: {}
  bindings: {}
  actionLabels: {}
  bundle: { roles: {} }
}>
