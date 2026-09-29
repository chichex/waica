import { describe, expect, it, vi } from 'vitest'
import { reportRejection } from './report-rejection'

describe('reportRejection', () => {
  it('logs a failed event-handler task with its context and the original error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failure = new Error('disk full')
    reportRejection(Promise.reject(failure), 'save')
    await Promise.resolve()
    await Promise.resolve()
    expect(error.mock.calls).toEqual([['[waica editor] save failed:', failure]])
  })

  it('stays silent when the task resolves', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    reportRejection(Promise.resolve(), 'save')
    await Promise.resolve()
    expect(error).not.toHaveBeenCalled()
  })
})
