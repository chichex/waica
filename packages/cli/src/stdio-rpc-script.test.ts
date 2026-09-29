import { spawn } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const MODULE_URL = new URL('../../../scripts/stdio-rpc.mjs', import.meta.url).href

/**
 * Runs `stdioRpc` from scripts/stdio-rpc.mjs against a fake server (`serverSource`)
 * in a separate node process, and reports how the first request settled.
 * The outer process is killed after 10 s so a hanging request fails the test.
 */
function settleFirstRequest(serverSource: string, timeoutMs: number): Promise<{ outcome: string; stdout: string }> {
  const driver = `
    import { spawn } from 'node:child_process'
    import { stdioRpc } from ${JSON.stringify(MODULE_URL)}
    const child = spawn(process.execPath, ['-e', ${JSON.stringify(serverSource)}], { stdio: ['pipe', 'pipe', 'pipe'] })
    const rpc = stdioRpc(child, { timeoutMs: ${timeoutMs} })
    try {
      await rpc.request('initialize', {})
      console.log('RESOLVED')
    } catch (error) {
      console.log('REJECTED ' + error.message.replaceAll('\\n', ' | '))
    }
    child.kill('SIGKILL')
  `
  return new Promise((resolve) => {
    const runner = spawn(process.execPath, ['--input-type=module', '-e', driver], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    runner.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    const killer = setTimeout(() => runner.kill('SIGKILL'), 10_000)
    runner.once('exit', () => {
      clearTimeout(killer)
      const line = stdout.split('\n').find((entry) => entry.startsWith('RESOLVED') || entry.startsWith('REJECTED'))
      resolve({ outcome: line ?? 'HUNG', stdout })
    })
  })
}

describe('scripts/stdio-rpc.mjs', () => {
  it('rejects a pending request with the child stderr when the child exits without answering', async () => {
    const crash = `process.stderr.write('boom: server crashed'); process.exit(3)`
    const { outcome } = await settleFirstRequest(crash, 60_000)
    expect(outcome).toContain('REJECTED')
    expect(outcome).toContain('child exited before answering (code 3')
    expect(outcome).toContain('boom: server crashed')
  }, 15_000)

  it('rejects a request the child never answers once the per-request deadline passes', async () => {
    const silent = `setInterval(() => {}, 1000)`
    const { outcome } = await settleFirstRequest(silent, 300)
    expect(outcome).toContain('REJECTED initialize got no answer within 300 ms')
  }, 15_000)

  it('resolves a request the child answers', async () => {
    const echo = `process.stdin.once('data', (d) => { const { id } = JSON.parse(d.toString()); console.log(JSON.stringify({ id, result: {} })) }); setInterval(() => {}, 1000)`
    const { outcome } = await settleFirstRequest(echo, 5_000)
    expect(outcome).toBe('RESOLVED')
  }, 15_000)
})
