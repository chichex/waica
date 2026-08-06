import { afterEach, describe, expect, it, vi } from 'vitest'
import { reportProjectCodeFailure } from './stdio.js'

describe('reportProjectCodeFailure', () => {
  afterEach(() => vi.restoreAllMocks())

  it('logs to stderr (console.error) rather than stdout, which carries the JSON-RPC transport', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    reportProjectCodeFailure('unhandledRejection', new Error('floating fetch() rejected'))

    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy.mock.calls[0]?.join(' ')).toContain('unhandledRejection')
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('reports uncaughtException without throwing, keeping the server process alive', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(() =>
      reportProjectCodeFailure('uncaughtException', new Error('module-scope throw')),
    ).not.toThrow()
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })
})
