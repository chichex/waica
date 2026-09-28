import { describe, expect, it, vi } from 'vitest'
import { reportRejection } from './report-rejection.js'

describe('reportRejection', () => {
  it('logs a detached task failure once with its context', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    reportRejection(Promise.reject(new Error('boom')), 'texture settle')
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- proves a non-Error rejection is reported too
    reportRejection(Promise.reject('plain'), 'audio close')
    await Promise.resolve()
    await Promise.resolve()
    expect(error.mock.calls.map((call) => String(call[0]))).toEqual([
      '[waica] texture settle failed: boom',
      '[waica] audio close failed: plain',
    ])
  })

  it('stays silent when the task resolves', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    reportRejection(Promise.resolve(1), 'noop')
    await Promise.resolve()
    expect(error).not.toHaveBeenCalled()
  })
})
