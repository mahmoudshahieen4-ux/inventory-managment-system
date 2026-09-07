/**
 * خطاف لتحديد محتوى حقل الإدخال تلقائياً عند التركيز عليه.
 *
 * يُستخدم مع حقول الكمية والأرقام ليقوم المستخدم بكتابة الرقم الجديد
 * مباشرة دون الحاجة لمسح القيمة القديمة أولاً.
 *
 * يعالج مشكلة Chrome/WebKit حيث يقوم onMouseUp بإلغاء التحديد،
 * لذلك نستخدم requestAnimationFrame + منع حدث mouseUp الافتراضي.
 *
 * مثال الاستخدام:
 * ```tsx
 * const { onFocus, onMouseUp } = useAutoSelectOnFocus()
 * <input type="number" onFocus={onFocus} onMouseUp={onMouseUp} />
 * ```
 */

export function useAutoSelectOnFocus() {
  /**
   * عند التركيز على الحقل: نحدد المحتوى بالكامل بعد إطار واحد
   * لضمان تطبيق التحديد حتى لو قام المتصفح بإلغائه.
   */
  const onFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    const input = event.target
    // تأخير قصير لضبط التحديد بعد أي معالجة افتراضية من المتصفح
    requestAnimationFrame(() => {
      input.select()
    })
  }

  /**
   * عند رفع زر الفأرة بعد النقر: نمنع السلوك الافتراضي الذي قد
   * يلغي التحديد في بيئات سطح المكتب (Tauri/WebKit).
   */
  const onMouseUp = (event: React.MouseEvent<HTMLInputElement>) => {
    event.preventDefault()
  }

  return { onFocus, onMouseUp }
}
