// The source scan behind unknown-achievement-id (review of PR #217): only a
// missing src/ means "no files", and a cancelled validate_project stops it.
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { desktopFindings } from './desktop-validation.js'
import { cleanup, tempDir } from './test-helpers.js'

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

async function root(): Promise<string> {
  const dir = await tempDir()
  roots.push(dir)
  return dir
}

describe('the achievement id scan (review of #217)', () => {
  it('treats a Project without src/ as having no sources', async () => {
    await expect(desktopFindings(await root(), { desktop: {} })).resolves.toEqual([])
  })

  it('fails on a src/ it cannot read instead of passing in silence', async () => {
    const dir = await root()
    await writeFile(path.join(dir, 'src'), 'not a directory')
    await expect(desktopFindings(dir, { desktop: {} })).rejects.toMatchObject({ code: 'ENOTDIR' })
  })

  it('stops when validate_project is cancelled', async () => {
    const dir = await root()
    await mkdir(path.join(dir, 'src'))
    await writeFile(path.join(dir, 'src/score.ts'), "game.achievements.unlock('a')")
    const controller = new AbortController()
    controller.abort()
    await expect(desktopFindings(dir, { desktop: {} }, controller.signal)).rejects.toThrow(/abort/i)
  })
})
