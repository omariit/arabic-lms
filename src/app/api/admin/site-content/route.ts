import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { getSiteData, sanitizeSiteData, saveSiteData, SECTION_LABELS } from "@/lib/site-content";

export async function GET() {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  return NextResponse.json({ data: await getSiteData(), labels: SECTION_LABELS });
}

export async function PUT(req: Request) {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  const clean = sanitizeSiteData(body);
  await saveSiteData(clean);
  return NextResponse.json({ ok: true, data: clean });
}
