/**
 * Talent custom-domain host route (INTERNAL — never linked).
 *
 * The proxy rewrites every render path on a `kind: "talent_site"` host to this
 * optional catch-all:
 *   - `/`            → `/_talent-site`            → home page (pageSlug null)
 *   - `/<slug>`      → `/_talent-site/<slug>`     → inner site page
 *
 * It reads the resolved talent_profile_id from the host header the proxy set
 * (`x-impronta-talent-profile`) and renders the talent's published Max site via
 * the shared `renderTalentMaxSite()` server function.
 *
 * TRUST INVARIANT — the talent_profile_id is trusted ONLY because it came from
 * the proxy. The proxy strips any client-supplied `x-impronta-talent-profile`
 * AND `x-impronta-host-context` from the inbound request on EVERY path
 * (including the `/_talent-site` short-circuit), then re-sets both only on the
 * legitimate `kind: "talent_site"` rewrite. This route never accepts the
 * profile id from the URL or query string. As defense-in-depth it ALSO requires
 * the resolved `x-impronta-host-context` to equal `"talent_site"`: a direct
 * `/_talent-site` request on a non-talent-site host (app/agency/hub) carries a
 * different (or stripped) host-context and 404s before any render.
 *
 * Gating lives entirely in `renderTalentMaxSite` (Max + published + not hidden;
 * the lookup RPC already required active+published+not-hidden to even resolve
 * the host). Any miss → `notFound()`. Never a throw, never a blank.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";

import { getRequestLocale } from "@/i18n/request-locale";
import {
  HOST_CONTEXT_HEADER,
  HOST_TALENT_PROFILE_HEADER,
} from "@/lib/saas/host-context";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { renderTalentMaxSite } from "@/lib/talent-site/server/render-max-site";
import { resolveGatedTalentProfileId } from "@/lib/talent-site/server/talent-site-host-gate";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

/**
 * Resolve the talent_profile_id from the proxy-set host header — but ONLY when
 * the resolved host context is `talent_site`. The proxy strips any inbound copy
 * of these headers on every path and re-sets them on the legitimate talent_site
 * rewrite, so a direct hit on a non-talent-site host (app/agency/hub) carries a
 * different host-context and resolves to null → notFound().
 */
async function resolveTalentProfileId(): Promise<string | null> {
  try {
    const h = await headers();
    return resolveGatedTalentProfileId({
      hostContext: h.get(HOST_CONTEXT_HEADER),
      talentProfileId: h.get(HOST_TALENT_PROFILE_HEADER),
    });
  } catch {
    return null;
  }
}

function firstSegment(pageSlug: string[] | undefined): string | null {
  if (!pageSlug || pageSlug.length === 0) return null;
  // The proxy only ever rewrites a single page segment here, but guard anyway:
  // a multi-segment path is not a valid talent page → 404.
  if (pageSlug.length > 1) return null;
  return pageSlug[0] ?? null;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ pageSlug?: string[] }>;
  searchParams: Promise<{ preview?: string }>;
}): Promise<Metadata> {
  if (!isSupabaseConfigured()) return {};
  const talentProfileId = await resolveTalentProfileId();
  if (!talentProfileId) return { title: "Not found" };
  const { pageSlug } = await params;
  const { preview } = await searchParams;
  const locale = await getRequestLocale();
  const result = await renderTalentMaxSite({
    talentProfileId,
    pageSlug: firstSegment(pageSlug),
    locale,
    previewDraft: preview === "draft",
  });
  if (result.kind !== "render") return { title: "Not found" };
  const { seo } = result;
  return {
    title: seo.title,
    ...(seo.description ? { description: seo.description } : {}),
    ...(seo.noindex ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function TalentSiteHostPage({
  params,
  searchParams,
}: {
  params: Promise<{ pageSlug?: string[] }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  if (!isSupabaseConfigured()) notFound();
  const talentProfileId = await resolveTalentProfileId();
  if (!talentProfileId) notFound();

  const { pageSlug } = await params;
  const { preview } = await searchParams;
  const locale = await getRequestLocale();

  const result = await renderTalentMaxSite({
    talentProfileId,
    pageSlug: firstSegment(pageSlug),
    locale,
    // Custom-domain host: pages resolve at the domain root, no locale/path
    // prefix (the talent owns the whole apex), so publicPathPrefix stays "".
    previewDraft: preview === "draft",
  });
  if (result.kind !== "render") notFound();
  return result.node;
}
