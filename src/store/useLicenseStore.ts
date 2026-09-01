/**
 * Licensing state: activation, auto 3-day trial, expiration checking and
 * clock-rollback protection.
 *
 * In the desktop runtime the license record is persisted in SQLite (single
 * `license` row, see `db.ts`). Outside Tauri (browser dev / tests) a dev
 * bypass unlocks the app so licensing never blocks development.
 */
import i18n from '@/i18n/config'
import { toast } from 'sonner'
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import {
  fetchLicenseRow,
  initializeDatabase,
  isTauriRuntime,
  persistLicense,
} from '@/services/db'
import { getHardwareId } from '@/services/hardware-id'
import { formatLicenseKey, validateLicenseKey } from '@/lib/license-key'
import type { LicenseRecord, LicenseStatus } from '@/types/license'

const t = i18n.t.bind(i18n)

/** Trial length in days. */
export const TRIAL_DAYS = 3
/** Warn when a paid license expires within this many days. */
const EXPIRING_SOON_DAYS = 3
/** Warn when the trial ends within this many days. */
const TRIAL_EXPIRING_SOON_DAYS = 1
const DAY_MS = 86_400_000

export type ExpirationCheckResult = 'OK' | 'EXPIRING_SOON' | 'EXPIRED' | 'TRIAL'

interface LicenseState {
  licenseKey: string | null
  status: LicenseStatus
  activationDate: string | null
  expirationDate: string | null
  isTrial: boolean
  firstRunDate: string | null
  trialExpirationDate: string | null
  lastActiveTime: string | null
  /** True once startup initialization finished (the lock screen waits for it). */
  initialized: boolean
  /** Loads the stored license on startup; applies the dev bypass outside Tauri. */
  initialize: () => Promise<void>
  /** Validates a serial key; returns the error kind, or null when activated. */
  activate: (key: string) => Promise<LicenseRecord | null>
  /** Starts a fresh 3-day trial. */
  startTrial: () => Promise<void>
  /** Anti-rollback + expiry check; also pulses `lastActiveTime` on startup/hourly. */
  runExpirationCheck: () => Promise<ExpirationCheckResult>
}

/** Builds a new 3-day trial record anchored at the current time. */
function createTrialRecord(): LicenseRecord {
  const now = new Date()
  return {
    licenseKey: null,
    status: 'TRIAL',
    activationDate: null,
    expirationDate: null,
    isTrial: true,
    firstRunDate: now.toISOString(),
    trialExpirationDate: new Date(
      now.getTime() + TRIAL_DAYS * DAY_MS
    ).toISOString(),
    lastActiveTime: now.toISOString(),
  }
}

function toRecord(state: LicenseState): LicenseRecord {
  return {
    licenseKey: state.licenseKey,
    status: state.status,
    activationDate: state.activationDate,
    expirationDate: state.expirationDate,
    isTrial: state.isTrial,
    firstRunDate: state.firstRunDate,
    trialExpirationDate: state.trialExpirationDate,
    lastActiveTime: state.lastActiveTime,
  }
}

export const useLicenseStore = create<LicenseState>()(
  devtools(
    (set, get) => ({
      licenseKey: null,
      status: 'UNREGISTERED',
      activationDate: null,
      expirationDate: null,
      isTrial: false,
      firstRunDate: null,
      trialExpirationDate: null,
      lastActiveTime: null,
      initialized: false,

      initialize: async () => {
        if (!isTauriRuntime()) {
          // Dev bypass: never lock the browser dev server or unit tests.
          set(
            { status: 'ACTIVE', initialized: true },
            false,
            'license/initializeDevBypass'
          )
          return
        }
        try {
          await initializeDatabase()
          const row = await fetchLicenseRow()
          const couldStartTrial =
            !row ||
            (!row.firstRunDate &&
              (row.status === 'UNREGISTERED' || row.status === 'TRIAL'))

          if (couldStartTrial) {
            // First launch (or a legacy row without trial fields): auto-start
            // a 3-day trial so the app is usable immediately.
            const trialRecord = createTrialRecord()
            set(
              { ...trialRecord, initialized: true },
              false,
              'license/initializeAutoTrial'
            )
            toast.success(t('license.toast.trialStarted'))
            persistLicense(trialRecord).catch(() => {
              toast.error(`${t('db.toast.saveFailed')}`)
            })
            return
          }
          if (!row) return

          set({ ...row, initialized: true }, false, 'license/initialize')
        } catch (error) {
          toast.error(`${t('db.toast.loadFailed')}: ${String(error)}`)
          set({ initialized: true }, false, 'license/initializeFailed')
        }
      },

      activate: async key => {
        const { machineId } = await getHardwareId()
        const result = validateLicenseKey(key, machineId)
        if (!result.valid || !result.expirationDate) {
          toast.error(
            t(`license.lock.error.${String(result.error).toLowerCase()}`)
          )
          return null
        }
        const record: LicenseRecord = {
          licenseKey: formatLicenseKey(key),
          status: 'ACTIVE',
          activationDate: new Date().toISOString(),
          expirationDate: result.expirationDate,
          isTrial: false,
          firstRunDate: null,
          trialExpirationDate: null,
          lastActiveTime: null,
        }
        set(record, false, 'license/activate')
        toast.success(t('license.toast.activated'))
        if (isTauriRuntime()) {
          persistLicense(record).catch(error => {
            toast.error(`${t('db.toast.saveFailed')}: ${String(error)}`)
          })
        }
        return record
      },

      startTrial: async () => {
        const record = createTrialRecord()
        set(record, false, 'license/startTrial')
        toast.success(t('license.toast.trialStarted'))
        if (isTauriRuntime()) {
          persistLicense(record).catch(error => {
            toast.error(`${t('db.toast.saveFailed')}: ${String(error)}`)
          })
        }
      },

      runExpirationCheck: async () => {
        const state = get()
        const now = Date.now()

        // Anti-clock-tampering: if "now" moved backwards past the last seen
        // timestamp the system clock was rolled back — lock immediately.
        if (state.lastActiveTime && now < Date.parse(state.lastActiveTime)) {
          set({ status: 'EXPIRED' }, false, 'license/clockRollback')
          toast.error(t('license.toast.clockRollback'))
          if (isTauriRuntime()) {
            persistLicense(toRecord(get())).catch(error => {
              toast.error(`${t('db.toast.saveFailed')}: ${String(error)}`)
            })
          }
          return 'EXPIRED'
        }

        // Pulse: keep `lastActiveTime` at the latest observed clock on every
        // startup and hourly check so rollbacks are always detectable.
        const pulseAt = new Date(now).toISOString()
        if (!state.lastActiveTime || now >= Date.parse(state.lastActiveTime)) {
          set({ lastActiveTime: pulseAt }, false, 'license/pulse')
          if (isTauriRuntime()) {
            persistLicense(toRecord(get())).catch(() => {
              // Silent — best-effort heartbeat persistence.
            })
          }
        }

        const { status, expirationDate, trialExpirationDate } = get()

        if (status === 'TRIAL') {
          if (!trialExpirationDate || now >= Date.parse(trialExpirationDate)) {
            set({ status: 'EXPIRED' }, false, 'license/trialExpired')
            toast.error(t('license.toast.expired'))
            if (isTauriRuntime()) {
              persistLicense(toRecord(get())).catch(error => {
                toast.error(`${t('db.toast.saveFailed')}: ${String(error)}`)
              })
            }
            return 'EXPIRED'
          }
          const remainingDays = (Date.parse(trialExpirationDate) - now) / DAY_MS
          if (remainingDays <= TRIAL_EXPIRING_SOON_DAYS) {
            toast.warning(
              t('license.toast.trialExpiringSoon', {
                days: Math.max(1, Math.ceil(remainingDays)),
              })
            )
          }
          return 'TRIAL'
        }

        if (status !== 'ACTIVE' || !expirationDate) {
          return status === 'EXPIRED' ? 'EXPIRED' : 'OK'
        }

        if (now > Date.parse(expirationDate)) {
          set({ status: 'EXPIRED' }, false, 'license/expire')
          toast.error(t('license.toast.expired'))
          if (isTauriRuntime()) {
            persistLicense(toRecord(get())).catch(error => {
              toast.error(`${t('db.toast.saveFailed')}: ${String(error)}`)
            })
          }
          return 'EXPIRED'
        }
        const remainingDays = Math.ceil(
          (Date.parse(expirationDate) - now) / DAY_MS
        )
        if (remainingDays <= EXPIRING_SOON_DAYS) {
          toast.warning(
            t('license.toast.expiringSoon', { days: remainingDays })
          )
          return 'EXPIRING_SOON'
        }
        return 'OK'
      },
    }),
    { name: 'license-store' }
  )
)
