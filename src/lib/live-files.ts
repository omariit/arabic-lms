/**
 * Ownership rule for files shared inside a live room.
 *
 * The key layout is `livefile/<YYYY-MM-DD>/<owner>/<uuid>` where `<owner>` is:
 *   • the uploading user's id for signed-in staff/students, or
 *   • the live session id for invited guests (they have no account).
 *
 * The socket trusts the client with a `fileKey`, so this is the single place that
 * decides whether the key may be attached to that room. Pure + unit tested.
 */
export function liveFileKeyAllowed(
  key: string | null | undefined,
  owner: { userId?: string | null; liveSessionId: string },
): boolean {
  if (!key) return false;
  const parts = key.split("/");
  if (parts.length < 4) return false;
  if (parts[0] !== "livefile") return false;
  const segment = parts[2];
  if (segment === owner.liveSessionId) return true;
  return Boolean(owner.userId) && segment === owner.userId;
}

/** Build the key prefix for a guest upload (guests own their files by session). */
export function liveFileKey(prefix: string, id: string): string {
  return `${prefix}${id}`;
}
