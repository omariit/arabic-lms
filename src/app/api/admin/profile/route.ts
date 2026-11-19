import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";

export async function GET() {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  let profile = await db.teacherProfile.findFirst();
  if (!profile) {
    profile = await db.teacherProfile.create({
      data: {
        displayName: "المعلمة",
        title: "معلمة",
        bio: "",
        methodology: "",
        achievements: "",
      },
    });
  }
  const oauth = await db.teacherOAuthToken.findFirst();
  return NextResponse.json({ profile, youtubeConnected: Boolean(oauth) });
}

export async function PUT(req: Request) {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const current = await db.teacherProfile.findFirst();
  if (!current) return NextResponse.json({ error: "الملف الشخصي غير موجود" }, { status: 404 });

  const data: Record<string, unknown> = {};
  for (const k of ["displayName", "title", "bio", "methodology", "achievements", "photoUrl", "cliqAlias", "bankHint", "whatsappNumber"]) {
    if (typeof body[k] === "string") data[k] = body[k];
  }
  // Normalize the public WhatsApp number to wa.me digits (no +, no 00).
  if (typeof data.whatsappNumber === "string") {
    const digits = (data.whatsappNumber as string).replace(/\D/g, "").replace(/^00/, "");
    data.whatsappNumber = digits;
  }
  const profile = await db.teacherProfile.update({ where: { id: current.id }, data });
  return NextResponse.json({ profile });
}
