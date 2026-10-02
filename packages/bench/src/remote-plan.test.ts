import { describe, expect, it } from 'vitest'
import {
  BENCH_CLONE_DIR,
  PREFLIGHT_SCRIPT,
  RESULTS_MARKER,
  extractResults,
  httpsCloneUrl,
  missingPrerequisites,
  parsePreflight,
  remoteRunScript,
  resolveBenchHost,
  unpushedRefusal,
} from './remote-plan.ts'

describe('resolveBenchHost', () => {
  it('reads WAICA_BENCH_HOST', () => {
    expect(resolveBenchHost({ WAICA_BENCH_HOST: 'chichex-linux' })).toBe('chichex-linux')
  })

  it('fails with a clear message when it is unset or blank', () => {
    expect(() => resolveBenchHost({})).toThrow(/WAICA_BENCH_HOST is not set/)
    expect(() => resolveBenchHost({ WAICA_BENCH_HOST: '  ' })).toThrow(/WAICA_BENCH_HOST/)
  })
})

describe('unpushedRefusal', () => {
  it('refuses a commit no origin branch contains and prints the push command', () => {
    const message = unpushedRefusal('abc1234', [], 'sdd/bench-baseline')
    expect(message).toMatch(/abc1234 is not on origin/)
    expect(message).toContain('git push -u origin sdd/bench-baseline')
  })

  it('accepts a commit an origin branch contains', () => {
    expect(unpushedRefusal('abc1234', ['origin/sdd/bench-baseline'], 'sdd/bench-baseline')).toBeNull()
  })
})

describe('preflight', () => {
  it('names each missing prerequisite with its install command', () => {
    const report = parsePreflight([
      'git=git version 2.43.0',
      'node=v24.21.0',
      'pnpm=missing',
      'chrome=Google Chrome 150.0.7871.186',
    ].join('\n'))
    const missing = missingPrerequisites(report)
    expect(missing).toEqual([
      { tool: 'pnpm', install: 'npm install -g --prefix ~/.local pnpm@11.4.0' },
    ])
  })

  it('treats a Node older than 22.18 as missing', () => {
    const report = parsePreflight('git=x\nnode=v22.17.1\npnpm=11.4.0\nchrome=Chrome 150')
    expect(missingPrerequisites(report).map((m) => m.tool)).toEqual(['node'])
  })

  it('treats an absent line as missing', () => {
    expect(missingPrerequisites(parsePreflight('')).map((m) => m.tool)).toEqual([
      'git',
      'node',
      'pnpm',
      'chrome',
    ])
  })

  it('passes a complete host', () => {
    const report = parsePreflight('git=x\nnode=v24.21.0\npnpm=11.4.0\nchrome=Chrome 150')
    expect(missingPrerequisites(report)).toEqual([])
  })
})

describe('remoteRunScript', () => {
  const script = remoteRunScript({
    sha: 'abc1234',
    repoUrl: 'https://github.com/chichex/waica.git',
    benchArgs: [],
  })

  it('works in the dedicated clone and never in ~/workspace/waica', () => {
    expect(BENCH_CLONE_DIR).toBe('~/waica-bench')
    expect(script).toContain(BENCH_CLONE_DIR)
    expect(script).not.toContain('workspace/waica')
  })

  it('checks out the exact sha, installs frozen and runs the bench', () => {
    expect(script).toContain('git checkout --quiet --detach abc1234')
    expect(script).toContain('pnpm install --frozen-lockfile')
    expect(script).toContain('pnpm bench')
  })

  it('stops at the first failing command', () => {
    expect(script.startsWith('set -eu')).toBe(true)
  })

  it('finds user-level installs in ~/.local/bin, in the run and in the preflight', () => {
    expect(script).toContain('export PATH="$HOME/.local/bin:$PATH"')
    expect(PREFLIGHT_SCRIPT.startsWith('export PATH="$HOME/.local/bin:$PATH"')).toBe(true)
  })
})

describe('extractResults', () => {
  it('reads the results line among other output', () => {
    const results = [{ scenario: 'static-sprites' }]
    const stdout = `> @waica/bench bench\nbuilding...\n${RESULTS_MARKER}${JSON.stringify(results)}\ndone\n`
    expect(extractResults(stdout)).toEqual(results)
  })

  it('fails when the bench printed no results', () => {
    expect(() => extractResults('building...\n')).toThrow(/no results/)
  })
})

describe('httpsCloneUrl', () => {
  it('turns GitHub SSH remotes into anonymous HTTPS clone URLs', () => {
    expect(httpsCloneUrl('ssh://git@github.com/chichex/waica.git')).toBe('https://github.com/chichex/waica.git')
    expect(httpsCloneUrl('git@github.com:chichex/waica.git')).toBe('https://github.com/chichex/waica.git')
  })

  it('keeps an HTTPS remote as is', () => {
    expect(httpsCloneUrl('https://github.com/chichex/waica.git')).toBe('https://github.com/chichex/waica.git')
  })
})
