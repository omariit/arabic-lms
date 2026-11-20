/**
 * QA seed — STAGING ONLY.
 *
 * Creates the accounts and content the Playwright suite drives. Refuses to run
 * unless QA_SEED=1 and the target database is not the production project.
 *
 *   QA_SEED=1 DATABASE_URL="postgresql://postgres:PW@shinkansen.proxy.rlwy.net:14090/railway" \
 *     node prisma/seed-qa.mjs
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

if (process.env.QA_SEED !== "1") {
  console.error("Refusing to seed: set QA_SEED=1 explicitly.");
  process.exit(1);
}
if (/turntable\.proxy\.rlwy\.net/.test(process.env.DATABASE_URL ?? "")) {
  console.error("Refusing to seed: that host is the PRODUCTION proxy.");
  process.exit(1);
}

const db = new PrismaClient();

const PW = "qa-pass-2026";
const ACCOUNTS = {
  admin: { phone: "+962790000001", name: "مديرة الاختبار", role: "ADMIN" },
  teacher: { phone: "+962790000002", name: "أ. خولة (اختبار)", role: "TEACHER" },
  assistant: { phone: "+962790000003", name: "مساندة الاختبار", role: "ASSISTANT" },
  student1: { phone: "+962790000004", name: "سارة الاختبار", role: "STUDENT" },
  student2: { phone: "+962790000005", name: "مريم الاختبار", role: "STUDENT" },
  student3: { phone: "+962790000006", name: "هند الاختبار", role: "STUDENT" },
};

const QA_MARK = "QA-";

async function main() {
  const hash = await bcrypt.hash(PW, 10);
  const users = {};
  for (const [key, acc] of Object.entries(ACCOUNTS)) {
    users[key] = await db.user.upsert({
      where: { phone: acc.phone },
      update: { fullName: acc.name, role: acc.role, passwordHash: hash, countryCode: "JO" },
      create: {
        fullName: acc.name,
        phone: acc.phone,
        countryCode: "JO",
        role: acc.role,
        passwordHash: hash,
      },
    });
  }

  // Teacher profile with payment destinations filled so the payment page is testable.
  const profile = await db.teacherProfile.findFirst();
  const profileData = {
    displayName: "أ. خولة حتاملة",
    title: "معلمة قراءات وإتقان وإجازة القراءة بالمستويات الثلاثة",
    bio: "معلمة قرآن كريم — حساب اختبار الجودة.",
    methodology: "إتقان متدرّج بالمستويات الثلاثة مع تقييم صوتي لكل طالبة.",
    achievements: "إجازة بالسند المتصل\nخبرة تدريس",
    cliqAlias: "khawla@cliq",
    bankHint: "بنك الإسكان — حساب 123456789",
    whatsappNumber: "962790000002",
  };
  if (profile) await db.teacherProfile.update({ where: { id: profile.id }, data: profileData });
  else await db.teacherProfile.create({ data: profileData });

  // Fresh QA course each run.
  await db.course.deleteMany({ where: { title: { startsWith: QA_MARK } } });

  const course = await db.course.create({
    data: {
      title: `${QA_MARK}دورة اختبار الجودة`,
      description: "دورة اختبار كاملة تُستخدم للتحقّق الآلي من كل وظائف المنصة.",
      level: "المستوى الأول",
      price: 30,
      published: true,
      outcomes: "تلاوة صحيحة\nأحكام التجويد\nضبط المخارج",
      requirements: "إلمام بقراءة القرآن",
      weeklyMeetings: "السبت 6:00 م\nالثلاثاء 7:00 م",
      modules: {
        create: [
          {
            title: "القسم الأول: الأساسيات",
            position: 0,
            lessons: {
              create: [
                {
                  title: "الدرس الأول: مخارج الحروف",
                  youtubeId: "dQw4w9WgXcQ",
                  duration: 420,
                  position: 0,
                  access: "FREE_PREVIEW",
                  description: "وصف تجريبي للدرس الأول.",
                  scriptText: "نص الدرس الأول للاختبار.",
                  assignmentTitle: "تسجيل سورة الفاتحة",
                  assignmentInstructions: "سجّلي تلاوة الفاتحة بصوت واضح.",
                },
                {
                  title: "الدرس الثاني: أحكام النون الساكنة",
                  youtubeId: "dQw4w9WgXcQ",
                  duration: 380,
                  position: 1,
                  description: "وصف تجريبي للدرس الثاني.",
                },
              ],
            },
          },
          {
            title: "القسم الثاني: التطبيق",
            position: 1,
            lessons: {
              create: [
                {
                  title: "الدرس الثالث: التطبيق العملي",
                  youtubeId: "dQw4w9WgXcQ",
                  duration: 500,
                  position: 0,
                  assignmentTitle: "تسجيل سورة الإخلاص",
                  assignmentInstructions: "سجّلي الإخلاص مع مراعاة المدود.",
                },
              ],
            },
          },
        ],
      },
      prices: { create: [{ countryCode: "US", price: 12 }, { countryCode: "SA", price: 100 }] },
    },
    include: { modules: { include: { lessons: true } } },
  });

  const lessons = course.modules.flatMap((m) => m.lessons);
  const firstLesson = lessons[0];

  // Exams: one MCQ (published) and one voice exam (published).
  await db.exam.create({
    data: {
      courseId: course.id,
      title: `${QA_MARK}اختبار تجويد`,
      type: "MCQ",
      durationMin: 15,
      published: true,
      questions: {
        create: [
          { text: "كم عدد مخارج الحروف الرئيسية؟", type: "MCQ", options: ["خمسة", "سبعة", "عشرة"], correctIndex: 0, position: 0 },
          { text: "النون الساكنة تُدغم في حروف الإظهار.", type: "TRUE_FALSE", options: ["صح", "خطأ"], correctIndex: 1, position: 1 },
        ],
      },
    },
  });
  await db.exam.create({
    data: { courseId: course.id, title: `${QA_MARK}اختبار صوتي`, type: "VOICE", durationMin: 20, published: true },
  });

  // Repeatable runs: clear attempts and pending requests left by earlier runs.
  await db.examAttempt.deleteMany({ where: { userId: { in: [users.student1.id, users.student3.id] } } });
  await db.enrollmentRequest.deleteMany({ where: { userId: { in: [users.student2.id, users.student3.id] } } });
  await db.enrollment.deleteMany({ where: { userId: users.student3.id } });

  // Enroll student1 (active) + a pending request for student2 (receipt flow).
  await db.enrollment.upsert({
    where: { userId_courseId: { userId: users.student1.id, courseId: course.id } },
    update: { status: "ACTIVE" },
    create: { userId: users.student1.id, courseId: course.id, status: "ACTIVE", grantedVia: "manual" },
  });
  await db.enrollmentRequest.deleteMany({ where: { userId: users.student2.id, courseId: course.id } });
  await db.enrollmentRequest.create({
    data: {
      userId: users.student2.id,
      courseId: course.id,
      receiptRef: "QA-RECEIPT-001",
      note: "طلب اختبار آلي",
      status: "PENDING",
    },
  });

  // Lesson thread sample so the teacher inbox is never empty.
  await db.lessonThread.deleteMany({ where: { lessonId: firstLesson.id } });
  const thread = await db.lessonThread.create({
    data: { lessonId: firstLesson.id, studentId: users.student1.id },
  });
  await db.lessonMessage.create({
    data: { threadId: thread.id, senderId: users.student1.id, senderRole: "STUDENT", body: "سؤال اختبار: كيف أضبط المد؟" },
  });

  // A voucher the student flow can redeem.
  await db.voucher.deleteMany({ where: { code: { startsWith: "QA" } } });
  await db.voucher.create({
    data: { code: "QA-VOUCHER-2026", courseId: course.id, createdBy: users.teacher.id },
  });

  const state = {
    baseUrl: process.env.NEXT_PUBLIC_APP_URL || "",
    courseId: course.id,
    lessonId: firstLesson.id,
    phone: ACCOUNTS,
    password: PW,
  };
  (await import("node:fs")).writeFileSync("tests/e2e/.qa-state.json", JSON.stringify(state, null, 2));

  console.log(JSON.stringify({
    courseId: course.id,
    lessonId: firstLesson.id,
    accounts: Object.fromEntries(Object.entries(ACCOUNTS).map(([k, v]) => [k, { phone: v.phone, password: PW, role: v.role }])),
  }, null, 2));

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
