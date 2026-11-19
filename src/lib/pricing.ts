import { db } from "@/lib/db";
import { currencyFor, findCountry } from "@/lib/phone";

/**
 * Country-aware pricing resolution.
 * Priority: per-country override (CoursePrice) → course default monthly price.
 */
export type ResolvedPrice = {
  price: number;
  currency: string;
  countryCode: string;
  isOverride: boolean;
};

export function viewerCountry(opts: {
  headerCountry?: string | null; // e.g. cf-ipcountry if the edge provides it
  userCountry?: string | null;   // stored on the registered user
}): string {
  const fromHeader = opts.headerCountry?.toUpperCase();
  if (fromHeader && findCountry(fromHeader)) return fromHeader;
  if (opts.userCountry && findCountry(opts.userCountry)) return opts.userCountry;
  return "JO"; // default market
}

export async function resolveCoursePrice(
  courseId: string,
  countryCode: string
): Promise<ResolvedPrice | null> {
  const course = await db.course.findUnique({
    where: { id: courseId },
    include: { prices: { where: { countryCode } } },
  });
  if (!course) return null;
  const override = course.prices[0];
  return {
    price: override ? override.price : course.price,
    currency: currencyFor(override && override.price !== course.price ? countryCode : "JO"),
    countryCode,
    isOverride: Boolean(override) && override!.price !== course.price,
  };
}

export function formatPrice(price: number, countryCode: string, locale: "ar" | "en" = "ar"): string {
  if (price === 0) return locale === "ar" ? "مجانية" : "Free";
  const cur = currencyFor(countryCode);
  return locale === "ar" ? `${price} ${cur}` : `${cur === "$" ? "$" : ""}${price}${cur === "$" ? "" : " " + cur}`;
}

export { countryName, currencyFor } from "@/lib/phone";
