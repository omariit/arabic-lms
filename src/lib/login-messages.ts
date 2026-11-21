/** Human-readable Arabic text for the login error codes shared by both entrances. */
export function loginErrorMessage(code: string | null, left?: string | null, wait?: string | null): string | null {
  if (!code) return null;
  switch (code) {
    case "missing":
      return "يرجى إدخال رقم الهاتف وكلمة المرور";
    case "bad-phone":
      return "رقم الهاتف غير واضح — استخدمي الأرقام الإنجليزية (0-9) مثل 0787262186";
    case "no-account":
      return "لا يوجد حساب بهذا الرقم — تأكّدي من الرقم أو اختاري مفتاح الدولة الصحيح";
    case "bad-password":
      return left ? `كلمة المرور غير صحيحة — تبقّى ${left} محاولة قبل توقف مؤقت` : "كلمة المرور غير صحيحة";
    case "rate":
      return `توقّف مؤقت لحماية الحساب — حاولي بعد ${wait ?? 60} ثانية`;
    case "rate-ip":
      return `محاولات كثيرة من هذا الاتصال — حاولي بعد ${wait ?? 60} ثانية`;
    default:
      return "تعذّر تسجيل الدخول — حاولي مرة أخرى";
  }
}
