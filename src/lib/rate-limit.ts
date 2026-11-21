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

/** Hits still allowed in the current window (no increment). */
export function rateLimitPeek(key: string, limit: number, windowMs: number): { remaining: number; retryAfter: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket) return { remaining: limit, retryAfter: 0 };
  const hits = bucket.hits.filter((t) => now - t < windowMs);
  bucket.hits = hits;
  if (hits.length < limit) return { remaining: limit - hits.length, retryAfter: 0 };
  return { remaining: 0, retryAfter: Math.ceil((windowMs - (now - hits[0])) / 1000) };
}

/** Clear a bucket — used after a successful login so a legit user never locks out. */
export function rateLimitReset(key: string) {
  buckets.delete(key);
}

export function rateLimitResponse(retryAfter: number, message?: string) {
  const seconds = Math.max(1, retryAfter);
  return Response.json(
    { error: message ?? `محاولات كثيرة جدًا — حاولي بعد ${seconds} ثانية`, retryAfter: seconds },
    { status: 429, headers: { "Retry-After": String(seconds) } }
  );
}
