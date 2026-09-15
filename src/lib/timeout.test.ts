import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TimeoutError, withTimeout } from './timeout'

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves with the promise value when it settles before the timer', async () => {
    const promise = withTimeout(Promise.resolve('done'), 1_000, {
      label: 'fast',
    })

    await vi.advanceTimersByTimeAsync(999)

    await expect(promise).resolves.toBe('done')
  })

  it('resolves with the fallback when the promise hangs past the timer', async () => {
    const hang = new Promise<string>(() => {
      // Never settles — exercises the timeout fallback.
    })
    const promise = withTimeout<string>(hang, 5_000, {
      label: 'hung',
      fallback: 'fallback-value',
    })

    await vi.advanceTimersByTimeAsync(5_000)

    await expect(promise).resolves.toBe('fallback-value')
  })

  it('rejects with a TimeoutError when no fallback is provided', async () => {
    const hang = new Promise<string>(() => {
      // Never settles — exercises the TimeoutError path.
    })
    const promise = withTimeout(hang, 2_000, {
      label: 'hung',
    })
    const expectation = expect(promise).rejects.toThrowError(TimeoutError)

    await vi.advanceTimersByTimeAsync(2_000)

    await expectation
  })

  it('propagates the original rejection when it settles before the timer', async () => {
    const promise = withTimeout(Promise.reject(new Error('boom')), 2_000)

    await expect(promise).rejects.toThrowError('boom')
  })
})
