import { permanentRedirect } from "next/navigation";

import { getRequestLocale } from "@/i18n/request-locale";
import { buildRegisterHref } from "@/lib/auth/register-intent";

/**
 * RETIRED — `/talent/register` is now a permanent redirect to
 * `/register?as=talent` (P2, one signup front door).
 *
 * Kept as a real route rather than deleted, because this URL is live in the
 * wild: marketing CTAs (`lifestyle-band-section.tsx`), saved page-builder link
 * data, agency-host talent funnels (`improntamodels.com/talent/register`), and
 * inbound SEO. `permanentRedirect` answers 308, so link equity and bookmarks
 * follow, and EVERY query param is carried through unchanged (`next`, `email`,
 * `error`, UTM tags) — dropping them is how a funnel silently loses its
 * destination.
 *
 * The route must also stay in `surface-allow-list.ts` AUTH_PREFIXES and in
 * `auth-routing.ts` isAuthFlowPath, or the redirect never runs: the host gate
 * and the auth gate both fire before the page does.
 */
export default async function TalentRegisterRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Carry the inbound locale so a Spanish visitor is not dropped onto the
  // English page by the hop (audit A1). withLocaleHref no-ops for the
  // default locale, so EN traffic is byte-identical to before.
  const [params, locale] = await Promise.all([searchParams, getRequestLocale()]);
  permanentRedirect(buildRegisterHref("talent", params, locale));
}
