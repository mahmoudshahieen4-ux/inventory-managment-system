import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isTauriRuntime: vi.fn(),
  getHardwareId: vi.fn(),
}))

vi.mock('./db', () => ({ isTauriRuntime: mocks.isTauriRuntime }))
vi.mock('@/lib/tauri-bindings', () => ({
  commands: { getHardwareId: mocks.getHardwareId },
}))

async function loadHardwareId() {
  return (await import('./hardware-id')).getHardwareId()
}

describe('getHardwareId', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    localStorage.clear()
    mocks.isTauriRuntime.mockReturnValue(true)
  })

  it('uses and uppercases the registered Tauri command result', async () => {
    mocks.getHardwareId.mockResolvedValue({ status: 'ok', data: 'a1b2c3d4' })

    const result = await loadHardwareId()

    expect(mocks.getHardwareId).toHaveBeenCalledOnce()
    expect(result).toEqual({ machineId: 'A1B2C3D4', displayId: 'A1B2C3D4' })
  })

  it('falls back to a cached 8-character ID when Tauri IPC fails', async () => {
    mocks.getHardwareId.mockRejectedValue(new Error('IPC unavailable'))

    const first = await loadHardwareId()
    vi.resetModules()
    const second = await loadHardwareId()

    expect(first.machineId).toMatch(/^[0-9A-F]{8}$/)
    expect(second).toEqual(first)
    expect(localStorage.getItem('pos-hardware-id.v1')).toBe(first.machineId)
    expect(mocks.getHardwareId).toHaveBeenCalledOnce()
  })

  it('falls back when the Rust command returns an error result', async () => {
    mocks.getHardwareId.mockResolvedValue({
      status: 'error',
      error: 'IPC unavailable',
    })

    const result = await loadHardwareId()

    expect(result.machineId).toMatch(/^[0-9A-F]{8}$/)
    expect(result.displayId).toBe(result.machineId)
  })

  it('fetchMachineId returns the native ID from the Tauri command', async () => {
    mocks.getHardwareId.mockResolvedValue({ status: 'ok', data: 'a1b2c3d4' })

    const { fetchMachineId } = await import('./hardware-id')

    expect(await fetchMachineId()).toBe('A1B2C3D4')
  })

  it('fetchMachineId never rejects and reuses a persisted fallback', async () => {
    mocks.getHardwareId.mockRejectedValue(new Error('IPC unavailable'))

    const { fetchMachineId } = await import('./hardware-id')
    const first = await fetchMachineId()

    expect(first).toMatch(/^[0-9A-F]{8}$/)
    expect(localStorage.getItem('pos-hardware-id.v1')).toBe(first)

    vi.resetModules()
    const second = await (await import('./hardware-id')).fetchMachineId()

    expect(second).toBe(first)
  })

  it('fetchMachineId falls back when the command returns an error result', async () => {
    mocks.getHardwareId.mockResolvedValue({
      status: 'error',
      error: 'IPC unavailable',
    })

    const { fetchMachineId } = await import('./hardware-id')

    expect(await fetchMachineId()).toMatch(/^[0-9A-F]{8}$/)
  })
})
