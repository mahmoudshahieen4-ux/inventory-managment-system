import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import '@fontsource-variable/inter'
import '@fontsource-variable/rubik'
import './i18n'
import App from './App'
import { logger } from './lib/logger'
import { queryClient } from './lib/query-client'

// Global safety net: failures thrown outside React's render tree (async
// tasks, IPC callbacks, timers) can never be caught by the ErrorBoundary —
// they are logged here so nothing disappears silently.
window.addEventListener('error', event => {
  logger.error('Unhandled window error', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  })
})
window.addEventListener('unhandledrejection', event => {
  logger.error('Unhandled promise rejection', { reason: String(event.reason) })
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={queryClient}>
    <App />
    <ReactQueryDevtools initialIsOpen={false} />
  </QueryClientProvider>
)
