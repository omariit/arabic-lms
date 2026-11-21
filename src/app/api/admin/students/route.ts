import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";

/** Students list for the device-lock reset console. */
export async function GET() {
  const { error } = await apiUser("STAFF");
  if (error) return error;
  const students = await db.user.findMany({
    where: { role: "STUDENT" },
    select: {
      id: true, fullName: true, phone: true, createdAt: true,
      sessions: { where: { active: true }, select: { id: true, ipAddress: true, createdAt: true } },
      enrollments: { where: { status: "ACTIVE" }, select: { course: { select: { title: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ students });
}
