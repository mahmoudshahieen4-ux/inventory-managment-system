/**
 * UpdateDialog
 *
 * Shown automatically when a new version is available.
 * - Confirms before downloading
 * - Shows a progress bar during download
 * - Prompts to restart after install
 */

import { useState } from 'react'
import { relaunch } from '@tauri-apps/plugin-process'
import type { Update } from '@tauri-apps/plugin-updater'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { logger } from '@/lib/logger'

type Stage = 'confirm' | 'downloading' | 'restart' | 'error'

interface Props {
  update: Update
  onDismiss: () => void
}

export function UpdateDialog({ update, onDismiss }: Props) {
  const [stage, setStage] = useState<Stage>('confirm')
  const [progress, setProgress] = useState(0)
  const [totalBytes, setTotalBytes] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const handleInstall = async () => {
    setStage('downloading')
    setProgress(0)

    try {
      let downloaded = 0

      await update.downloadAndInstall(event => {
        switch (event.event) {
          case 'Started':
            setTotalBytes(event.data.contentLength ?? null)
            logger.info(`Update download started — ${event.data.contentLength} bytes`)
            break
          case 'Progress':
            downloaded += event.data.chunkLength
            if (totalBytes) {
              setProgress(Math.round((downloaded / totalBytes) * 100))
            }
            break
          case 'Finished':
            setProgress(100)
            logger.info('Update download finished, installing…')
            break
        }
      })

      setStage('restart')
    } catch (err) {
      logger.error(`Update failed: ${String(err)}`)
      setErrorMsg(String(err))
      setStage('error')
    }
  }

  const handleRestart = async () => {
    await relaunch()
  }

  // ── Confirm ──────────────────────────────────────────────────────────────
  if (stage === 'confirm') {
    return (
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>🎉 تحديث جديد متاح</AlertDialogTitle>
            <AlertDialogDescription>
              الإصدار <strong>{update.version}</strong> متاح الآن.
              هل تريد تثبيته الآن؟ سيستغرق التحميل بضع ثوانٍ فقط.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onDismiss}>
              لاحقاً
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleInstall}>
              تثبيت الآن
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  // ── Downloading ───────────────────────────────────────────────────────────
  if (stage === 'downloading') {
    return (
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>جاري التحميل…</AlertDialogTitle>
            <AlertDialogDescription>
              يتم تحميل التحديث، الرجاء الانتظار.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Progress bar */}
          <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-primary h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground text-center">
            {totalBytes
              ? `${progress}% — ${Math.round(totalBytes / 1024)} كيلوبايت`
              : `${progress}%`}
          </p>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  // ── Restart ───────────────────────────────────────────────────────────────
  if (stage === 'restart') {
    return (
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>✅ تم تثبيت التحديث</AlertDialogTitle>
            <AlertDialogDescription>
              تم تثبيت الإصدار <strong>{update.version}</strong> بنجاح.
              أعد تشغيل التطبيق لتفعيل التحديث.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onDismiss}>
              لاحقاً
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleRestart}>
              إعادة التشغيل الآن
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>❌ فشل التحديث</AlertDialogTitle>
          <AlertDialogDescription>
            حدث خطأ أثناء تثبيت التحديث. يمكنك تحميله يدوياً من GitHub.
            <br />
            <span className="text-xs text-destructive mt-1 block">{errorMsg}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={onDismiss}>
            إغلاق
          </Button>
          <AlertDialogAction
            onClick={() =>
              window.open(
                'https://github.com/mahmoudshahieen4-ux/inventory-managment-system/releases/latest',
                '_blank'
              )
            }
          >
            تحميل يدوي
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
