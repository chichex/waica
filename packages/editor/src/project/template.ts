// The project template: the chassis files a fresh project starts from
// (?raw imports from ../../template) + the archetype's default scene.
import pkgTpl from '../../template/package.json.tpl?raw'
import indexHtml from '../../template/index.html?raw'
import mainTs from '../../template/src/main.ts?raw'
import controlsJson from '../../template/src/controls.json?raw'
import statsJson from '../../template/src/stats.json?raw'
import gameJson from '../../template/src/game.json?raw'
import tsconfigJson from '../../template/tsconfig.json?raw'
import viteConfigTs from '../../template/vite.config.ts?raw'
import readmeMd from '../../template/README.md?raw'
import gitignore from '../../template/_gitignore?raw'
import { sceneArchetypeNeeds } from '@waica/engine'
import { archetypePackageName, resolveArchetype, type ArchetypeManifest } from './archetype'
import enginePackage from '../../../engine/package.json'
import { readJsonObject } from '../json-object'

// The @waica/* range a fresh project depends on, read from the engine rather
// than written down here: the published libraries move in lockstep, so the
// version that ships is the one the generated package.json must ask npm for.
// packages/mcp/src/create-project.ts derives the same number the same way.
const WAICA_VERSION = enginePackage.version

/** How a new project starts: the archetype's demo level, or just the chassis. */
export type ProjectStart = 'demo' | 'blank'

// Demo projects own their art as files, so their JSON references the file
// path ('src/art/waica-dog.png'), never the registry URI ('waica:dog').
function projectUriMap(archetype: ArchetypeManifest): Record<string, string> {
  return Object.fromEntries(
    archetype.art.map((art) => [art.uri, `src/art/${art.file}`]),
  )
}

/** Serializes scene/prefab JSON, mapping stock-art URIs to project paths. */
function projectJson(value: unknown, archetype: ArchetypeManifest): string {
  const uriToPath = projectUriMap(archetype)
  const json = JSON.stringify(
    value,
    (_key, v: unknown) => (typeof v === 'string' ? (uriToPath[v] ?? v) : v),
    2,
  )
  return json + '\n'
}

/**
 * The archetype's music uri, rewritten to this project's own src/art/ copy —
 * the same rewrite scene and prefab sound props already get, applied to the
 * one manifest field that lives outside any JSON file. Empty for a blank
 * start (no art copied) or an archetype with no music, so main.ts's
 * `musicOverride ?? ARCHETYPE.music` falls back to the archetype's own
 * "waica:" uri exactly as before.
 */
function musicOverride(start: ProjectStart, archetype: ArchetypeManifest): string {
  if (start !== 'demo' || !archetype.music) return ''
  return projectUriMap(archetype)[archetype.music] ?? ''
}

/**
 * Source text for main.ts's `const musicOverride: string | undefined = ...`
 * — the bare word `undefined`, or a quoted path, never a plain '' literal:
 * an empty-string constant on one side of `??` trips TypeScript's "always
 * truthy/falsy" checks (TS2872/TS2873) once substituted in, which `undefined`
 * against a `string | undefined` annotation does not.
 */
function musicOverrideLiteral(start: ProjectStart, archetype: ArchetypeManifest): string {
  const path = musicOverride(start, archetype)
  return path ? `'${path}'` : 'undefined'
}

/**
 * Binary companions to projectFiles(): art to materialize, path → fetchable
 * URL (the archetype's bundled asset). A blank project gets only the art its
 * blank scene uses — none, unless the scene is not empty (issue #181).
 */
export function projectArtFiles(
  start: ProjectStart = 'demo',
  archetypeId = 'platformer',
): Record<string, string> {
  const archetype = resolveArchetype(archetypeId)
  const used = start === 'blank' ? new Set(sceneArchetypeNeeds(archetype, archetype.blankScene).art) : null
  return Object.fromEntries(
    archetype.art
      .filter((art) => !used || used.has(art.file))
      .map((art) => [`src/art/${art.file}`, archetype.artUrls[art.file] ?? art.uri]),
  )
}

/** The prefab and UI files a blank scene uses, so a blank project of a non-empty blank scene still runs it (issue #181). */
function blankSceneFiles(archetype: ArchetypeManifest): Record<string, string> {
  const needs = sceneArchetypeNeeds(archetype, archetype.blankScene)
  const files: Record<string, string> = {}
  for (const ref of needs.prefabs) {
    const prefab = archetype.prefabs[ref]
    if (prefab) files[`src/${ref}.${prefab.type}.json`] = projectJson(prefab, archetype)
  }
  for (const name of needs.ui) files[`src/ui/${name}.html`] = archetype.registry.ui?.[name] ?? ''
  return files
}

/** Files for a fresh waica project, resolved from the picked archetype. */
/** A bundled template JSON file; a non-object means the template itself is broken. */
function templateObject(text: string, file: string): Record<string, unknown> {
  const json = readJsonObject(text)
  if (!json) throw new Error(`the project template's ${file} is not a JSON object`)
  return json
}

export function projectFiles(
  name: string,
  start: ProjectStart = 'demo',
  archetypeId = 'platformer',
): Record<string, string> {
  const archetype = resolveArchetype(archetypeId)
  const scene = start === 'demo' ? archetype.scene : archetype.blankScene
  const game = { ...templateObject(gameJson, 'game.json'), archetype: archetype.id }
  const controls = {
    ...templateObject(controlsJson, 'controls.json'),
    bindings: archetype.bindings,
  }
  const archetypePackage = archetypePackageName(archetype.id)
  const files: Record<string, string> = {
    'package.json': pkgTpl
      .replaceAll('__PROJECT_NAME__', name)
      .replaceAll('__WAICA_VERSION__', WAICA_VERSION)
      .replaceAll('__ARCHETYPE_PACKAGE__', archetypePackage),
    'index.html': indexHtml,
    'tsconfig.json': tsconfigJson,
    'vite.config.ts': viteConfigTs,
    'README.md': readmeMd,
    '.gitignore': gitignore,
    'src/main.ts': mainTs
      .replaceAll('__ARCHETYPE_PACKAGE__', archetypePackage)
      .replaceAll('__MUSIC_URI__', musicOverrideLiteral(start, archetype)),
    'src/controls.json': JSON.stringify(controls, null, 2) + '\n',
    'src/stats.json': statsJson,
    'src/game.json': JSON.stringify(game, null, 2) + '\n',
    'src/scenes/main.scene.json': projectJson(scene, archetype),
    'public/waica.params.json': '{}\n',
  }
  // A blank project ships only the chassis and what its blank scene uses: for
  // most archetypes the scene is empty, so no prefab, UI or art files. It
  // starts with nothing because it HAS nothing — no archetype default
  // resolves behind the editor's back. The third-person blank scene holds the
  // playable Knight (issue #181), so its prefab, HUD and art come along.
  if (start === 'blank') return { ...files, ...blankSceneFiles(archetype) }
  // Additional demo scenes beyond "main" (CA-13): one file per entry, the
  // same as packages/mcp/src/create-project.ts's chassisFiles().
  for (const [sceneName, extra] of Object.entries(archetype.extraScenes ?? {})) {
    files[`src/scenes/${sceneName}.scene.json`] = projectJson(extra, archetype)
  }
  // One file per prefab, mirroring its ref: 'characters/slime' (type
  // 'character') → src/characters/slime.character.json. scripts/sync-scene.mjs
  // materializes the same layout into the wizard template and the repo example.
  for (const [key, prefab] of Object.entries(archetype.prefabs)) {
    files[`src/${key}.${prefab.type}.json`] = projectJson(prefab, archetype)
  }
  // UI pieces are plain HTML files: presentation only, toggled from code.
  for (const [name, html] of Object.entries(archetype.registry.ui ?? {})) {
    files[`src/ui/${name}.html`] = html
  }
  return files
}
