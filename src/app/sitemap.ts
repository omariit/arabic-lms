import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://arabic-lms-production.up.railway.app";

// DB-driven: never prerender at build time
export const dynamic = "force-dynamic";

/** Dynamic sitemap: landing, public pages, and published courses. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${BASE}/courses`, changeFrequency: "weekly", priority: 0.9 },
    { url: BASE, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/login`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE}/register`, changeFrequency: "monthly", priority: 0.8 },
  ];

  let courseEntries: MetadataRoute.Sitemap = [];
  try {
    const courses = await db.course.findMany({
      where: { published: true },
      select: { id: true, updatedAt: true },
    });
    courseEntries = courses.map((c) => ({
      url: `${BASE}/courses/${c.id}`,
      lastModified: c.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    }));
  } catch {
    // DB cold start — static entries are enough
  }

  return [...staticEntries, ...courseEntries];
}
