// Talent → Jobs for you (TUL-1598). Open "match me" jobs offered to this professional; first to accept wins.
import { notFound } from "next/navigation";

import { getRequestLocale } from "@/i18n/request-locale";
import { matchMeEnabled } from "@/lib/match-me/flag";
import { loadMyMatchOffers } from "@/lib/match-me/match-views.server";
import { MATCH_OFFERS_COPY } from "@/lib/match-me/match-me-copy";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import { MatchOffersList } from "./MatchOffersList";

export const dynamic = "force-dynamic";

export default async function MatchOffersPage() {
  // TUL-1464: dark until MATCH_ME_ENABLED is "true" (the held match-me migration must be applied first).
  if (!matchMeEnabled()) notFound();
  const locale = (await getRequestLocale()) === "es" ? "es" : "en";
  const c = MATCH_OFFERS_COPY[locale];
  const me = await requireTalentSelf();
  const offers = me.ok ? await loadMyMatchOffers(me.talentProfile.id) : [];
  return (
    <main style={{ padding: 24, maxWidth: 720, fontFamily: "Inter, system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>{c.heading}</h1>
      <p style={{ fontSize: 13, opacity: 0.75, margin: "0 0 16px" }}>{c.hint}</p>
      <MatchOffersList locale={locale} offers={offers} />
    </main>
  );
}
