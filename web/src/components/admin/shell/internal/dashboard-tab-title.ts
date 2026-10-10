/**
 * Browser tab title for the admin/talent dashboard shell.
 *
 * Bare "Tulala" hid which page the talent was on (TUL-146 / C1-09 tab title).
 * Format: "[(N) ]Page · Tulala" with Page already localized by the caller.
 */

export function dashboardTabTitle({
  pageLabel,
  unread = 0,
  brand = "Tulala",
}: {
  pageLabel: string | null | undefined;
  unread?: number;
  brand?: string;
}): string {
  const page = pageLabel?.trim() || "";
  const base = page ? `${page} · ${brand}` : brand;
  return unread > 0 ? `(${unread}) ${base}` : base;
}
