import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";

/** Testimonials management for the teacher (shown on the public landing page). */
export async function GET() {
  const { error } = await apiUser("ADMIN");
  if (error) return error;
  const testimonials = await db.testimonial.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return NextResponse.json({ testimonials });
}

export async function POST(req: Request) {
  const { error } = await apiUser("ADMIN");
  if (error) return error;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string; text?: string; level?: string; rating?: number; published?: boolean;
  };
  if (!body.name?.trim() || !body.text?.trim()) {
    return NextResponse.json({ error: "الاسم والنص مطلوبان" }, { status: 400 });
  }
  const testimonial = await db.testimonial.create({
    data: {
      name: body.name.trim(),
      text: body.text.trim(),
      level: body.level?.trim() || null,
      rating: Math.min(5, Math.max(1, Number(body.rating) || 5)),
      published: Boolean(body.published),
    },
  });
  return NextResponse.json({ testimonial });
}
