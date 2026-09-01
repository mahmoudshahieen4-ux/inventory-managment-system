import '@testing-library/jest-dom'
import { vi } from 'vitest'

// jsdom does not implement the Pointer Capture API, but Radix UI primitives
// (e.g. Select) call it inside their pointer event handlers. Provide no-op
// polyfills so those components can be tested.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = function (_pointerId: number): boolean {
    return false
  }
}

if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function (_pointerId: number): void {
    // No-op: jsdom does not support real pointer capture.
  }
}

if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = function (
    _pointerId: number
  ): void {
    // No-op: jsdom does not support real pointer capture.
  }
}

// Radix UI primitives (e.g. Select) call `scrollIntoView` to keep the active
// item in view. jsdom does not implement it, so provide a no-op polyfill.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function (
    _arg?: boolean | ScrollIntoViewOptions
  ): void {
    // No-op: jsdom does not support scrolling.
  }
}

// Mock matchMedia for tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock Tauri APIs for tests
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {
    // Mock unlisten function
  }),
}))

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn().mockResolvedValue(null),
}))

// Mock typed Tauri bindings (tauri-specta generated)
vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    greet: vi.fn().mockResolvedValue('Hello, test!'),
    loadPreferences: vi
      .fn()
      .mockResolvedValue({ status: 'ok', data: { theme: 'system' } }),
    savePreferences: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
    sendNativeNotification: vi
      .fn()
      .mockResolvedValue({ status: 'ok', data: null }),
    saveEmergencyData: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
    loadEmergencyData: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
    cleanupOldRecoveryFiles: vi
      .fn()
      .mockResolvedValue({ status: 'ok', data: 0 }),
  },
  unwrapResult: vi.fn((result: { status: string; data?: unknown }) => {
    if (result.status === 'ok') return result.data
    throw result
  }),
}))
