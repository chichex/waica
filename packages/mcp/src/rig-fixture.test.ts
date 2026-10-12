import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { clipNamesOf, parseGlbDocument, skinsOf } from './glb-document.js'
import { defined } from '../../engine/src/test-support.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.resolve(here, '../../engine/fixtures/rig.glb')
const SCRIPT = path.resolve(here, '../../../scripts/generate-rig-fixture.mjs')

const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))

describe('packages/engine/fixtures/rig.glb (issue #166 CA-5)', () => {
  it('is byte-identical to what scripts/generate-rig-fixture.mjs writes, and under 20 kB', async () => {
    const out = await mkdtemp(path.join(os.tmpdir(), 'waica-rig-'))
    roots.push(out)
    const target = path.join(out, 'rig.glb')

    execFileSync(process.execPath, [SCRIPT, target], { stdio: 'pipe' })

    const committed = await readFile(FIXTURE)
    expect(committed.length).toBeLessThan(20 * 1024)
    expect(Buffer.compare(committed, await readFile(target))).toBe(0)
  })

  it('holds one skin of three joints named root, leg.L and leg.R, one skinned mesh and the clips idle, walk and jump, self-contained', async () => {
    const document = defined(parseGlbDocument(new Uint8Array(await readFile(FIXTURE))), 'a glb')

    expect(skinsOf(document)).toEqual([{ joints: 3 }])
    const nodes = document.nodes as Array<{ name?: string; mesh?: number; skin?: number }>
    const skin = (document.skins as Array<{ joints: number[] }>)[0]
    expect(defined(skin).joints.map((joint) => nodes[joint]?.name)).toEqual(['root', 'leg.L', 'leg.R'])
    expect(nodes.filter((node) => node.mesh !== undefined && node.skin !== undefined)).toHaveLength(1)
    expect(clipNamesOf(document)).toEqual(['idle', 'walk', 'jump'])
    const uris = [...(document.buffers as Array<{ uri?: string }>), ...((document.images as Array<{ uri?: string }> | undefined) ?? [])]
    expect(uris.every((entry) => entry.uri === undefined)).toBe(true)
  })
})
