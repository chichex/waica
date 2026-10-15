import { describe, expect, it } from 'vitest'
import { HELP } from '../help.js'
import { runCli } from '../run-cli.js'
import { parseExportArgs } from './args.js'
import { runExportCommand } from './command.js'

describe('waica export desktop: arguments (issue #200 CA-6)', () => {
  it('defaults to the current directory, all three platforms and the project settings', () => {
    expect(parseExportArgs([])).toEqual({
      dir: '.',
      platforms: ['linux', 'win32', 'darwin'],
      out: null,
      name: null,
      icon: null,
      steamAppId: null,
      steam: true,
      help: false,
    })
  })

  it('takes the project directory and every flag', () => {
    expect(
      parseExportArgs([
        'games/hero',
        '--platform',
        'win32,linux',
        '--out',
        'builds',
        '--name',
        'Hero Quest',
        '--icon',
        'art/logo.png',
        '--steam-app-id',
        '480',
      ]),
    ).toEqual({
      dir: 'games/hero',
      platforms: ['win32', 'linux'],
      out: 'builds',
      name: 'Hero Quest',
      icon: 'art/logo.png',
      steamAppId: 480,
      steam: true,
      help: false,
    })
  })

})

describe('waica export desktop: platforms and errors (issue #200 CA-6)', () => {
  it('turns Steam off with --no-steam and asks for help with --help', () => {
    expect(parseExportArgs(['--no-steam']).steam).toBe(false)
    expect(parseExportArgs(['--help']).help).toBe(true)
  })

  it('lists a platform once even when repeated', () => {
    expect(parseExportArgs(['--platform', 'linux,linux,darwin']).platforms).toEqual(['linux', 'darwin'])
  })

  it.each([
    [['--frobnicate'], /unknown option "--frobnicate"/],
    [['--platform', 'linx'], /invalid platform "linx"/],
    [['--platform', 'linux,macos'], /invalid platform "macos"/],
    [['--platform'], /--platform expects/],
    [['--steam-app-id', '12.5'], /--steam-app-id expects a positive integer, got "12\.5"/],
    [['--steam-app-id', '-3'], /--steam-app-id expects a positive integer, got "-3"/],
    [['--steam-app-id', '0'], /--steam-app-id expects a positive integer, got "0"/],
    [['--steam-app-id', 'abc'], /got "abc"/],
    [['--out'], /--out expects a directory/],
    [['--name'], /--name expects a name/],
    [['--icon'], /--icon expects a \.png file/],
    [['one', 'two'], /unexpected argument "two"/],
  ])('rejects %j naming the bad value', (argv, message) => {
    expect(() => parseExportArgs(argv)).toThrow(message)
  })

})

describe('waica export desktop: on the command line (issue #200 CA-6)', () => {
  it('exits with code 1 and one line naming the bad value', async () => {
    const lines: string[] = []
    const exit: { exitCode?: number } = {}
    await runCli(() => runExportCommand(['desktop', '--platform', 'linx']), {
      stderr: { write: (text: string) => lines.push(text) },
      process: exit,
    })
    expect(exit.exitCode).toBe(1)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^waica: export desktop: invalid platform "linx"/)
    expect(lines[0]?.indexOf('\n')).toBe((lines[0]?.length ?? 0) - 1)
  })

  it('exits with code 1 for an export target other than desktop', async () => {
    const lines: string[] = []
    const exit: { exitCode?: number } = {}
    await runCli(() => runExportCommand(['mobile']), {
      stderr: { write: (text: string) => lines.push(text) },
      process: exit,
    })
    expect(exit.exitCode).toBe(1)
    expect(lines).toEqual(['waica: unknown export target "mobile" — try waica export desktop\n'])
  })

  it('is listed by waica --help with its flags', () => {
    expect(HELP).toMatch(/waica export desktop \[dir\]/)
    for (const flag of ['--platform', '--out', '--name', '--icon', '--steam-app-id', '--no-steam']) {
      expect(HELP).toContain(flag)
    }
  })
})
