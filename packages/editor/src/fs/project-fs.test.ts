import { describe, expect, it } from 'vitest'
import { RealFS, type TreeNode } from './project-fs'

type FakeEntry = FakeDirectory | { kind: 'file' }

/** The slice of a FileSystemDirectoryHandle that RealFS.tree() walks. */
class FakeDirectory {
  readonly kind = 'directory'
  constructor(private readonly children: Record<string, FakeEntry>) {}

  async *entries(): AsyncGenerator<[string, FakeEntry]> {
    for (const entry of Object.entries(this.children)) yield await Promise.resolve(entry)
  }
}

function paths(nodes: TreeNode[]): string[] {
  return nodes.flatMap((node) => [node.path, ...paths(node.children ?? [])])
}

describe('RealFS.tree() skips what a waica Project ignores (review of #215)', () => {
  it("leaves out the root export/ that `waica export desktop` writes, like node_modules, but keeps a src/export/", async () => {
    const file = { kind: 'file' } as const
    const root = new FakeDirectory({
      'package.json': file,
      node_modules: new FakeDirectory({ vite: new FakeDirectory({}) }),
      export: new FakeDirectory({ 'game-linux-x64': new FakeDirectory({ game: file }), 'game-linux-x64.zip': file }),
      src: new FakeDirectory({ 'game.json': file, export: new FakeDirectory({ 'save.ts': file }) }),
    })
    // The fake covers exactly what tree() reads: kind and entries().
    const fs = new RealFS('game', root as unknown as FileSystemDirectoryHandle)
    expect(paths(await fs.tree()).sort()).toEqual(['package.json', 'src', 'src/export', 'src/export/save.ts', 'src/game.json'])
  })
})
