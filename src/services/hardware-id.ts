/**
 * Hardware ID access with a native, persisted Tauri ID and stable web fallback.
 */
import { commands } from '@/lib/tauri-bindings'
import { isTauriRuntime } from './db'

const HARDWARE_ID_CACHE_KEY = 'pos-hardware-id.v1'
const MACHINE_ID_PATTERN = /^[0-9A-F]{8}$/

export interface HardwareId {
  /** 8 uppercase hex chars embedded inside license keys. */
  machineId: string
  /** Display form: XXXX-XXXX-XXXX-XXXX, shown on the lock screen. */
  displayId: string
}

function isMachineId(value: string | null): value is string {
  return Boolean(value && MACHINE_ID_PATTERN.test(value))
}

function asHardwareId(machineId: string): HardwareId {
  return { machineId, displayId: machineId }
}

/** Stable cache for the native identifier or a fallback generated on first run. */
function readCachedHardwareId(): HardwareId | null {
  try {
    const cachedId =
      localStorage.getItem(HARDWARE_ID_CACHE_KEY)?.toUpperCase() ?? null
    return isMachineId(cachedId) ? asHardwareId(cachedId) : null
  } catch {
    return null
  }
}

function cacheHardwareId(machineId: string): HardwareId {
  const hardwareId = asHardwareId(machineId)
  try {
    localStorage.setItem(HARDWARE_ID_CACHE_KEY, machineId)
  } catch {
    // The in-memory promise still keeps this fallback stable for this session.
  }
  return hardwareId
}

/** FNV-1a fallback if Web Crypto is unavailable. */
function fnv1a32(input: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0').toUpperCase()
}

function generateFallbackMachineId(): string {
  try {
    const bytes = crypto.getRandomValues(new Uint8Array(4))
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  } catch {
    return fnv1a32(`${Date.now()}-${Math.random()}-${Math.random()}`)
  }
}

async function computeHardwareId(): Promise<HardwareId> {
  const cached = readCachedHardwareId()
  if (cached) return cached

  if (isTauriRuntime()) {
    try {
      const result = await commands.getHardwareId()
      if (result.status === 'ok') {
        const nativeId = result.data.trim().toUpperCase()
        if (isMachineId(nativeId)) return cacheHardwareId(nativeId)
      }
    } catch {
      // Use the persistent web fallback when Tauri IPC is unavailable.
    }
  }

  return cacheHardwareId(generateFallbackMachineId())
}

let hardwareIdPromise: Promise<HardwareId> | null = null

/** Returns (once, then cached) this machine's hardware fingerprint. */
export function getHardwareId(): Promise<HardwareId> {
  if (!hardwareIdPromise) {
    hardwareIdPromise = computeHardwareId()
  }
  return hardwareIdPromise
}

/**
 * Convenience wrapper returning just the machine ID string for the UI.
 *
 * Guaranteed to resolve with a valid 8-character fingerprint: it invokes the
 * native `get_hardware_id` Tauri command first and, if the IPC call is
 * unavailable (e.g. a release build where the command is missing), it falls
 * back to the value persisted in `localStorage`, generating and caching one on
 * first use. It never rejects and never returns an error string, so the lock
 * screen can always display a usable device ID.
 */
export async function fetchMachineId(): Promise<string> {
  try {
    const { machineId } = await getHardwareId()
    if (isMachineId(machineId)) return machineId
  } catch {
    // Fall through to the persisted fallback below when IPC is unavailable.
  }

  const cached = readCachedHardwareId()
  if (cached) return cached.machineId

  return cacheHardwareId(generateFallbackMachineId()).machineId
}
