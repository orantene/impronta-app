import "server-only";

/**
 * TUL-1324 / TUL-1594: the canonical address of a talent-site service page is `/<word>/<slug>`
 * (`/servicios/sesion-de-fotos`, `/en/services/photo-session`). The id8 form
 * `servicio-<title>-<id8>` and the slugs kept in `offering_slugs` (old titles) are history: they
 * redirect TO it. The legacy form still RENDERS the page (under a canonical that points at the
 * readable path) only when the offering has no readable slug yet, so nothing that worked stops.
 *
 * Gated by the presentation resolver flag. Flag off, table missing, any read error: `none` and
 * the route behaves exactly as before. Never throws.
 */
import { cache } from "react";
import { headers } from "next/headers";

import { ORIGINAL_PATHNAME_HEADER } from "@/i18n/request-locale";
import { isCatalogWordSegment, resolveOfferingPath } from "@/lib/offerings/offering-paths";
import { loadOfferingIndex } from "@/lib/offerings/offering-index.server";
import { servicePresentationResolverEnabled } from "@/lib/services/presentation/flag";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadTalentLocaleSettingsForProxy } from "@/lib/talent-site/talent-site-locale-proxy";
import { loadPublicOfferingsForProfile } from "@/lib/talent/offerings-public";
import { parseServiceSlug, serviceSlug } from "@/lib/talent-site/service-page";
import { stripLocalePrefix } from "@/lib/talent-site/strip-locale-prefix";

export type TalentServiceRoute =
  /** Not a service path (or the feature is off / unreadable): the caller does what it always did. */
  | { kind: "none" }
  /** A `<word>/<slug>` that names no public service: a real 404. */
  | { kind: "missing" }
  /** Permanent redirect to the canonical readable path (history slug, legacy id8 form, locale prefix). */
  | { kind: "redirect"; to: string }
  /** Render this service page; `serviceSlug` is the renderer's own key, `canonicalPath` the readable path. */
  | { kind: "serve"; serviceSlug: string; canonicalPath: string };

export const resolveTalentServiceRoute = cache(
  async (talentProfileId: string, pageSlugKey: string, locale: string): Promise<TalentServiceRoute> => {
    if (!servicePresentationResolverEnabled()) return { kind: "none" };
    const segs = pageSlugKey ? pageSlugKey.split("/") : [];
    const isWordPair = segs.length === 2 && isCatalogWordSegment(segs[0]);
    const isLegacy = segs.length === 1 && parseServiceSlug(segs[0]) !== null;
    if (!isWordPair && !isLegacy) return { kind: "none" };
    try {
      const original = (await headers()).get(ORIGINAL_PATHNAME_HEADER) ?? "";
      if (!original) return { kind: "none" };
      const ls = await loadTalentLocaleSettingsForProxy(talentProfileId);
      const settings = { defaultLocale: ls.defaultLocale, publicLocales: [...ls.supportedLocales] as string[] };
      const index = await loadOfferingIndex(createServiceRoleClient(), {
        owner: { kind: "talent", talentProfileId },
        primaryLocale: ls.defaultLocale,
      });
      if (!index) return { kind: "none" };
      const res = resolveOfferingPath({ pathname: original, host: { hostKind: "talent", settings }, index });
      if (res.kind === "redirect") return { kind: "redirect", to: res.to };
      if (res.kind === "current" || res.kind === "rewrite") {
        const offers = await loadPublicOfferingsForProfile(talentProfileId, locale, null).catch(() => []);
        const target = offers.find((o) => o.id === res.offeringId);
        if (!target) return isWordPair ? { kind: "missing" } : { kind: "none" };
        return { kind: "serve", serviceSlug: serviceSlug(target), canonicalPath: stripLocalePrefix(original, settings.publicLocales) };
      }
      // `missing`: a readable path that names nothing is a 404; a legacy id8 with no readable slug keeps rendering.
      if (res.kind === "missing") return isWordPair ? { kind: "missing" } : { kind: "none" };
      return { kind: "none" };
    } catch {
      return { kind: "none" };
    }
  },
);
