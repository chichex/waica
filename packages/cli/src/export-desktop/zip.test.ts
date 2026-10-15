import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanupTemp, tempDir, zipEntries } from './test-export.js'
import { zipDirectory } from './zip.js'

afterEach(cleanupTemp)

const S_IFMT = 0o170000
const S_IFLNK = 0o120000
const S_IFDIR = 0o040000

describe('zipDirectory (issue #200 CA-12, inference 9)', () => {
  it("keeps a macOS .app's symlinks as symlink entries and the executable bit", async () => {
    const root = await tempDir()
    const folder = path.join(root, 'game-darwin-arm64')
    const versions = path.join(folder, 'game.app', 'Contents', 'Frameworks', 'Electron Framework.framework', 'Versions')
    await mkdir(path.join(versions, 'A'), { recursive: true })
    await symlink('A', path.join(versions, 'Current'))
    await mkdir(path.join(folder, 'game.app', 'Contents', 'MacOS'), { recursive: true })
    await writeFile(path.join(folder, 'game.app', 'Contents', 'MacOS', 'game'), '#!/bin/sh\n', { mode: 0o755 })
    await zipDirectory(folder, path.join(root, 'game.zip'))

    const entries = new Map(zipEntries(await readFile(path.join(root, 'game.zip'))).map((entry) => [entry.name, entry.mode]))
    const link = entries.get('game-darwin-arm64/game.app/Contents/Frameworks/Electron Framework.framework/Versions/Current')
    expect((link ?? 0) & S_IFMT).toBe(S_IFLNK)
    expect((entries.get('game-darwin-arm64/game.app/Contents/MacOS/game') ?? 0) & 0o111).toBe(0o111)
    expect((entries.get('game-darwin-arm64/') ?? 0) & S_IFMT).toBe(S_IFDIR)
  })
})
