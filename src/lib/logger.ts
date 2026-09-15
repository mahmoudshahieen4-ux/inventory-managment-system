/**
 * Simple logging utility for the frontend
 *
 * In development: logs to browser console
 * In production: can optionally send to Tauri backend for system logging
 */

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: Date
  context?: Record<string, unknown>
}

class Logger {
  private isDevelopment = import.meta.env.DEV

  /**
   * Log a trace message (most verbose)
   */
  trace(message: string, context?: Record<string, unknown>): void {
    this.log('trace', message, context)
  }

  /**
   * Log a debug message (development only)
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context)
  }

  /**
   * Log an info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context)
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context)
  }

  /**
   * Log an error message
   */
  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context)
  }

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>
  ): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context,
    }

    // Always log to console in development
    if (this.isDevelopment) {
      this.logToConsole(entry)
    }

    // Production diagnostics: forward informational+ levels to the Tauri log
    // plugin (stdout / system logs) so field issues remain diagnosable.
    this.logToTauriBackend(level, entry)
  }

  /**
   * Forwards warn/error/info to the Tauri log plugin inside the desktop
   * production runtime only. Lazy dynamic import keeps the browser dev server
   * and unit tests untouched, and a missing plugin degrades silently to
   * console-only logging.
   */
  private logToTauriBackend(level: LogLevel, entry: LogEntry): void {
    if (this.isDevelopment || level === 'trace' || level === 'debug') return
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
      return
    }

    const line = entry.context
      ? `${entry.message} ${JSON.stringify(entry.context)}`
      : entry.message

    void import('@tauri-apps/plugin-log')
      .then(plugin => {
        if (level === 'error') return plugin.error(line)
        if (level === 'warn') return plugin.warn(line)
        return plugin.info(line)
      })
      .catch(() => {
        // Plugin unavailable — console logging above is the fallback.
      })
  }

  private logToConsole(entry: LogEntry): void {
    const timestamp = entry.timestamp.toISOString()
    const prefix = `[${timestamp}] [${entry.level.toUpperCase()}]`

    const args = entry.context
      ? [prefix, entry.message, entry.context]
      : [prefix, entry.message]

    switch (entry.level) {
      case 'trace':
      case 'debug':
        console.debug(...args)
        break
      case 'info':
        console.info(...args)
        break
      case 'warn':
        console.warn(...args)
        break
      case 'error':
        console.error(...args)
        break
    }
  }
}

// Export a singleton logger instance
export const logger = new Logger()

// Export individual logging functions for convenience
export const { trace, debug, info, warn, error } = logger
