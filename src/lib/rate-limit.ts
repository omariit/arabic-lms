/**
 * In-memory sliding-window rate limiter.
 * Suited to the single-instance Railway Hobby deployment; per route+IP buckets.
 */
type Bucket = { hits: number[]; };

const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0];
    return { ok: false, retryAfter: Math.ceil((windowMs - (now - oldest)) / 1000) };
  }
  bucket.hits.push(now);
  if (buckets.size > 10_000) {
    // Prune stale buckets to bound memory.
    for (const [k, b] of buckets) {
      if (!b.hits.length || now - b.hits[b.hits.length - 1] > windowMs * 2) buckets.delete(k);
    }
  }
  return { ok: true, retryAfter: 0 };
}

export function rateLimitResponse(retryAfter: number) {
  return Response.json(
    { error: "محاولات كثيرة جدًا، يرجى المحاولة لاحقًا" },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}
