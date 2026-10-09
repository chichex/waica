import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { fallbackEntriesFor } from './project-component-fallbacks.js'
import { cleanup, makeProject } from './test-helpers.js'
import { validateProject } from './validation.js'

// A checkout without built @waica dists compiles the package sources once per
// process before its first project-component load (project-component-fallbacks.ts).
beforeAll(() => fallbackEntriesFor('project-component-runner.ts'), 120_000)

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

async function gltfFindings(files: Record<string, string | Uint8Array>) {
  const project = await makeProject(files)
  roots.push(project)
  const result = await validateProject(project)
  return result.findings.filter((finding) => finding.code === 'gltf-external-resource')
}

const gltf = (body: Record<string, unknown>): string => JSON.stringify({ asset: { version: '2.0' }, ...body })
const EMBEDDED = 'data:application/octet-stream;base64,AAAA'

describe('a .gltf with external resources (issue #154 CA-15)', () => {
  it('warns that an external .bin buffer and external textures will not load', async () => {
    const findings = await gltfFindings({
      'src/art/tree.gltf': gltf({ buffers: [{ uri: 'tree.bin', byteLength: 4 }], images: [{ uri: 'bark.png' }, { uri: EMBEDDED }] }),
    })
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ severity: 'warning', code: 'gltf-external-resource', file: 'src/art/tree.gltf' })
    expect(findings[0]?.message).toContain('"tree.bin"')
    expect(findings[0]?.message).toContain('"bark.png"')
    expect(findings[0]?.message).not.toContain(EMBEDDED)
    expect(findings[0]?.message).toMatch(/\.glb/)
  })

  it('stays quiet for a self-contained .gltf (every uri a data: uri), a .glb and a .gltf with no uris', async () => {
    expect(
      await gltfFindings({
        'src/art/rock.gltf': gltf({ buffers: [{ uri: EMBEDDED, byteLength: 4 }], images: [{ uri: 'data:image/png;base64,AAAA' }] }),
        'src/art/tree.glb': new Uint8Array([0x67, 0x6c, 0x54, 0x46]),
        'src/art/bare.gltf': gltf({}),
        'src/art/glb-buffer.gltf': gltf({ buffers: [{ byteLength: 4 }], images: [{ bufferView: 0 }] }),
      }),
    ).toEqual([])
  })

  it('does not choke on a .gltf that is not JSON or has odd shapes', async () => {
    expect(
      await gltfFindings({
        'src/art/broken.gltf': 'not json at all',
        'src/art/odd.gltf': gltf({ buffers: 'nope', images: [null, 7, { uri: 3 }] }),
      }),
    ).toEqual([])
  })

  it('checks only the .gltf files the generated project can resolve: directly under src/art', async () => {
    expect(await gltfFindings({ 'src/art/models/deep.gltf': gltf({ buffers: [{ uri: 'deep.bin' }] }) })).toEqual([])
  })
})
