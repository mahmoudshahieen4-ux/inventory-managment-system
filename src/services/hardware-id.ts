/**
 * Hardware ID (machine fingerprint) generator.
 *
 * Combines OS-provided device info (hostname, OS type, architecture) with a
 * per-install UUID, then derives a deterministic FNV-1a fingerprint. The same
 * machine always produces the same ID, so license keys can be bound to one PC.
 */
import { arch, hostname, type as osType } from '@tauri-apps/plugin-os'

import { isTauriRuntime } from './db'

const INSTALL_UUID_KEY = 'pos-install-uuid'

export interface HardwareId {
  /** 8 uppercase hex chars embedded inside license keys. */
  machineId: string
  /** Display form: XXXX-XXXX-XXXX-XXXX, shown on the lock screen. */
  displayId: string
}

/** FNV-1a 32-bit hash rendered as 8 uppercase hex chars. */
function fnv1a32(input: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0').toUpperCase()
}

/** Stable per-install salt stored in the webview's local storage. */
function getInstallUuid(): string {
  try {
    const existing = localStorage.getItem(INSTALL_UUID_KEY)
    if (existing) return existing
    const uuid = crypto.randomUUID()
    localStorage.setItem(INSTALL_UUID_KEY, uuid)
    return uuid
  } catch {
    return 'no-storage'
  }
}

/** Groups a hex string into dash-separated 4-char blocks. */
export function formatHardwareId(hex: string): string {
  return (hex.match(/.{1,4}/g) ?? []).join('-')
}

async function computeHardwareId(): Promise<HardwareId> {
  // Outside Tauri the seed is a constant so tests stay fully deterministic.
  const seed = isTauriRuntime()
    ? `${await hostname()}|${await osType()}|${await arch()}|${getInstallUuid()}`
    : 'dev-fallback'

  const machineId = fnv1a32(seed)
  const displayTail = fnv1a32(`${seed}::display`)
  return { machineId, displayId: formatHardwareId(machineId + displayTail) }
}

let hardwareIdPromise: Promise<HardwareId> | null = null

/** Returns (once, then cached) this machine's hardware fingerprint. */
export function getHardwareId(): Promise<HardwareId> {
  if (!hardwareIdPromise) {
    hardwareIdPromise = computeHardwareId()
  }
  return hardwareIdPromise
}
