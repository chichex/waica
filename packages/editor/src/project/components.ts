import type { ProjectFS } from '../fs/project-fs'

export const COMPONENTS_DIR = 'src/components'

function nameWords(name: string): string[] {
  return name
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
}

/**
 * Names the template cannot emit: the generated file imports `Component`
 * from the engine, so `class Component extends Component` would neither
 * parse nor typecheck — and the never-overwrite rule would make it
 * unrepairable from the editor.
 */
const RESERVED_CLASS_NAMES = new Set(['Component'])

/** Stable class name generated from the name entered in the editor. */
export function componentClassName(name: string): string {
  const words = nameWords(name)
  const value = words.map((word) => word[0]?.toUpperCase() + word.slice(1)).join('')
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(value)) {
    throw new Error('Component names must start with a letter and use letters or numbers.')
  }
  if (RESERVED_CLASS_NAMES.has(value)) {
    throw new Error(`"${value}" is the engine base class — pick another name.`)
  }
  return value
}

/** Project path for one component source file. */
export function componentFilePath(name: string): string {
  const words = nameWords(name)
  // Validate through the class form too, so a path can never be scaffolded for
  // a name that would produce invalid TypeScript.
  componentClassName(name)
  return `${COMPONENTS_DIR}/${words.map((word) => word.toLowerCase()).join('-')}.ts`
}

/** Basenames (gun.ts) of the project's component code files. */
export async function listComponentFiles(fs: ProjectFS): Promise<string[]> {
  const tree = await fs.tree()
  const src = tree.find((node) => node.kind === 'dir' && node.name === 'src')
  const folder = src?.children?.find(
    (node) => node.kind === 'dir' && node.name === 'components',
  )
  return (folder?.children ?? [])
    .filter((node) => node.kind === 'file' && node.name.endsWith('.ts'))
    .map((node) => node.name)
}

/** Starter source for a custom behavior, editable immediately in Monaco. */
export function componentFileTemplate(name: string): string {
  const Class = componentClassName(name)
  return `import { Component } from '@waica/engine'

// Project-owned behavior — loaded by the shipped game and editor Play.
export class ${Class} extends Component {
  static override componentName = '${Class}'
  static override params = {
    speed: { label: 'Speed', min: 0, max: 30, step: 0.5 },
  }

  speed = 5

  override onUpdate(dt: number): void {
    // Add this component's per-frame behavior here.
    void dt
  }
}
`
}

/** Writes a starter only when its destination does not already exist. */
export async function scaffoldComponentFile(
  fs: ProjectFS,
  name: string,
): Promise<{ path: string; created: boolean }> {
  const path = componentFilePath(name)
  if ((await fs.readText(path)) != null) return { path, created: false }
  await fs.writeText(path, componentFileTemplate(name))
  return { path, created: true }
}
