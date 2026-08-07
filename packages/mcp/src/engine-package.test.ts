import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../../..')
const packageRoot = path.join(root, 'packages/engine')

async function text(file: string): Promise<string> {
  return readFile(file, 'utf8')
}

describe('@waica/engine package contract', () => {
  it('ships a README that documents the complete component update contract', async () => {
    const readme = await text(path.join(packageRoot, 'README.md'))

    expect(readme).toMatch(/onReady[\s\S]*onUpdate[\s\S]*collision[\s\S]*onDestroy/i)
    expect(readme).toContain('updateAfter')
    expect(readme).toMatch(/when.*present|co-presen/i)
    expect(readme).toMatch(/Unicode code-unit/i)
    expect(readme).toMatch(/Invalid schedules fail closed/i)
    expect(readme).toMatch(/class .+ extends Component[\s\S]*updateAfter/s)
  })

  it('is linked from the root README and reconciles the Health ADR with deterministic scheduling', async () => {
    const rootReadme = await text(path.join(root, 'README.md'))
    const healthAdr = await text(path.join(root, 'docs/adr/0003-health-is-the-damage-model.md'))

    expect(rootReadme).toContain('[`@waica/engine`](./packages/engine/README.md)')
    expect(healthAdr).not.toContain('component update order is prefab-authored')
    expect(healthAdr).toMatch(/first eligible update[\s\S]*StateMachine/i)
  })

  it('publishes the README without changing the engine dependency set', async () => {
    const manifest = JSON.parse(await text(path.join(packageRoot, 'package.json'))) as {
      files: string[]
      dependencies: Record<string, string>
    }

    expect(manifest.files).toEqual(['dist', 'README.md'])
    expect(Object.keys(manifest.dependencies).sort()).toEqual(['@types/three', 'three'])
  })
})
