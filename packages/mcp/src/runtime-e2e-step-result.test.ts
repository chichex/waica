import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

/** Runs the browser e2e's own `call` against an MCP client that answers `result`; reports what the leg would see. */
function callWith(args: Record<string, unknown>, result: Record<string, unknown>): { value?: unknown; error?: string } {
  const script = `
    import { call } from './scripts/runtime-e2e.mjs';
    const client = { callTool: async () => (${JSON.stringify(result)}) };
    try {
      console.log(JSON.stringify({ value: await call(client, 'control_runtime', ${JSON.stringify(args)}) }));
    } catch (error) {
      console.log(JSON.stringify({ error: error.message }));
    }
  `
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT, encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'],
  })) as { value?: unknown; error?: string }
}

const failure = {
  isError: true,
  content: [{ type: 'text', text: 'Runtime operation failed: GPUDevice.createBuffer: the device was lost' }],
  structuredContent: { code: 'runtime-operation-failed', message: 'GPUDevice.createBuffer: the device was lost' },
}

it('fails a leg on a failed step, showing the error the Runtime Bridge returned (issue #262)', () => {
  const seen = callWith({ project_path: '/p', operation: 'step', frames: 30 }, failure)

  expect(seen.value).toBeUndefined()
  expect(seen.error).toMatch(/step.*failed/i)
  expect(seen.error).toContain('GPUDevice.createBuffer: the device was lost')
})

it('hands a successful step back to the leg unchanged', () => {
  const stepped = { content: [], structuredContent: { mode: 'paused', frame: 30 } }

  expect(callWith({ project_path: '/p', operation: 'step', frames: 30 }, stepped)).toEqual({ value: stepped })
})

it('still hands any other failed control back, for legs that assert the failure themselves', () => {
  expect(callWith({ project_path: '/p', operation: 'scene', scene: 'nowhere' }, failure)).toEqual({ value: failure })
})
