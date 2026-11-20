import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { LiveRoom } from "@/components/live-room";
import { MeetingRoom } from "@/components/meeting-room";
import { GuestMeeting } from "./guest-meeting";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = { robots: { index: false, follow: false } };

/**
 * Live page. Two room flavours:
 *  • MEETING   — our own video meeting (mesh WebRTC + Socket.io), no YouTube,
 *                guests can join from a public invite link and wait in a lobby.
 *  • CLASSROOM — YouTube live broadcast + audio room (teacher's classic flow).
 */
export default async function LiveClassroomPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ invite?: string }>;
}) {
  const { id } = await params;
  const { invite } = await searchParams;
  const user = await getCurrentUser();

  const live = await db.liveSession.findUnique({ where: { id }, include: { course: true } });
  if (!live) {
    return <main className="mx-auto max-w-3xl px-4 py-16 text-center font-bold">الحصة غير موجودة</main>;
  }

  const isMeeting = live.mode === "MEETING";
  const inviteValid = Boolean(invite) && invite === live.inviteToken && live.guestAllowed;
  const staff = Boolean(user && user.role !== "STUDENT");
  const enrolled = user?.role === "STUDENT"
    ? Boolean(await db.enrollment.findFirst({
        where: { userId: user.id, courseId: live.courseId, status: "ACTIVE" },
        select: { id: true },
      }))
    : false;

  if (live.status === "ENDED") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="mb-2 text-xl font-extrabold">{live.title}</h1>
        <p className="font-bold text-gray-500">انتهت هذه الحصة</p>
        <Link href={user ? "/dashboard" : "/"} className={cn(buttonVariants(), "mt-4")}>عودة</Link>
      </main>
    );
  }

  // ---- Access control ----
  if (!user && !inviteValid) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="mb-2 text-xl font-extrabold">{live.title}</h1>
        <p className="mb-4 font-bold text-gray-500">
          {invite ? "رابط الدعوة غير صالح أو مغلق — سجّلي الدخول للمشاركة" : "سجّلي الدخول للانضمام للحصة"}
        </p>
        <Link href="/login" className={cn(buttonVariants())}>تسجيل الدخول</Link>
      </main>
    );
  }
  if (user?.role === "STUDENT" && !enrolled) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center font-bold">
        يجب التسجيل في «{live.course.title}» للانضمام
      </main>
    );
  }

  if (isMeeting) {
    if (live.status === "SCHEDULED") {
      return (
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="mb-2 text-xl font-extrabold">{live.title}</h1>
          <p className="font-bold text-amber-600">⏰ الحصة مجدولة ولم تبدأ بعد</p>
        </main>
      );
    }

    // Invited guest without a session → name gate, then the room.
    if (!user) {
      return (
        <main className="mx-auto max-w-5xl px-3 pb-24 pt-4">
          <GuestMeeting
            liveId={live.id}
            title={live.title}
            courseTitle={live.course.title}
            inviteToken={invite!}
          />
        </main>
      );
    }

    return (
      <main className="mx-auto max-w-5xl px-3 pb-24 pt-4">
        <MeetingRoom
          liveId={live.id}
          title={live.title}
          courseTitle={live.course.title}
          viewer={{
            role: user.role,
            name: user.fullName,
            isGuest: false,
          }}
          initialChat={[]}
        />
      </main>
    );
  }

  // ---- Legacy YouTube classroom ----
  return (
    <main className="mx-auto max-w-3xl px-4 pb-20 pt-6">
      <h1 className="mb-4 text-xl font-extrabold">🔴 {live.title}</h1>
      {staff && live.inviteToken && (
        <p className="mb-3 rounded-xl bg-brand-50 p-2 text-[11px] text-brand-900/70">
          💡 لفتح حصة داخلية بالفيديو بدون يوتيوب: من لوحة «الحصص المباشرة» اضغطي «حصة داخلية».
        </p>
      )}
      <LiveRoom
        liveSessionId={live.id}
        lessonId={null}
        viewer={{ role: user!.role, name: user!.fullName, phone: user!.phone }}
      />
    </main>
  );
}
