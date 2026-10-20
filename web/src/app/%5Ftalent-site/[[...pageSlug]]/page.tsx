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
import { Suspense } from "react";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { resolveGuestTokenResumeHref } from "@/app/t/[profileCode]/_actions/guest-order-resume-actions";
import { headers } from "next/headers";

import { DocumentLang } from "@/components/i18n/DocumentLang";
import { TalentSiteHostFullNav } from "@/components/talent-site/talent-site-host-full-nav";
import { getRequestLocale, ORIGINAL_PATHNAME_HEADER } from "@/i18n/request-locale";
import {
  HOST_CONTEXT_HEADER,
  HOST_NAME_HEADER,
  HOST_TALENT_PROFILE_HEADER,
} from "@/lib/saas/host-context";
import { LEGACY_PRIVACY_SLUG, POLICY_SLUG } from "@/lib/talent-policies/public";
import { loadPublicOfferingsForProfile } from "@/lib/talent/offerings-public";
import { needsRouteLookup, needsServiceLookup, serviceRouteVerdict, talentRouteVerdict } from "@/lib/talent-site/route-verdict";
import { TalentSitePaintSkeleton } from "@/components/talent-site/TalentSitePaintSkeleton";
import { loadMaxSitePages } from "@/lib/talent-site/server/load-max-site";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { talentGuestAliasTarget, talentGuestServiceAlias } from "@/lib/talent-site/guest-path-aliases";
import { talentNotFoundCopy } from "@/lib/talent-site/talent-not-found-copy";
import { loadTalentNotFoundCopy } from "@/lib/talent-site/server/talent-not-found.server";
import { renderTalentMaxSite } from "@/lib/talent-site/server/render-max-site";
import {
  maxSiteJsonLdString,
  maxSiteSeoToMetadata,
} from "@/lib/talent-site/server/site-metadata";
import { resolveGatedTalentProfileId } from "@/lib/talent-site/server/talent-site-host-gate";
import { TalentOfferingIntentQuery } from "../TalentOfferingIntentQuery";
import { TalentSiteMessagesDock } from "../TalentSiteMessagesDock";
import { ClientAccountDock } from "@/components/client-account/ClientAccountDock";

// TUL-445: anonymous cookieless GETs are CDN-cached at the proxy
// (s-maxage=60, SWR=300). Keep the route eligible for short revalidation;
// signed-in / guest-cookied responses stay private, no-store via proxy.
export const revalidate = 60;

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

/**
 * SEO-2 — the apex origin for the canonical, from the proxy-set host name. The
 * custom domain owns the whole apex, so the canonical is the talent's OWN domain
 * (NEVER the /t/[code] discovery profile). Returns null if the header is absent
 * → render falls back to NEXT_PUBLIC_SITE_URL.
 */
async function resolveServedHost(): Promise<string | undefined> {
  try {
    const h = await headers();
    const host = h.get(HOST_NAME_HEADER)?.trim();
    return host || undefined;
  } catch {
    return undefined;
  }
}

async function resolveCanonicalOrigin(): Promise<string | undefined> {
  const host = await resolveServedHost();
  if (!host) return undefined;
  return `https://${host}`;
}

/** `/en` when the visitor's original path carries the active (secondary) locale prefix. */
async function originalLocalePrefix(locale: string): Promise<string | null> {
  try {
    const h = await headers();
    const first = (h.get(ORIGINAL_PATHNAME_HEADER) ?? "").split("/").filter(Boolean)[0]?.toLowerCase();
    return first && first === locale.toLowerCase() ? first : null;
  } catch {
    return null;
  }
}

/** `/en/<slug>` when the request carried a locale prefix, else `/<slug>`. */
function serviceRedirectPath(localePrefix: string | null, slug: string): string {
  return `${localePrefix ? `/${localePrefix}` : ""}/${encodeURIComponent(slug)}`;
}

function firstSegment(pageSlug: string[] | undefined): string | null {
  if (!pageSlug || pageSlug.length === 0) return null;
  // The proxy only ever rewrites a single page segment here, but guard anyway:
  // a multi-segment path is not a valid talent page → 404.
  if (pageSlug.length > 1) return null;
  return pageSlug[0] ?? null;
}

/** Origin-relative path of this page on the apex (home → "/"). */
function apexPath(pageSlug: string | null): string {
  return pageSlug ? `/${encodeURIComponent(pageSlug)}` : "/";
}

/** GRK-028: a missing page keeps the site's own name and language in the tab. */
async function talentNotFoundMetadata(): Promise<Metadata> {
  const copy = (await loadTalentNotFoundCopy()) ?? talentNotFoundCopy("en", null);
  return { title: { absolute: copy.documentTitle }, robots: { index: false, follow: false } };
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ pageSlug?: string[] }>;
  searchParams: Promise<{ preview?: string; order?: string }>;
}): Promise<Metadata> {
  if (!isSupabaseConfigured()) return {};
  const talentProfileId = await resolveTalentProfileId();
  if (!talentProfileId) return talentNotFoundMetadata();
  const { pageSlug } = await params;
  const { preview } = await searchParams;
  const [locale, canonicalOrigin] = await Promise.all([
    getRequestLocale(),
    resolveCanonicalOrigin(),
  ]);
  const seg = firstSegment(pageSlug);
  const result = await renderTalentMaxSite({
    talentProfileId,
    pageSlug: seg,
    locale,
    // TUL-98: same URL grammar as the page itself (primary at root, secondaries
    // prefixed). Without it the platform grammar made English the "root" and
    // inverted canonical/hreflang on every Spanish-primary talent site.
    hrefMode: "host-root",
    previewDraft: preview === "draft",
    canonicalOrigin,
    canonicalPath: apexPath(seg),
  });
  if (result.kind !== "render") return talentNotFoundMetadata();
  return maxSiteSeoToMetadata(result.seo, { ogLocale: result.locale });
}

export default async function TalentSiteHostPage({
  params,
  searchParams,
}: {
  params: Promise<{ pageSlug?: string[] }>;
  searchParams: Promise<{ preview?: string; order?: string; t?: string }>;
}) {
  if (!isSupabaseConfigured()) notFound();
  const talentProfileId = await resolveTalentProfileId();
  if (!talentProfileId) notFound();

  const { pageSlug } = await params;
  const { preview, order, t: resumeToken } = await searchParams;
  // TUL-11 B: a signed thread token is the only credential for a fresh-browser
  // resume. Verified server-side; any failure falls through to the normal page.
  if (resumeToken) {
    const href = await resolveGuestTokenResumeHref({ token: resumeToken, orderId: order ?? null });
    if (href) redirect(href);
  }
  const [locale, canonicalOrigin, servedHost] = await Promise.all([
    getRequestLocale(),
    resolveCanonicalOrigin(),
    resolveServedHost(),
  ]);
  // TUL-586 defense-in-depth: /servicios|services/<slug> -> canonical service URL
  // (308, locale prefix kept; also handled in the proxy).
  if (pageSlug && pageSlug.length > 1) {
    const serviceAlias = talentGuestServiceAlias(`/${pageSlug.join("/")}`, {
      localePrefix: await originalLocalePrefix(locale),
    });
    if (serviceAlias?.kind === "redirect") permanentRedirect(serviceAlias.path);
  }
  const seg = firstSegment(pageSlug);
  // GRK-028 defense-in-depth: guest path aliases (also handled in the proxy).
  const guestAlias = talentGuestAliasTarget(seg);
  if (guestAlias) redirect(guestAlias);

  // TUL-857: an unknown first segment is a real HTTP 404. The slow render sits behind a
  // Suspense boundary (the old loading.tsx streamed the skeleton first, which locked the
  // status at 200). This check is exact: renderTalentMaxSite resolves a page by slug
  // equality, policy slugs and service slugs only, so we 404 only when the slug is in
  // none of those and in no page row at all (draft or published).
  if (needsRouteLookup(seg, preview)) {
    const verdict = talentRouteVerdict(seg, (await loadMaxSitePages(talentProfileId)).map((p) => p.slug));
    // `/privacy` is the English word talents and footers guess: a real 308 to the policy page (not a streamed redirect).
    if (verdict === "privacy-redirect") permanentRedirect(`/${POLICY_SLUG.privacy}`);
    if (verdict === "not-found") notFound();
  }
  // TUL-1273 #5: a removed or archived service is a real 404 too (same reason as above). The id8 in
  // the slug decides; the public offerings read is the render's own cached read.
  if (needsServiceLookup(seg, preview)) {
    const [offerings, pages] = await Promise.all([
      loadPublicOfferingsForProfile(talentProfileId, locale, null).catch(() => null),
      loadMaxSitePages(talentProfileId),
    ]);
    // The loader returns [] on a failed read as well as for a talent with no services, so an empty
    // result is UNKNOWN: fall through to the renderer rather than hard-404 a live service on a blip.
    if (offerings && offerings.length > 0 && serviceRouteVerdict(seg, offerings, pages.map((p) => p.slug)) === "not-found") notFound();
  }
  return (
    <Suspense fallback={<TalentSitePaintSkeleton locale={locale} />}>
      <TalentSiteBody
        talentProfileId={talentProfileId}
        seg={seg}
        locale={locale}
        preview={preview}
        order={order}
        canonicalOrigin={canonicalOrigin}
        servedHost={servedHost}
      />
    </Suspense>
  );
}

async function TalentSiteBody({
  talentProfileId,
  seg,
  locale,
  preview,
  order,
  canonicalOrigin,
  servedHost,
}: {
  talentProfileId: string;
  seg: string | null;
  locale: string;
  preview: string | undefined;
  order: string | undefined;
  canonicalOrigin: string | undefined;
  servedHost: string | undefined;
}) {
  const result = await renderTalentMaxSite({
    talentProfileId,
    pageSlug: seg,
    locale,
    // Talent HOST (custom domain or `<slug>.tulala.digital`): pages resolve at
    // the host root, no locale/path prefix (the talent owns the whole apex), so
    // publicPathPrefix stays "" and the shell nav is addressed from the root.
    hrefMode: "host-root",
    previewDraft: preview === "draft",
    canonicalOrigin,
    canonicalPath: apexPath(seg),
  });
  // `/privacy` is the English word talents and footers guess; it used to 404
  // unless authored. The policy page lives at `/privacidad`.
  if (result.kind !== "render" && seg === LEGACY_PRIVACY_SLUG) permanentRedirect(`/${POLICY_SLUG.privacy}`);
  // TUL-1272 C1: an old service slug 308s to the current one, keeping the locale prefix. In-stream
  // fallback: the pre-Suspense 308 moves into the route verdict once #4080 merges.
  if (result.kind === "redirect") permanentRedirect(serviceRedirectPath(await originalLocalePrefix(locale), result.slug));
  if (result.kind !== "render") notFound();
  const jsonLd = maxSiteJsonLdString(result.seo);
  return (
    <>
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd }}
        />
      ) : null}
      <DocumentLang locale={result.locale} />
      {servedHost ? <TalentSiteHostFullNav servedHost={servedHost} /> : null}
      {result.node}
      <TalentOfferingIntentQuery />
      {/* TUL-554: the two docks are async server components with their own
          queries (service-role reads, session). Inside the outer Suspense they
          held the whole page's first flush until the slowest one resolved.
          Own boundaries with a null fallback let the site node paint first;
          both are fixed-position chrome, so nothing shifts when they arrive. */}
      <Suspense fallback={null}>
        <TalentSiteMessagesDock talentProfileId={talentProfileId} locale={result.locale} orderId={order ?? null} />
      </Suspense>
      <Suspense fallback={null}>
        <ClientAccountDock locale={result.locale} />
      </Suspense>
    </>
  );
}
