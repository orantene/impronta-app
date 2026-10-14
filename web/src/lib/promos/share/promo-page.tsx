import "server-only";

import type { Metadata } from "next";

import { PromoLanding } from "@/components/promos/share/promo-landing";
import { conditionLine, offerHeadline, type ShareLang } from "./captions";
import { LANDING_ROBOTS } from "./landing-copy";
import { parseVia } from "./links";
import { resolvePromoLink, type PromoScope } from "./resolve";

/**
 * Shared server half of both promo routes (talent host `/p/<slug>` and hub
 * `/t/<code>/p/<slug>`). The page is anonymous and cacheable: it only reads;
 * the beacon logs the open and sets the cookie through the event API.
 */
export type PromoPageInput = {
  scope: PromoScope;
  slug: string;
  lang: ShareLang;
  searchParams: { via?: string; t?: string };
  /** Hub pages live under /t/<code>; host pages at the origin root. */
  homeHref: (profileCode: string) => string;
  /** Canonical = the site, never the promo page. */
  canonicalPath: (profileCode: string) => string;
};

export async function promoPageMetadata(input: PromoPageInput): Promise<Metadata> {
  const r = await resolvePromoLink(input.scope, input.slug, input.searchParams.t);
  const code = r.talent?.profileCode ?? "";
  return {
    title: r.talent?.displayName || undefined,
    // L8: every promo page is noindex and canonical to the site.
    robots: LANDING_ROBOTS,
    alternates: code ? { canonical: input.canonicalPath(code) } : undefined,
  };
}

export async function renderPromoPage(input: PromoPageInput) {
  const r = await resolvePromoLink(input.scope, input.slug, input.searchParams.t);
  const code = r.talent?.profileCode ?? "";
  const home = input.homeHref(code);
  const showPromo = r.promo && r.landing.state !== "gone" && r.landing.state !== "personal_locked";
  const ctaHref =
    r.target.kind === "service" && r.landing.state === "live"
      ? `${home}${home.includes("?") ? "&" : "?"}service=${encodeURIComponent(r.target.serviceId)}`
      : home;
  const via = parseVia(input.searchParams.via) ?? "link";
  return (
    <PromoLanding
      state={r.landing.state}
      lang={input.lang}
      talentName={r.talent?.displayName ?? ""}
      headline={showPromo && r.promo ? offerHeadline(r.promo, input.lang) : null}
      condition={showPromo && r.promo ? conditionLine(r.promo, input.lang) : null}
      ctaHref={ctaHref}
      alternatives={r.alternatives.map((a) => ({
        id: a.promo.id,
        headline: offerHeadline(a.promo, input.lang),
        href: home,
      }))}
      beacon={showPromo && r.promo ? { promoId: r.promo.id, via, token: input.searchParams.t ?? null } : null}
    />
  );
}

/** OG card for a promo link. Personal, locked and gone promos get the generic card, never details. */
export async function renderPromoOg(scope: PromoScope, slug: string, lang: ShareLang) {
  const { renderPromoOgCard } = await import("./visuals");
  const { DEFAULT_SHARE_COLORS } = await import("./visual-model");
  // No token here: a personal promo can never reach its own details through the OG card.
  const r = await resolvePromoLink(scope, slug, null);
  const showPromo = r.promo && !r.landing.isPersonal && (r.landing.state === "live" || r.landing.state === "scheduled");
  return renderPromoOgCard({
    lang,
    talentName: r.talent?.displayName ?? "",
    headline: showPromo && r.promo ? offerHeadline(r.promo, lang) : null,
    condition: showPromo && r.promo ? conditionLine(r.promo, lang) : null,
    colors: DEFAULT_SHARE_COLORS,
  });
}
