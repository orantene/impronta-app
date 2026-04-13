/** Stable display timestamps for admin UI (avoid server/client locale drift in mixed trees). */
export function formatAdminTimestamp(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
