import { logger } from '@/lib/logger'

/** Error thrown by `withTimeout` when no `fallback` value is provided. */
export class TimeoutError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`${label} timed out after ${timeoutMs}ms`)
    this.name = 'TimeoutError'
  }
}

interface WithTimeoutOptions<T> {
  /** Resolved instead of rejecting when the timer fires (anti-hang mode). */
  fallback?: T
  /** Human-readable name used in the timeout warning log. */
  label?: string
}

/**
 * Races a promise against a timer so one hung operation can never stall the
 * app forever (e.g. an offline fetch with no network timeout, or a wedged
 * plugin call). The original promise keeps running in the background — its
 * eventual settlement is simply ignored once the timer has fired.
 *
 * When `options.fallback` is provided the returned promise RESOLVES with it
 * on timeout; otherwise it rejects with a `TimeoutError`. Both paths log a
 * warning so hangs stay observable in the console.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  options?: WithTimeoutOptions<T>
): Promise<T> {
  const label = options?.label ?? 'unnamed operation'
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      logger.warn(`[timeout] ${label} exceeded ${timeoutMs}ms — continuing`, {
        label,
        timeoutMs,
      })
      if (options && 'fallback' in options) {
        resolve(options.fallback as T)
      } else {
        reject(new TimeoutError(label, timeoutMs))
      }
    }, timeoutMs)

    promise.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      error => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}
