import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useUIStore } from '@/store/ui-store'
import { useAppBootstrap } from './bootstrap'

describe('useAppBootstrap', () => {
  it('is a no-op outside the Tauri runtime (no loading flag, no state changes)', () => {
    useUIStore.setState({ isDbInitializing: false })

    renderHook(() => useAppBootstrap())

    // jsdom is not the desktop runtime, so hydration never starts.
    expect(useUIStore.getState().isDbInitializing).toBe(false)
  })
})
