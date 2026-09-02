/**
 * Language initialization utilities for detecting and applying the user's
 * preferred language at app startup.
 */
import { locale } from '@tauri-apps/plugin-os'
import i18n, { availableLanguages } from './config'
import { logger } from '@/lib/logger'

/**
 * Initialize the application language.
 *
 * Priority:
 * 1. User's saved language preference (if set)
 * 2. Arabic (default primary language for this POS application)
 *
 * @param savedLanguage - The user's saved language preference from preferences
 */
export async function initializeLanguage(
  savedLanguage: string | null
): Promise<void> {
  try {
    if (savedLanguage && availableLanguages.includes(savedLanguage)) {
      // User has an explicit, available preference
      await i18n.changeLanguage(savedLanguage)
      logger.info('Language set from user preference', {
        language: savedLanguage,
      })
      return
    }

    if (savedLanguage) {
      logger.warn('Saved language not available, using Arabic', {
        savedLanguage,
        availableLanguages,
      })
    }

    // No saved preference (or an unavailable one): try to match the system
    // locale if it is Arabic, otherwise default to Arabic for the Egyptian
    // market this application targets.
    const systemLocale = await locale()
    if (
      systemLocale &&
      systemLocale.replace('-', '').toLowerCase().startsWith('ar')
    ) {
      await i18n.changeLanguage('ar')
      logger.info('Language set from system locale', { systemLocale })
      return
    }

    await i18n.changeLanguage('ar')
    logger.info('Language set to Arabic (default)')
  } catch (error) {
    logger.error('Failed to initialize language', { error })
    // Ensure we have some language set
    await i18n.changeLanguage('ar')
  }
}
