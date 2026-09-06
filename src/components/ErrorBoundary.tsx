import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { saveCrashState } from '@/lib/recovery'
import { logger } from '@/lib/logger'

interface Props {
  children: ReactNode
  /**
   * 'page' (default) renders the full-screen crash screen (app root);
   * 'section' renders a compact inline card so one broken view (POS,
   * Inventory, Reports) cannot take down the rest of the app.
   */
  variant?: 'page' | 'section'
  /** Human-readable section name shown in the `section` fallback (e.g. "POS"). */
  section?: string
  /**
   * When this key changes, the boundary auto-resets — used per-view so
   * switching views gives the failed section a fresh mount.
   */
  resetKey?: string
}

interface State {
  hasError: boolean
  error?: Error
  errorInfo?: ErrorInfo
  /** Tracks the resetKey the current error state belongs to. */
  resetKey?: string
}

/**
 * Inline fallback for `variant="section"` — a functional component so it can
 * use `useTranslation()` (class components cannot). Keeps the app shell alive:
 * a broken view shows a compact recovery card instead of freezing everything.
 */
function SectionErrorFallback({
  section,
  error,
  onReset,
}: {
  section?: string
  error?: Error
  onReset: () => void
}) {
  const { t } = useTranslation()
  return (
    <div
      role="alert"
      className="flex h-full flex-col items-center justify-center gap-3 p-6"
    >
      <div className="bg-destructive/10 text-destructive flex size-12 items-center justify-center rounded-full">
        <svg
          className="size-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.082 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
      </div>
      <p className="text-foreground font-medium">
        {t('errors.sectionCrashed', {
          section: section ?? t('errors.sectionUnknown'),
        })}
      </p>
      <p className="text-muted-foreground text-sm">
        {t('errors.sectionCrashedHint')}
      </p>
      <Button variant="outline" onClick={onReset}>
        {t('errors.sectionRetry')}
      </Button>
      {import.meta.env.DEV && error && (
        <pre className="text-muted-foreground max-w-md overflow-auto rounded bg-muted p-2 text-xs">
          {error.message}
        </pre>
      )}
    </div>
  )
}

/**
 * Simple error boundary that saves app state before crashes
 *
 * Automatically saves crash data to recovery files for debugging
 * Shows a user-friendly error message instead of a blank screen
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    }
  }

  override componentDidUpdate(prevProps: Props) {
    // Auto-reset when the parent switches the section (e.g. view change).
    if (
      this.state.hasError &&
      this.props.resetKey !== undefined &&
      this.props.resetKey !== prevProps.resetKey
    ) {
      this.setState({
        hasError: false,
        error: undefined,
        errorInfo: undefined,
      })
    }
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('Application crashed', {
      error: error.message,
      stack: error.stack,
    })

    this.setState({ errorInfo })

    // Save crash state asynchronously (don't block error UI)
    this.saveCrashData(error, errorInfo)
  }

  private async saveCrashData(error: Error, errorInfo: ErrorInfo) {
    try {
      // Get basic app state - extend this based on your app's needs
      const appState = {
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        // Add more app state here as needed:
        // currentUser: getCurrentUser(),
        // activeFeatures: getActiveFeatures(),
        // etc.
      }

      await saveCrashState(appState, {
        error: error.message,
        stack: error.stack || 'No stack trace available',
        componentStack: errorInfo.componentStack || undefined,
      })
    } catch (saveError) {
      // Don't throw from error boundary - just log
      logger.error('Failed to save crash data', { saveError })
    }
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined })
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.variant === 'section') {
        return (
          <SectionErrorFallback
            section={this.props.section}
            error={this.state.error}
            onReset={this.handleReset}
          />
        )
      }

      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
          <div className="w-full max-w-md text-center">
            <div className="mb-6">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <svg
                  className="h-8 w-8 text-destructive"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-foreground mb-2">
                Something went wrong
              </h1>
              <p className="text-muted-foreground mb-6">
                The application encountered an unexpected error. Your data has
                been saved automatically.
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={this.handleReload}
                className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                Reload Application
              </button>

              <button
                onClick={this.handleReset}
                className="w-full px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90 transition-colors"
              >
                Try Again
              </button>
            </div>

            {import.meta.env.DEV && this.state.error && (
              <details className="mt-6 text-left">
                <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                  Error Details (Development Only)
                </summary>
                <div className="mt-2 p-3 bg-muted rounded-md text-xs font-mono">
                  <div className="text-destructive font-semibold mb-1">
                    {this.state.error.name}: {this.state.error.message}
                  </div>
                  {this.state.error.stack && (
                    <pre className="whitespace-pre-wrap text-muted-foreground overflow-auto">
                      {this.state.error.stack}
                    </pre>
                  )}
                </div>
              </details>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
