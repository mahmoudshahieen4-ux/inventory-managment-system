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

/**
 * عرض منطقة أسهم الزيادة/النقصان الأصلية عند حافة حقل الأرقام (بكسل).
 * يتوافق مع عرض ::-webkit-inner-spin-button في Chromium/WebView2.
 */
const SPINNER_HIT_WIDTH_PX = 17

/** هل وقعت الفأرة فوق أسهم الزيادة/النقصان الأصلية (حافة نهاية السطر)؟ */
function isOverNativeSpinner(
  input: HTMLInputElement,
  clientX: number
): boolean {
  const rect = input.getBoundingClientRect()
  const direction = getComputedStyle(input).direction
  // تُرسم الأسهم عند نهاية السطر: اليمين في LTR واليسار في RTL.
  return direction === 'rtl'
    ? clientX <= rect.left + SPINNER_HIT_WIDTH_PX
    : clientX >= rect.right - SPINNER_HIT_WIDTH_PX
}

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
   *
   * BUG FIX (أسهم الزيادة المستمرة): على حقول type="number" لا يجوز
   * إلغاء السلوك الافتراضي لـ mouseup عندما وقعت الفأرة فوق أسهم
   * الزيادة/النقصان الأصلية — فإلغاؤه يمنع Chromium/WebView2 من إنهاء
   * حالة "الضغط المستمر" على السهم، فتبقى القيمة تزيد/تنقص بلا توقف
   * حتى بعد رفع زر الفأرة. لذلك نتجاوز preventDefault فوق منطقة
   * الأسهم فقط، ونُبقيه فوق نص الحقل (للحفاظ على التحديد التلقائي).
   */
  const onMouseUp = (event: React.MouseEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    if (input.type === 'number' && isOverNativeSpinner(input, event.clientX)) {
      return
    }
    event.preventDefault()
  }

  return { onFocus, onMouseUp }
}
