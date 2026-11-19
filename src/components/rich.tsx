/**
 * Renders admin-editable text with `**word**` markers as gold word-highlights
 * (sanad-style). Server-safe (no hooks) so it works inside RSC pages.
 */
export function Rich({
  text,
  dark = false,
  className = "",
}: {
  text: string;
  /** use the stronger gold on dark backgrounds */
  dark?: boolean;
  className?: string;
}) {
  if (!text) return null;
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <span
            key={i}
            className={`mx-1 inline-block rounded-lg px-2.5 py-0.5 text-emerald-950 ${
              dark ? "bg-amber-400" : "bg-amber-300"
            }`}
          >
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
      {className ? null : null}
    </>
  );
}
