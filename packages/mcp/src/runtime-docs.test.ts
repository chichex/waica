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

  it.each(['packages/mcp/README.md', '.sdd/specs/waica-mcp.md'])(
    '%s records the per-entry validation boundary and its limits',
    async (file) => {
      const source = await text(file)
      expect(source).toMatch(/one .*child.*direct.*entry|one .*process.*entry/is)
      expect(source).toMatch(/five.second|5,000 ms/is)
      expect(source).toMatch(/parent.*validat/is)
      expect(source).toMatch(/re-execut|executes again|every validation/is)
      expect(source).toContain('component-load-failed')
      expect(source).toContain('component-load-unsupported')
      expect(source).toMatch(/filesystem.*network|network.*filesystem/is)
      expect(source).toMatch(
        /descendants?.*(not owned|does not own|not clean)|(does not own|does not clean).*descendants?/is,
      )
      expect(source).not.toMatch(/Project.*modules?.*in the MCP process/is)
      expect(source).not.toMatch(/global.*exception.*guard|shared.*hook context|shared.*ESM cache/is)
    },
  )

  it('uses only platform-neutral direct-child lifecycle APIs for static validation', async () => {
    const lifecycle = `${await text('packages/mcp/src/project-component-loader.ts')}\n${await text('packages/mcp/src/project-component-runner.ts')}`

    expect(lifecycle).toMatch(/launcher \?\? fork/)
    expect(lifecycle).toContain("child.kill('SIGKILL')")
    expect(lifecycle).toMatch(/child\.once\(['"]close/)
    expect(lifecycle).not.toMatch(/\bdetached\s*:/)
    expect(lifecycle).not.toMatch(/\bshell\s*:/)
    expect(lifecycle).not.toMatch(/process\.kill\(\s*-/)
    expect(lifecycle).not.toMatch(/process\.platform\s*===?\s*['"]win32['"]/)
  })

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
    // A concrete observed version, not an exact build: Chrome auto-updates,
    // and the contract re-records whatever version the last refresh saw.
    expect(contract).toMatch(/Chrome \d+\.\d+\.\d+\.\d+/)
    expect(contract).toMatch(/scripted browser e2e/i)
    for (const term of ['Run Session', 'Runtime Bridge', 'Runtime Snapshot']) {
      expect(context).toContain(term)
    }
    expect(bridgeAdr).toMatch(/engine-owned.*session-scoped/is)
    expect(deterministicAdr).toMatch(/start paused.*deterministic/is)
  })
})
