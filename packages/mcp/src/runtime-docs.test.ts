import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../../..')
const tools = [
  'create_project',
  'list_components',
  'describe_archetype',
  'project_summary',
  'validate_project',
  'scaffold_component',
  'scaffold_prefab',
  'scaffold_role',
  'scaffold_state',
  'scaffold_ui',
  'start_project',
  'stop_project',
  'inspect_runtime',
  'control_runtime',
  'capture_screenshot',
]

async function text(relative: string): Promise<string> {
  return readFile(path.join(root, relative), 'utf8')
}

describe('Runtime harness documentation', () => {
  it.each(['packages/mcp/README.md', 'packages/cli/README.md'])(
    '%s lists all tools and the runtime trust and lifecycle contract',
    async (file) => {
      const source = await text(file)
      for (const tool of tools) expect(source).toContain(`\`${tool}\``)
      expect(source).toMatch(/trusted Project code|trusted.*code/i)
      expect(source).toMatch(/not a sandbox|without a sandbox/i)
      expect(source).toMatch(/playwright-core/i)
      expect(source).toMatch(/system (Google )?Chrome|system Chrome\/Chromium/i)
      expect(source).toMatch(/macOS.*Linux/is)
      expect(source).toMatch(/rejects? Windows|Windows.*reject/is)
      expect(source).toMatch(/paused.*step/is)
      expect(source).toMatch(/stop_project.*MCP.*close.*clean/is)
    },
  )

  it('marks the old exclusion superseded and records the observed browser gate', async () => {
    const [oldSpec, contract, context, bridgeAdr, deterministicAdr] = await Promise.all([
      text('.sdd/specs/waica-mcp.md'),
      text('.sdd/project.md'),
      text('CONTEXT.md'),
      text('docs/adr/0005-runtime-bridge-is-engine-owned-and-session-scoped.md'),
      text('docs/adr/0006-run-sessions-start-paused-and-advance-deterministically.md'),
    ])
    expect(oldSpec).toMatch(/run\/bridge\/screenshot.*superseded.*#24/is)
    expect(contract).toMatch(/`pnpm test:e2e`/)
    expect(contract).toMatch(/Chrome 151\.0\.7922\.77/)
    expect(contract).toMatch(/scripted browser e2e/i)
    for (const term of ['Run Session', 'Runtime Bridge', 'Runtime Snapshot']) {
      expect(context).toContain(term)
    }
    expect(bridgeAdr).toMatch(/engine-owned.*session-scoped/is)
    expect(deterministicAdr).toMatch(/start paused.*deterministic/is)
  })
})
