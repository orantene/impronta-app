/**
 * Past-due grace banner body with real plurals ("1 day" / "7 days",
 * "1 día" / "7 días"). Display only: the grace window itself is resolved by
 * `resolveDunningGrace`; this only words the number of days left.
 */
import { createTranslator } from "@/i18n/messages";
import { withPluralization } from "@/i18n/interpolate";

export function pastDueGraceBody(locale: string | undefined, daysLeft: number): string {
  const tPlural = withPluralization(createTranslator(locale ?? "en"), locale);
  return tPlural("admin.account.billing.pastDueGraceBody", daysLeft);
}
