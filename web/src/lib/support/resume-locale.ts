/**
 * Language a support-email resume link should open in: the language the ticket
 * was written in (stored in ticket metadata.locale), falling back to the
 * request locale. Pure so it is testable without a database.
 */
export function resolveResumeLocale(ticketLocale: unknown, requestLocale: string): string {
  return ticketLocale === "es" || ticketLocale === "en" ? ticketLocale : requestLocale;
}
