import { permanentRedirect } from "next/navigation";

import { getRequestLocale } from "@/i18n/request-locale";
import { buildRegisterHref } from "@/lib/auth/register-intent";

/**
 * RETIRED — `/client/register` is now a permanent redirect to
 * `/register?as=client` (P2, one signup front door).
 *
 * This URL is live in the wild: the talent profile portal sends prospective
 * clients here with real payload (`/client/register?intent=inquiry&next=<…>`
 * in `app/t/[profileCode]/profile-view.tsx`), plus saved page-builder link data
 * and agency-host client funnels. `permanentRedirect` answers 308 and carries
 * EVERY param through unchanged, so `intent=inquiry` and the `next` deep link
 * survive the hop.
 *
 * The host-aware post-auth default that used to live here (agency host →
 * `/<slug>/client`, app host → `/client`, marketing/hub → absolute app URL,
 * because `/client` 404s on those surfaces) moved verbatim into
 * `(auth)/register/page.tsx` as `defaultClientNext()`.
 */
export default async function ClientRegisterRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Carry the inbound locale so a Spanish visitor is not dropped onto the
  // English page by the hop (audit A1). withLocaleHref no-ops for the
  // default locale, so EN traffic is byte-identical to before.
  const [params, locale] = await Promise.all([searchParams, getRequestLocale()]);
  permanentRedirect(buildRegisterHref("client", params, locale));
}
