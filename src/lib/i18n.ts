/**
 * Minimal, dependency-free i18n (ar/en).
 * - Locale stored in the `lang` cookie; server components read it via cookies().
 * - Dictionaries cover the public site + auth + student dashboard + staff shells.
 * - Arabic remains the default; English exists for international (USA) students.
 */
import { cookies } from "next/headers";

export type Locale = "ar" | "en";
export const LANG_COOKIE = "lang";
export const LOCALES: Locale[] = ["ar", "en"];

export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const v = jar.get(LANG_COOKIE)?.value as Locale | undefined;
  return v && LOCALES.includes(v) ? v : "ar";
}

export function dir(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

const ar = {
  // landing
  bismillah: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
  heroBadge: "✨ إجازة بالسند المتصل — للنساء والبنات",
  heroTitle1: "إتقاني قراءتك…",
  heroTitle2: "وتوصلي للإجازة",
  startNow: "ابدئي رحلتك الآن",
  levelsBtn: "المستويات الثلاثة ↓",
  badges: ["مسندة إجازة", "قراءات عشر", "متابعة فردية", "نساء فقط"],
  login: "دخول",
  register: "حساب جديد",
  frameTitle: "من الإتقان إلى السند المتصل",
  frameSub: "ثلاثة مستويات منهجية متكاملة",
  levelsKicker: "مسار منهجي متدرّج",
  levelsTitle: "إتقان القراءة بالمستويات الثلاثة",
  levelsSub: "لا تنتقلين لمستوى أعلى إلا بعد الإتقان التام والتقييم النهائي للمستوى الذي قبله",
  levelNames: ["المستوى الأول — الإتقان", "المستوى الثاني — القراءات", "المستوى الثالث — الإجازة"],
  levelTags: ["التأسيس والتجويد", "العشر من الشاطبية والدرة", "بالسند المتصل"],
  levelDescs: [
    "ضبط مخارج الحروف ونطقها صحيحًا، وتلاوة القرآن الكريم بأحكام التجويد من الكتاب إتقانًا تامًّا.",
    "رواية القراءات العشر تسميعًا وتصحيحًا تفصيليًا لكل قراءة، حتى الجمع بين الطريقين بإتقان.",
    "الإجازة في القراءة المتواترة بالسند المتصل إلى رسول الله ﷺ، مع توثيق السند للطالبة المتقنة.",
  ],
  startLevel1: "ابدئي من المستوى الأول",
  methodKicker: "المنهجية",
  methodTitle: "كيف أعليم؟",
  methodBadge: "۞ منهج الإتقان",
  featKicker: "لماذا هذه المنصة؟",
  featTitle: "كل ما تحتاجينه لتتعلّمي وتتقني من بيتك",
  featTitles: [
    "حصص مباشرة تفاعلية", "تصحيح صوتي فردي", "منصة آمنة للنساء",
    "اختبارات ومتابعة", "من جوالك بسهولة", "توثيق الإجازة",
  ],
  featDescs: [
    "بث مباشر داخل المنصة مع غرفة صوتية للسؤال والجواب — ارفعي يدك وتحدثي مع المعلمة مباشرة.",
    "سجّلي تلاوتك من جوالك، وتريدينها على المعلمة، ويصلك تصحيحها صوتيًا ونصًّا في وقته.",
    "بيئة متواضعة مخصصة للأخت والبنت — محتوى محمي ودخول بحساب خاص لكل طالبة.",
    "اختبارات إلكترونية فورية على التجويد، واختبارات تلاوة صوتية تصححها المعلمة بنفسها.",
    "ثبّتي المنصة على شاشتك الرئيسية مثل التطبيق، وتابعي دروسك وحصصك بضغطة واحدة.",
    "عند إتمام كل مستوى: تقييم نهائي دقيق، ثم إجازة موثقة بالسند للطالبة المتقنة.",
  ],
  coursesKicker: "سجلي في دورتك",
  coursesTitle: "الدورات المتاحة",
  coursesSub: "اختاري الدورة المناسبة لمستواك وابدئي بدرس تجريبي مجاني",
  noCourses: "لم تُنشر دورات بعد — تابعينا قريبًا 🌱",
  free: "مجانية",
  previewLesson: "✓ درس تجريبي",
  studentsCount: "طالبة مسجلة",
  monthly: "/ شهريًا",
  achKicker: "ثقة مبنية على سنوات",
  achTitle: "إنجازات المعلمة",
  testiKicker: "تجارب حقيقية من مسار الإتقان",
  testiTitle: "قول الطالبات",
  ctaAyah: "﴿ وَرَتِّلِ الْقُرْآنَ تَرْتِيلًا ﴾",
  ctaTitle: "ابدئي اليوم — والمقاعد محدودة لكل مستوى",
  ctaSub: "سجّلي حسابك، اختاري الدورة، وابدئي أول درس تجريبي مجانًا",
  ctaRegister: "سجّلي الآن مجانًا",
  ctaLogin: "لدي حساب",
  stepsKicker: "ثلاث خطوات فقط",
  stepsTitle: "كيف تبدئين؟",
  steps: [
    { t: "سجّلي حسابك", d: "باسمك ورقم هاتفك — دقيقة واحدة" },
    { t: "اختاري دورتك وادفعي", d: "سعر واضح حسب دولتك، وبيانات التحويل على واتساب" },
    { t: "ابدئي التلاوة", d: "درس تجريبي مجاني ثم مسارك حتى الإجازة" },
  ],
  aboutKicker: "تعرّفي على معلّمتك",
  aboutTitle: "معلمة إتقان وإجازة",
  statsKicker: "مِنْصَتُنَا",
  statsTitle: "منصتنا بالأرقام",
  statsLabels: ["طالبة مسجلة", "مستويات الإتقان", "قراءات متواترة", "سنوات خبرة"],
  meetTeacher: "معلّمتك",
  contactAdmin: "تواصلي مع الإدارة",
  contactViaWhatsapp: "تواصل واتساب",
  footerBrand: "تعليم القرآن وإتقانه للنساء",
  footerNote: "جميع الدروس محمية بحقوق مائية مرتبطة بهوية الطالبة · صُنعت بعناية 💚",
  stats: [
    { v: "٣", label: "مستويات الإتقان" },
    { v: "١٠", label: "قراءات متواترة" },
    { v: "ﷺ", label: "سند متصل" },
    { v: "١٥+", label: "سنوات خبرة" },
  ],
  // auth
  loginTitle: "تسجيل الدخول",
  loginSub: "بالهاتف وكلمة المرور — جلسة على جهاز واحد فقط",
  phone: "رقم الهاتف",
  country: "الدولة",
  password: "كلمة المرور",
  registerTitle: "حساب جديد",
  registerSub: "اسمك ورقم هاتفك سيظهران كعلامة مائية على الفيديو",
  fullName: "الاسم الكامل",
  createAccount: "إنشاء الحساب",
  noAccount: "ليس لديك حساب؟",
  haveAccount: "لديك حساب؟",
  registerNow: "سجّلي الآن",
  // student dashboard
  welcome: "مرحبًا",
  studentPanel: "لوحة الطالبة",
  liveNow: "🔴 حصص مباشرة الآن",
  joinNow: "انضمي الآن",
  myCourses: "📚 دوراتي",
  noCoursesYet: "لا توجد دورات بعد — تصفّحي الدورات المتاحة",
  lessons: "الدروس",
  recentResults: "📊 آخر النتائج",
  awaitingGrading: "بانتظار التصحيح",
  voucherTitle: "🎟️ تفعيل كوبون",
  redeem: "تفعيل",
  logout: "خروج",
};

const en: typeof ar = {
  bismillah: "In the name of Allah, the Most Gracious, the Most Merciful",
  heroBadge: "✨ Certified Ijazah with connected chain — for women & girls",
  heroTitle1: "Master your recitation…",
  heroTitle2: "and earn your Ijazah",
  startNow: "Start your journey",
  levelsBtn: "The Three Levels ↓",
  badges: ["Certified teacher", "The Ten Qira'at", "1-on-1 follow-up", "Women only"],
  login: "Log in",
  register: "Sign up",
  frameTitle: "From mastery to the connected chain",
  frameSub: "Three structured levels",
  levelsKicker: "A structured path",
  levelsTitle: "Quran Recitation Mastery — Three Levels",
  levelsSub: "You never advance to the next level until the previous one is fully mastered and evaluated",
  levelNames: ["Level 1 — Itqan", "Level 2 — Qira'at", "Level 3 — Ijazah"],
  levelTags: ["Foundations & Tajweed", "The Ten via Al-Shatibiyya & Al-Durra", "With a connected chain"],
  levelDescs: [
    "Correct articulation points of the letters and flawless Tajweed recitation of the Quran from the Mushaf.",
    "The Ten Qira'at through Al-Shatibiyya and Al-Durra, recited and corrected in detail until the two paths are combined.",
    "Ijazah in the mutawatir recitation with a connected chain to the Prophet ﷺ, with documented isnad.",
  ],
  startLevel1: "Start from Level 1",
  methodKicker: "Methodology",
  methodTitle: "How I Teach",
  methodBadge: "۞ The Itqan Method",
  featKicker: "Why this platform?",
  featTitle: "Everything you need to learn and master from home",
  featTitles: [
    "Interactive live classes", "Personal audio feedback", "A safe space for women",
    "Exams & progress tracking", "Easy from your phone", "Certified Ijazah",
  ],
  featDescs: [
    "Live streaming inside the platform with a voice room for Q&A — raise your hand and speak with the teacher directly.",
    "Record your recitation from your phone, send it to the teacher, and receive her audio and written feedback on time.",
    "A modest environment dedicated to women — protected content and a private account for every student.",
    "Instant Tajweed quizzes plus voice-recitation exams graded by the teacher herself.",
    "Install the platform on your home screen like an app — your lessons and classes in one tap.",
    "At the end of each level: a precise final evaluation, then a documented Ijazah with isnad.",
  ],
  coursesKicker: "Enroll in your course",
  coursesTitle: "Available Courses",
  coursesSub: "Choose the course that fits your level and start with a free trial lesson",
  noCourses: "No published courses yet — stay tuned 🌱",
  free: "Free",
  previewLesson: "✓ Trial lesson",
  studentsCount: "students enrolled",
  monthly: "/ month",
  achKicker: "Trust built over years",
  achTitle: "Teacher's Achievements",
  testiKicker: "Real experiences from the Itqan path",
  testiTitle: "Students Say",
  ctaAyah: "﴿ And recite the Quran with measured recitation ﴾",
  ctaTitle: "Start today — seats are limited per level",
  ctaSub: "Create your account, choose your course, and start the free trial lesson",
  ctaRegister: "Sign up free",
  ctaLogin: "I have an account",
  stepsKicker: "Just three steps",
  stepsTitle: "How to start?",
  steps: [
    { t: "Create your account", d: "Name and phone number — one minute" },
    { t: "Choose & pay for your course", d: "Clear price by country, payment details via WhatsApp" },
    { t: "Start reciting", d: "Free trial lesson, then your path all the way to Ijazah" },
  ],
  aboutKicker: "Meet your teacher",
  aboutTitle: "Teacher of Itqan & Ijazah",
  statsKicker: "Our platform",
  statsTitle: "The platform in numbers",
  statsLabels: ["enrolled students", "mastery levels", "mutawatir qira'at", "years of experience"],
  meetTeacher: "Your teacher",
  contactAdmin: "Contact Administration",
  contactViaWhatsapp: "WhatsApp us",
  footerBrand: "Teaching the Quran for women",
  footerNote: "All lessons are watermarked with the student's identity · Crafted with care 💚",
  stats: [
    { v: "3", label: "Mastery levels" },
    { v: "10", label: "Mutawatir Qira'at" },
    { v: "ﷺ", label: "Connected isnad" },
    { v: "15+", label: "Years of experience" },
  ],
  loginTitle: "Log in",
  loginSub: "Phone + password — one device per account",
  phone: "Phone number",
  country: "Country",
  password: "Password",
  registerTitle: "New account",
  registerSub: "Your name and phone appear as a watermark on the video",
  fullName: "Full name",
  createAccount: "Create account",
  noAccount: "No account yet?",
  haveAccount: "Already have an account?",
  registerNow: "Sign up",
  welcome: "Welcome",
  studentPanel: "Student dashboard",
  liveNow: "🔴 Live classes now",
  joinNow: "Join now",
  myCourses: "📚 My courses",
  noCoursesYet: "No courses yet — browse the available courses",
  lessons: "Lessons",
  recentResults: "📊 Recent results",
  awaitingGrading: "Awaiting grading",
  voucherTitle: "🎟️ Redeem a voucher",
  redeem: "Redeem",
  logout: "Log out",
};

const DICTS = { ar, en } as const;

export type Dict = typeof ar;

export function dict(locale: Locale): Dict {
  return DICTS[locale];
}

export async function t(): Promise<Dict> {
  return dict(await getLocale());
}

/** WhatsApp deep link helper (wa.me digits, no + or 00). */
export function waLink(waDigits: string, message: string): string {
  return `https://wa.me/${waDigits.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
}
