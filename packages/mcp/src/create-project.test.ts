import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { projectArtFiles, projectFiles } from '../../editor/src/project/template.js'
import { createProject } from './create-project.js'
import { cleanup, readJson, tempDir, writeTree } from './test-helpers.js'

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

async function filesBelow(root: string, at = root): Promise<string[]> {
  const entries = await readdir(at, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(at, entry.name)
      return entry.isDirectory() ? filesBelow(root, target) : [path.relative(root, target)]
    }),
  )
  return nested.flat().sort()
}

async function textTree(root: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const relative of await filesBelow(root)) {
    if (relative.endsWith('.png')) continue
    out[relative] = await readFile(path.join(root, relative), 'utf8')
  }
  return out
}

// The editor and the server derive the @waica range from the same file, so the
// expectation reads it too rather than pinning a number every release invalidates.
async function expectedEditorFiles(
  name: string,
  start: 'demo' | 'blank',
): Promise<Record<string, string>> {
  const { version } = await readJson<{ version: string }>(
    path.resolve(import.meta.dirname, '../../engine/package.json'),
  )
  const expected = projectFiles(name, start)
  const pkg = JSON.parse(expected['package.json'] ?? '{}') as {
    dependencies: Record<string, string>
  }
  for (const dependency of Object.keys(pkg.dependencies)) pkg.dependencies[dependency] = `^${version}`
  expected['package.json'] = JSON.stringify(pkg, null, 2) + '\n'
  return expected
}

describe('createProject', () => {
  it('creates the demo byte-for-byte like the editor and copies manifest art', async () => {
    const parent = await tempDir()
    roots.push(parent)
    const target = path.join(parent, 'agent-game')

    const result = await createProject(target)
    const enginePackage = await readJson<{ version: string }>(
      path.resolve(import.meta.dirname, '../../engine/package.json'),
    )

    expect(await textTree(target)).toEqual(await expectedEditorFiles('agent-game', 'demo'))
    const artPaths = (await filesBelow(target)).filter((file) => file.endsWith('.png'))
    expect(artPaths).toEqual(Object.keys(projectArtFiles()).sort())
    for (const relative of artPaths) {
      const source = path.resolve(
        import.meta.dirname,
        '../../archetype-platformer/assets',
        path.basename(relative),
      )
      expect(await readFile(path.join(target, relative))).toEqual(await readFile(source))
    }

    for (const relative of (await filesBelow(target)).filter((file) => file.endsWith('.json'))) {
      const text = await readFile(path.join(target, relative), 'utf8')
      for (const match of text.matchAll(/src\/art\/[A-Za-z0-9._-]+/g)) {
        expect((await stat(path.join(target, match[0]))).isFile()).toBe(true)
      }
    }
    expect(result).toMatchObject({
      projectPath: target,
      name: 'agent-game',
      start: 'demo',
      provenance: [
        { package: '@waica/engine', version: enginePackage.version, source: 'bundled' },
        { package: '@waica/behaviors', source: 'bundled' },
        { package: '@waica/archetype-platformer', source: 'bundled' },
      ],
    })
    expect(result.nextSteps).toContain('cd agent-game')
    expect(result.nextSteps).toContain('npm install')
    expect(result.nextSteps).toContain('npm run dev')
  })

  it('creates only the exact 12-file chassis for a blank start', async () => {
    const parent = await tempDir()
    roots.push(parent)
    const target = path.join(parent, 'blank-game')

    await createProject(target, 'blank')

    expect(await filesBelow(target)).toEqual(Object.keys(projectFiles('blank-game', 'blank')).sort())
    expect(await textTree(target)).toEqual(await expectedEditorFiles('blank-game', 'blank'))
  })

  it('accepts an existing empty directory', async () => {
    const parent = await tempDir()
    roots.push(parent)
    const target = path.join(parent, 'empty-game')
    await mkdir(target)
    await createProject(target, 'blank')
    expect(await filesBelow(target)).toHaveLength(12)
  })

  it('rejects an unknown archetype id and writes nothing', async () => {
    const parent = await tempDir()
    roots.push(parent)
    const target = path.join(parent, 'banana-game')
    await expect(createProject(target, 'demo', 'banana')).rejects.toThrow(
      'Unknown archetype "banana"',
    )
    await expect(stat(target)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('creates the same demo project when the archetype is passed explicitly', async () => {
    const parent = await tempDir()
    roots.push(parent)
    const target = path.join(parent, 'explicit-game')
    await createProject(target, 'blank', 'platformer')
    expect(await textTree(target)).toEqual(await expectedEditorFiles('explicit-game', 'blank'))
  })

  it('rejects an invalid basename before creating anything', async () => {
    const parent = await tempDir()
    roots.push(parent)
    const target = path.join(parent, 'Bad Game')
    await expect(createProject(target)).rejects.toThrow(/^[\s\S]*name.*\^?\[a-z0-9\]/i)
    await expect(stat(target)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects a missing parent and names it without recursively creating it', async () => {
    const parent = await tempDir()
    roots.push(parent)
    const missingParent = path.join(parent, 'missing')
    const target = path.join(missingParent, 'game')
    await expect(createProject(target)).rejects.toThrow(missingParent)
    await expect(stat(missingParent)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects a file target', async () => {
    const parent = await tempDir()
    roots.push(parent)
    const target = path.join(parent, 'game')
    await writeFile(target, 'keep me')
    await expect(createProject(target)).rejects.toThrow(/file/i)
    expect(await readFile(target, 'utf8')).toBe('keep me')
  })

  it('lists a non-empty target and writes nothing', async () => {
    const parent = await tempDir()
    roots.push(parent)
    const target = path.join(parent, 'occupied-game')
    await mkdir(target)
    await writeTree(target, { 'keep.txt': 'keep', 'also.txt': 'also' })
    await expect(createProject(target)).rejects.toThrow(/also\.txt.*keep\.txt|keep\.txt.*also\.txt/)
    expect(await filesBelow(target)).toEqual(['also.txt', 'keep.txt'])
  })
})
