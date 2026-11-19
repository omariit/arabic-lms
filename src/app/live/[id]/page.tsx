import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { LiveRoom } from "@/components/live-room";


export const metadata = { robots: { index: false, follow: false } };
export default async function LiveClassroomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return <main className="mx-auto max-w-3xl px-4 py-16 text-center font-bold">سجّلي الدخول للانضمام للحصة</main>;
  }

  const live = await db.liveSession.findUnique({
    where: { id },
    include: { course: true },
  });
  if (!live) {
    return <main className="mx-auto max-w-3xl px-4 py-16 text-center font-bold">الحصة غير موجودة</main>;
  }

  if (user.role !== "ADMIN") {
    const enrollment = await db.enrollment.findFirst({
      where: { userId: user.id, courseId: live.courseId, status: "ACTIVE" },
    });
    if (!enrollment) {
      return <main className="mx-auto max-w-3xl px-4 py-16 text-center font-bold">يجب التسجيل في «{live.course.title}» للانضمام</main>;
    }
  }

  if (live.status === "ENDED") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="mb-2 text-xl font-extrabold">{live.title}</h1>
        <p className="font-bold text-gray-500">انتهت هذه الحصة</p>
      </main>
    );
  }

  if (live.status === "SCHEDULED") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="mb-2 text-xl font-extrabold">{live.title}</h1>
        <p className="font-bold text-amber-600">⏰ الحصة مجدولة ولم تبدأ بعد</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-20 pt-6">
      <h1 className="mb-4 text-xl font-extrabold">🔴 {live.title}</h1>
      <LiveRoom liveSessionId={live.id} lessonId={null} viewer={{ role: user.role, name: user.fullName, phone: user.phone }} />
    </main>
  );
}
