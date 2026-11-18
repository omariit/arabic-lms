/**
 * Seed: teacher ADMIN account + Quran-teaching profile + sample content.
 * Run: node prisma/seed.mjs
 * Credentials come from env with safe dev defaults — CHANGE THEM IN PRODUCTION.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const ADMIN_PHONE = process.env.ADMIN_PHONE || "0700000000";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "changeme-teacher-1";

async function main() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await db.user.upsert({
    where: { phone: ADMIN_PHONE },
    update: { role: "ADMIN" },
    create: {
      fullName: "المعلمة",
      phone: ADMIN_PHONE,
      passwordHash,
      role: "ADMIN",
    },
  });
  console.log(`✔ ADMIN teacher ready — phone: ${ADMIN_PHONE}`);

  const existingProfile = await db.teacherProfile.findFirst();
  if (!existingProfile) {
    await db.teacherProfile.create({
      data: {
        displayName: "أ. أم سلمى",
        title: "معلمة قراءات وإتقان وإجازة القراءة بالمستويات الثلاثة",
        bio: "أهلًا بكنّ في منصتي لتعليم القرآن الكريم. متخصصة في تعليم القراءات القرآنية وإتقان التلاوة، ومسندة إجازة القراءة بالسند المتصل للمستويات الثلاثة — للنساء والبنات فقط، ببيئة مريحة ومتواضعة.",
        methodology:
          "أتبع طريقة الإتقان المتدرّج بالمستويات الثلاثة:\n١. الإتقان والتلاوة الصحيحة بأحكام التجويد\n٢. القراءات العشر من طريق الشاطبية والدرة\n٣. الإجازة بالسند المتصل إلى رسول الله ﷺ\n\nكل طالبة تُتابع فرديًا، وتُقيَّم تلاوتها صوتيًا في كل مرحلة، ولا تنتقل للمستوى التالي إلا بعد الإتقان التام والإتقان المتحقق.",
        achievements:
          "إجازة في القراءات العشر من طريقي الشاطبية والدرة بالسند المتصل\nمسندة إجازة لطالبات في المستويات الثلاثة\nإجازة في حفظ القرآن الكريم كاملًا\nخبرة أكثر من ١٥ عامًا في تعليم القرآن للنساء",
        cliqAlias: "",
        bankHint: "",
      },
    });
    console.log("✔ Quran-teacher profile seeded");
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

  const existingCourse = await db.course.findFirst({ where: { title: "مقدمة في الرياضيات" } });
  if (!existingCourse) {
    const course = await db.course.create({
      data: {
        title: "إتقان القراءة والتجويد — المستوى الأول",
        description: "تأسيس الطالبة على النطق الصحيح وتلاوة القرآن الكريم بأحكام التجويد، مع متابعة فردية أسبوعية وتصحيح صوتي مستمر.",
        price: 0,
        level: "المستوى الأول",
        published: true,
      },
    });
    const module = await db.module.create({
      data: { courseId: course.id, title: "الوحدة الأولى: مخارج الحروف وأحكام التجويد", position: 0 },
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
    console.log("✔ Sample course seeded");
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
