/**
 * Seed: teacher ADMIN account + Quran-teaching profile + sample content.
 * Run: node prisma/seed.mjs
 * Credentials come from env with safe dev defaults — CHANGE THEM IN PRODUCTION.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

// Platform owner (ADMIN) — that is you. Change via env in production.
const ADMIN_PHONE = process.env.ADMIN_PHONE || "0777777777";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin-kh-2024";

// The teacher account (TEACHER) — أ. خولة حتاملة. Change via env in production.
const TEACHER_PHONE = process.env.TEACHER_PHONE || "0700000000";
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || "teacher-kh-2024";

async function main() {
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await db.user.upsert({
    where: { phone: ADMIN_PHONE },
    update: { role: "ADMIN", passwordHash: adminHash, fullName: "مدير المنصة" },
    create: {
      fullName: "مدير المنصة",
      phone: ADMIN_PHONE,
      passwordHash: adminHash,
      role: "ADMIN",
    },
  });
  console.log(`✔ ADMIN (platform owner) ready — phone: ${ADMIN_PHONE}`);

  const teacherHash = await bcrypt.hash(TEACHER_PASSWORD, 12);
  await db.user.upsert({
    where: { phone: TEACHER_PHONE },
    update: { role: "TEACHER", passwordHash: teacherHash, fullName: "أ. خولة حتاملة" },
    create: {
      fullName: "أ. خولة حتاملة",
      phone: TEACHER_PHONE,
      passwordHash: teacherHash,
      role: "TEACHER",
    },
  });
  console.log(`✔ TEACHER (أ. خولة حتاملة) ready — phone: ${TEACHER_PHONE}`);

  const existingProfile = await db.teacherProfile.findFirst();
  if (!existingProfile) {
    await db.teacherProfile.create({
      data: {
        displayName: "أ. خولة حتاملة",
        title: "معلمة قراءات وإتقان وإجازة القراءة بالمستويات الثلاثة",
        bio: "أهلًا بكنّ في منصتي لتعليم القرآن الكريم. متخصصة في تعليم القراءات القرآنية وإتقان التلاوة، ومسندة إجازة القراءة بالسند المتصل للمستويات الثلاثة — للنساء والبنات فقط، ببيئة مريحة ومتواضعة.",
        methodology:
          "أتبع طريقة الإتقان المتدرّج بالمستويات الثلاثة:\n١. الإتقان والتلاوة الصحيحة بأحكام التجويد\n٢. القراءات العشر من طريق الشاطبية والدرة\n٣. الإجازة بالسند المتصل إلى رسول الله ﷺ\n\nكل طالبة تُتابع فرديًا، وتُقيَّم تلاوتها صوتيًا في كل مرحلة، ولا تنتقل للمستوى التالي إلا بعد الإتقان التام والإتقان المتحقق.",
        achievements:
          "إجازة في القراءات العشر من طريقي الشاطبية والدرة بالسند المتصل\nمسندة إجازة لطالبات في المستويات الثلاثة\nإجازة في حفظ القرآن الكريم كاملًا\nخبرة أكثر من ١٥ عامًا في تعليم القرآن للنساء",
        cliqAlias: "",
        bankHint: "",
        whatsappNumber: "",
      },
    });
    console.log("✔ Quran-teacher profile seeded");
  } else if (existingProfile.displayName !== "أ. خولة حتاملة") {
    await db.teacherProfile.update({
      where: { id: existingProfile.id },
      data: { displayName: "أ. خولة حتاملة" },
    });
    console.log("✔ Teacher profile name updated to: أ. خولة حتاملة");
  }

  // Sample testimonials (published) — replace/editable from the admin panel
  const testimonialCount = await db.testimonial.count();
  if (testimonialCount === 0) {
    await db.testimonial.createMany({
      data: [
        {
          name: "أ. خديجة",
          text: "حصلت على الإجازة في القراءة العاشرة بفضل الله ثم بمتابعتها الدقيقة. كانت تنتبه لأدق أحكام التجويد ولا تمرّ على خطأ إلا وقّفته وأصدرته من أصله.",
          level: "المستوى الثالث — الإجازة",
          rating: 5,
          published: true,
        },
        {
          name: "أ. مريم",
          text: "بدأت من الصفر وأنا لا أعرف أحكام التجويد، والآن أقرأ بثقة وإتقان. الشرح مرتب وسهل والمتابعة الفردية أخرجتني عن كل استصعاب.",
          level: "المستوى الأول — الإتقان",
          rating: 5,
          published: true,
        },
        {
          name: "أ. سارة",
          text: "المنصة سهلة جدًا من الجوال، أحضر الحصص المباشرة وأسمع تصحيح تلاوتي صوتيًا في الوقت اللي يناسبني.",
          level: "المستوى الثاني — القراءات",
          rating: 5,
          published: true,
        },
      ],
    });
    console.log("✔ Sample testimonials seeded");
  }

    // ── Courses: دورة الإتقان + دورة الإجازة (المستوى الثالث) — 30 دينار شهريًا ──
  const COURSES = [
    {
      title: "دورة إتقان القراءة — المستوى الأول",
      description: "تأسيس الطالبة على النطق الصحيح وتلاوة القرآن الكريم بأحكام التجويد، مع متابعة فردية أسبوعية وتصحيح صوتي مستمر.",
      level: "المستوى الأول",
      color: "#0b7a5c",
    },
    {
      title: "دورة الإجازة — المستوى الثالث",
      description: "الإجازة في القراءة المتواترة بالسند المتصل إلى رسول الله ﷺ: تسميع دقيق، توثيق السند، ومتابعة حتى الإتقان الكامل.",
      level: "المستوى الثالث",
      color: "#8a6d1f",
    },
  ];
  for (const c of COURSES) {
    const existing = await db.course.findFirst({ where: { title: c.title } });
    if (existing) continue;
    const course = await db.course.create({
      data: {
        title: c.title,
        description: c.description,
        price: 30, // default monthly price (JOD)
        level: c.level,
        published: true,
        coverColor: c.color,
      },
    });
    const module = await db.module.create({
      data: { courseId: course.id, title: "الوحدة الأولى: التأسيس", position: 0 },
    });
    await db.lesson.create({
      data: {
        moduleId: module.id,
        title: "درس تجريبي مجاني — تعريف بالمنصة وطريقة الإتقان",
        youtubeId: "dQw4w9WgXcQ", // replace with a real lesson ID
        access: "FREE_PREVIEW",
        position: 0,
      },
    });
    console.log(`✔ Seeded course: ${c.title} (30 JOD/month)`);
  }

  // Sample per-country pricing: USA pays in USD via override.
  const itqan = await db.course.findFirst({ where: { title: "دورة إتقان القراءة — المستوى الأول" } });
  if (itqan) {
    await db.coursePrice.upsert({
      where: { courseId_countryCode: { courseId: itqan.id, countryCode: "US" } },
      update: { price: 45 },
      create: { courseId: itqan.id, countryCode: "US", price: 45 },
    });
    console.log("✔ Sample US pricing override: $45/month");
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
