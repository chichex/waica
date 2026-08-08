import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { cleanup, makeProject, stubPackage } from './test-helpers.js'
import {
  loadProjectComponents,
  PROJECT_COMPONENT_DEADLINE_MS,
  PROJECT_COMPONENT_PROTOCOL_VERSION,
} from './project-component-loader.js'

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

async function processProject(
  files: Readonly<Record<string, string | Uint8Array>>,
): Promise<string> {
  const project = await makeProject(files)
  roots.push(project)
  await stubPackage(project, '@waica/engine', {
    root: 'class Component {}\nexports.Component = Component\n',
  })
  return project
}

function healthyComponent(name: string, target = 'objects/healthy'): string {
  return `
import { Component } from '@waica/engine'
export class ${name} extends Component {
  static componentName = ${JSON.stringify(name)}
  static params = { target: { ref: 'prefab' } }
  target = ${JSON.stringify(target)}
}
`
}

describe('project component child processes', () => {
  it('contains hard file failures and still loads every later direct entry', async () => {
    const project = await processProject({
      'src/components/a-syntax.ts': 'export const broken = ;\n',
      'src/components/b-throw.ts': "throw new Error('scope exploded')\n",
      'src/components/c-exit-zero.ts': 'process.exit(0)\n',
      'src/components/d-exit-one.ts': 'process.exit(1)\n',
      'src/components/e-self-signal.ts': "process.kill(process.pid, 'SIGTERM')\n",
      'src/components/f-healthy.ts': healthyComponent('Healthy'),
    })

    const result = await loadProjectComponents(project)

    expect(result.components.Healthy?.defaults).toEqual({ target: 'objects/healthy' })
    expect(result.failures.map(({ code, file }) => ({ code, file }))).toEqual([
      { code: 'component-load-failed', file: 'src/components/a-syntax.ts' },
      { code: 'component-load-failed', file: 'src/components/b-throw.ts' },
      { code: 'component-load-failed', file: 'src/components/c-exit-zero.ts' },
      { code: 'component-load-failed', file: 'src/components/d-exit-one.ts' },
      { code: 'component-load-failed', file: 'src/components/e-self-signal.ts' },
    ])
  })

  it('applies the five-second production deadline independently to every file and observes close', async () => {
    expect(PROJECT_COMPONENT_DEADLINE_MS).toBe(5_000)
    const project = await processProject({})
    const logFile = path.join(project, 'timeout-pids.txt')
    await mkdir(path.join(project, 'src/components'), { recursive: true })
    const hanging = (label: string): string => `
import { appendFileSync } from 'node:fs'
appendFileSync(${JSON.stringify(logFile)}, ${JSON.stringify(label)} + ':' + process.pid + '\\n')
await new Promise(() => setInterval(() => {}, 1_000))
`
    await Promise.all([
      writeFile(path.join(project, 'src/components/a-hang.ts'), hanging('a')),
      writeFile(path.join(project, 'src/components/b-hang.ts'), hanging('b')),
      writeFile(
        path.join(project, 'src/components/c-healthy.ts'),
        `
import { appendFileSync } from 'node:fs'
appendFileSync(${JSON.stringify(logFile)}, 'healthy:' + process.pid + '\\n')
${healthyComponent('AfterTimeout')}
`,
      ),
    ])

    const started = performance.now()
    const result = await loadProjectComponents(project, undefined, { deadlineMs: 250 })
    const elapsed = performance.now() - started
    const rows = (await readFile(logFile, 'utf8')).trim().split('\n')
    const timedOutPids = rows.slice(0, 2).map((row) => Number(row.split(':')[1]))

    expect(result.failures).toEqual([
      expect.objectContaining({
        file: 'src/components/a-hang.ts',
        message: expect.stringMatching(/250 ms.*close was observed/s),
      }),
      expect.objectContaining({
        file: 'src/components/b-hang.ts',
        message: expect.stringMatching(/250 ms.*close was observed/s),
      }),
    ])
    expect(result.components.AfterTimeout).toBeDefined()
    expect(rows.map((row) => row.split(':')[0])).toEqual(['a', 'b', 'healthy'])
    expect(elapsed).toBeGreaterThanOrEqual(450)
    expect(timedOutPids.every((pid) => {
      try {
        process.kill(pid, 0)
        return false
      } catch {
        return true
      }
    })).toBe(true)
  })

  it('executes a shared helper once in each direct entry process', async () => {
    const project = await processProject({})
    const logFile = path.join(project, 'helper-pids.txt')
    await mkdir(path.join(project, 'src/components/lib'), { recursive: true })
    await writeFile(
      path.join(project, 'src/components/lib/shared.ts'),
      `
import { appendFileSync } from 'node:fs'
appendFileSync(${JSON.stringify(logFile)}, String(process.pid) + '\\n')
export const target = 'objects/helper'
`,
    )
    const direct = (name: string): string => `
import { target } from './lib/shared'
export class ${name} {
  static componentName = ${JSON.stringify(name)}
  static params = { target: { ref: 'prefab' } }
  target = target
}
`
    await Promise.all([
      writeFile(path.join(project, 'src/components/a.ts'), direct('First')),
      writeFile(path.join(project, 'src/components/b.ts'), direct('Second')),
    ])

    const result = await loadProjectComponents(project)
    const pids = (await readFile(logFile, 'utf8')).trim().split('\n').map(Number)

    expect(result.failures).toEqual([])
    expect(result.components.First?.defaults).toEqual({ target: 'objects/helper' })
    expect(result.components.Second?.defaults).toEqual({ target: 'objects/helper' })
    expect(pids).toHaveLength(2)
    expect(new Set(pids).size).toBe(2)
  })

  it('never replaces a present but unloadable Project package with the fallback', async () => {
    const project = await makeProject({
      'src/components/target.ts': healthyComponent('MustNotLoad'),
    })
    roots.push(project)
    await stubPackage(project, '@waica/engine', {
      packageJson: { exports: { '.': './missing.js' } },
    })

    const result = await loadProjectComponents(project)

    expect(result.components).toEqual({})
    expect(result.failures).toEqual([
      expect.objectContaining({
        code: 'component-load-failed',
        file: 'src/components/target.ts',
        message: expect.stringMatching(/missing\.js|cannot find/i),
      }),
    ])
  })

  it('awaits module metadata, exits past floating work and bounds abnormal diagnostics', async () => {
    const project = await processProject({
      'src/components/a-async.ts': `
console.log('SUCCESS_OUTPUT_MUST_BE_DISCARDED')
await new Promise((resolve) => setTimeout(resolve, 25))
setInterval(() => {}, 60_000)
setTimeout(() => Promise.reject(new Error('late rejection must die with child')), 500)
${healthyComponent('AsyncReady', 'objects/async')}
`,
      'src/components/b-noisy-exit.ts': `
import { writeSync } from 'node:fs'
writeSync(1, 'STDOUT_PREFIX_' + 'A'.repeat(70_000) + '_STDOUT_TAIL')
writeSync(2, 'STDERR_PREFIX_' + 'B'.repeat(70_000) + '_STDERR_TAIL')
process.exit(1)
`,
      'src/components/c-after-noise.ts': healthyComponent('AfterNoise'),
    })

    const started = performance.now()
    const result = await loadProjectComponents(project)
    const elapsed = performance.now() - started
    const noisy = result.failures.find(({ file }) => file.endsWith('b-noisy-exit.ts'))

    expect(result.components.AsyncReady?.defaults).toEqual({ target: 'objects/async' })
    expect(result.components.AfterNoise).toBeDefined()
    expect(result.failures).toHaveLength(1)
    expect(noisy?.message).toContain('_STDOUT_TAIL')
    expect(noisy?.message).toContain('_STDERR_TAIL')
    expect(noisy?.message).not.toContain('STDOUT_PREFIX_')
    expect(noisy?.message).not.toContain('STDERR_PREFIX_')
    expect(noisy?.message).not.toContain('SUCCESS_OUTPUT_MUST_BE_DISCARDED')
    expect(Buffer.byteLength(noisy?.message ?? '')).toBeLessThanOrEqual(132_000)
    expect(elapsed).toBeLessThan(1_000)
  })

  it('rejects malformed, unbound and duplicate terminal payloads atomically', async () => {
    const project = await processProject({
      'src/components/a-malformed.ts': '// custom runner owns this case\n',
      'src/components/b-wrong-version.ts': '// custom runner owns this case\n',
      'src/components/c-wrong-token.ts': '// custom runner owns this case\n',
      'src/components/d-duplicate.ts': '// custom runner owns this case\n',
    })
    const runner = path.join(project, 'malformed-runner.mjs')
    await writeFile(
      runner,
      `
const version = ${PROJECT_COMPONENT_PROTOCOL_VERSION}
process.send({ kind: 'project-entry-ready', version })
process.on('message', (request) => {
  const row = {
    name: 'MustNotSurvive',
    file: request.relativeFile,
    params: [{ name: 'target', ref: 'prefab', hasOptions: false, default: 'objects/nope' }],
    hasOnUpdate: true,
    hasUpdateAfter: true,
    updateAfter: ['Other'],
  }
  const terminal = {
    kind: 'project-entry-result',
    version,
    token: request.token,
    ok: true,
    components: [row],
  }
  if (request.relativeFile.includes('malformed')) {
    process.send({ ...terminal, components: [row, { ...row, extra: 'arbitrary runtime data' }] })
  } else if (request.relativeFile.includes('wrong-version')) {
    process.send({ ...terminal, version: version + 1 })
  } else if (request.relativeFile.includes('wrong-token')) {
    process.send({ ...terminal, token: request.token + '-other' })
  } else {
    process.send(terminal)
    process.send(terminal)
  }
})
setInterval(() => {}, 1_000)
`,
    )

    const result = await loadProjectComponents(project, undefined, {
      runnerPath: runner,
      deadlineMs: 500,
    })

    expect(result.components).toEqual({})
    expect(result.failures.map(({ file }) => file)).toEqual([
      'src/components/a-malformed.ts',
      'src/components/b-wrong-version.ts',
      'src/components/c-wrong-token.ts',
      'src/components/d-duplicate.ts',
    ])
    expect(result.failures.every(({ message }) => /malformed|more than one/.test(message))).toBe(
      true,
    )
  })
})
