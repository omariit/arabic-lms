import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";

/** Security violation logs (watermark tamper, tab switches, device mismatches). */
export async function GET(req: Request) {
  const { error } = await apiUser("ADMIN");
  if (error) return error;
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const violations = await db.securityViolation.findMany({
    where: type ? { type: type as never } : undefined,
    include: { user: { select: { fullName: true, phone: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ violations });
}
