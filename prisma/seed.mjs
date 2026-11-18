/**
 * Seed: create the single teacher ADMIN account + a sample published course.
 * Run: npm run db:seed  (node prisma/seed.mjs)
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

  await db.teacherProfile.upsert({
    where: { id: (await db.teacherProfile.findFirst())?.id ?? "none" },
    update: {},
    create: {
      displayName: "منصة المعلمة",
      title: "معلمة",
      bio: "مرحبًا بكم في منصتي التعليمية — دروس مسجلة، حصص مباشرة، واختبارات متكاملة.",
      methodology: "شرح مبسط خطوة بخطوة، تدريب مستمر، ومتابعة فردية لكل طالبة.",
      achievements: "خبرة تدريس أكثر من 10 سنوات",
    },
  }).catch(() => {});

  const existingCourse = await db.course.findFirst({ where: { title: "مقدمة في الرياضيات" } });
  if (!existingCourse) {
    const course = await db.course.create({
      data: {
        title: "مقدمة في الرياضيات",
        description: "دورة تأسيسية في الرياضيات مع دروس مسجلة وحصص مباشرة واختبارات.",
        price: 0,
        level: "مبتدئ",
        published: true,
      },
    });
    const module = await db.module.create({
      data: { courseId: course.id, title: "الوحدة الأولى: الأساسيات", position: 0 },
    });
    await db.lesson.create({
      data: {
        moduleId: module.id,
        title: "درس تجريبي مجاني — تعريف بالمنصة",
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
