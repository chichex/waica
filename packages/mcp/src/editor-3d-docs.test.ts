import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../../..')
const text = (file: string): Promise<string> => readFile(path.join(root, file), 'utf8')

/** One bullet of the engine README's 3D scenes section, by its bold lead. */
async function bulletOf(name: string): Promise<string> {
  const readme = await text('packages/engine/README.md')
  const scenes = readme.slice(readme.indexOf('## 3D scenes'))
  const start = scenes.indexOf(`- **${name}.**`)
  expect(start, name).toBeGreaterThanOrEqual(0)
  return scenes.slice(start, scenes.indexOf('\n', start))
}

describe('the 3D editor docs (issue #173 CA-25)', () => {
  it('records the decision in ADR 0030, which supersedes ADR 0027 in part', async () => {
    const adr = await text('docs/adr/0030-the-editor-edits-3d-scenes-through-its-own-view-camera.md')
    expect(adr).toMatch(/^# The editor edits 3D scenes through its own view camera\n/)
    for (const topic of [/setViewCamera/, /sceneCamera/, /raycastPick/, /TransformControls/, /OrbitControls/, /read-only clause is superseded/]) {
      expect(adr, String(topic)).toMatch(topic)
    }
    const superseded = await text('docs/adr/0027-a-scene-declares-its-space.md')
    expect(superseded).toMatch(/^> Superseded in part by \[ADR 0030\]\(\.\/0030-the-editor-edits-3d-scenes-through-its-own-view-camera\.md\)/m)
  })

  it('defines the Editor Camera in the glossary', async () => {
    expect(await text('CONTEXT.md')).toMatch(/\*\*Editor Camera\*\*:\n[^\n]*setViewCamera[^\n]*\n_Avoid_: [^\n]+/)
  })

  it("rewrites the README's Editor bullet and adds the migration note naming the three seams", async () => {
    const editor = await bulletOf('Editor')
    expect(editor).toContain('Editor Camera (ADR 0030)')
    expect(editor).not.toContain('read-only')
    for (const seam of ['setViewCamera', 'raycastPick', 'TransformControls', 'glbClipNames']) expect(editor, seam).toContain(seam)
    const readme = await text('packages/engine/README.md')
    // Anchored on the note's subject, not on the version the release may rename.
    expect(readme).toMatch(/## Migrating to [^\n]*3D editor[\s\S]*`raycastPick\(camera, at, entities, extra\?\)`[\s\S]*`glbClipNames\(bytes\)`[\s\S]*`CameraRig\.setViewCamera\(camera \| null\)` and `CameraRig\.sceneCamera`/)
  })
})
