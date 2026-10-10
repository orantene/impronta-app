import "server-only";

import type { ReactNode } from "react";
import { loadHistoryPreviewSnapshot } from "../history/history.server";
import { loadThemeUpdatePreviewSnapshot } from "../theme-releases/talent-update/talent-update.server";
import { early } from "@/lib/server/early";
import { perfMark, perfStart, timed } from "@/lib/server/perf-trace";
import { failOnReadTimeout } from "@/lib/supabase/bounded-fetch-scope";
import { loadMaxSiteIsDemo } from "./render-max-site-demo";
import { hasRenderableBuilderNodes } from "@/lib/site-admin/builder-node";
import { prepareTalentSiteTrees } from "./talent-site-render-fixups.server";
import { getCachedActorSession } from "@/lib/server/request-cache";

import {
  buildMaxSiteNav,
  coerceTree,
  hydrateShellNav,
  maxSitePublicGate,
  scopeMaxSitePagesToPlan,
  selectMaxSitePage,
  type MaxSiteRow,
  type MaxSitePageRow,
} from "@/lib/talent-site/resolve-max-site-core";
import { talentPlanGrantsSiteCapability } from "@/lib/access/talent-membership";
import { scrubTalentSiteSeo } from "@/lib/talent-site/free-site-seo";
import { talentSiteShowsPlatformBadge } from "@/lib/talent-site/free-site-badge";
import { pruneUnconfirmedGuestStubs } from "@/lib/talent-site/prune-unconfirmed-guest-stubs";
import { publicPageBody } from "@/lib/talent-site/talent-page-publish-core";

import {
  loadMaxSiteByProfileId,
  loadMaxSiteBySlug,
  loadMaxSitePages,
  loadMaxSiteThemeTokens,
  loadMaxSiteDesignSlug,
  loadTalentManagingTenantId,
  loadTalentOwnerUserId,
  loadTalentPlanKey,
  loadTalentSiteCtaMode,
  loadTalentSiteIdentity,
} from "./load-max-site";
import { buildMaxSiteSeo, type MaxSiteSeo } from "./max-site-seo.server";
import { loadMaxSiteSeoFacts } from "./max-site-seo-facts.server";
import { loadTalentSiteLocaleContext } from "./talent-site-locale.server";
import { webOfficeCtxFor } from "./web-office-footer";
import { webOfficeSocialEnabled } from "../web-office-social";
import { loadTalentPolicyModel, policyMainNode, policySeo } from "./policy-main";
import { policyDocForSlug } from "@/lib/talent-policies/public";
import { renderMaxSiteDocument } from "./render-max-site-document";

/** Re-export so existing `import type { MaxSiteSeo } from "./render-max-site"` stays valid. */
export type { MaxSiteSeo };

/**
 * Talent Max Site — REUSABLE public render.
 *
 * `renderTalentMaxSite()` resolves a talent's Max site (by `siteSlug` OR
 * `talentProfileId` — the latter for the sibling's custom-domain flow), plan-
 * and publish-gates it, picks the requested page, and renders the page's
 * freeform `blocks` tree INSIDE the talent's own SHELL (the `shell_published`
 * header/footer/logo tree, with the site's pages injected as nav). The page body
 * reuses the SAME freeform render path as `/t/[code]/[slug]`
 * (`renderFreeformPageRootTree`) — it does NOT reimplement any node.
 *
 * Returns a discriminated result so the route page can map `not_found` → 404
 * without this function importing `next/navigation`:
 *   - `{ kind: "render", node, seo }` — paint `node`; apply `seo` in metadata.
 *   - `{ kind: "not_found" }` — 404 (missing site/page, closed gate, empty page).
 *
 * NEVER throws to the visitor — every resolution miss degrades to `not_found`.
 */

export interface RenderTalentMaxSiteInput {
  /** Resolve the site by its globally-unique slug (the /t/site/<slug> path). */
  siteSlug?: string;
  /** OR resolve by talent profile id (the sibling's custom-domain host flow). */
  talentProfileId?: string;
  /** The page within the site; omitted → the home page. */
  pageSlug?: string | null;
  /** The visitor's resolved locale (drives section-embed + font loading). */
  locale: string;
  /** Locale path prefix (e.g. "/es") for hrefs. */
  publicPathPrefix?: string;
  /**
   * How the site's own nav links are addressed. The `/t/site/[siteSlug]` routes
   * keep "path" (the default). The `_talent-site` HOST route passes "host-root",
   * because on a talent host the site IS the root: a `/t/site/<slug>/<page>`
   * href there is a 3-segment path, which `isTalentSiteHostPathAllowed` rejects,
   * so every inner nav link 404s. Default preserved so no existing caller moves.
   */
  hrefMode?: "path" | "host-root";
  /** Owner draft preview (`?preview=draft`). Renders draft shell + draft pages. */
  previewDraft?: boolean;
  /** With `previewDraft`: render one history entry's snapshot, read-only (`&history=<id>`). */
  previewHistoryEntryId?: string | null;
  /** Phase 4: owner preview of a theme update merged in memory (`?themeUpdate=<id>`). */
  previewThemeUpdateId?: string | null;
  /**
   * SEO-2 — the absolute origin this page is served from, for the canonical URL.
   * `/t/site/[siteSlug]` routes pass the app origin (NEXT_PUBLIC_SITE_URL); the
   * custom-domain catch-all passes the apex host (so the canonical points at the
   * talent's OWN domain, never the discovery profile). Falls back to
   * NEXT_PUBLIC_SITE_URL when omitted.
   */
  canonicalOrigin?: string;
  /**
   * SEO-2 — the path (origin-relative, leading slash) this page is served at,
   * used to build the default canonical when the page has no explicit
   * `canonical_url`. Routes pass their own path (`/t/site/<slug>[/<page>]`, or
   * `/[<page>]` for a custom-domain apex).
   */
  canonicalPath?: string;
}

export type RenderTalentMaxSiteResult =
  | { kind: "render"; node: ReactNode; seo: MaxSiteSeo; /** The locale the body rendered in (bounded to the talent languages). */ locale: string }
  | { kind: "not_found" };

const NOT_FOUND: RenderTalentMaxSiteResult = { kind: "not_found" };

/**
 * Resolve the site row from either key. By-slug is the primary path; by-profile
 * is the custom-domain path. Returns null when neither key resolves a row.
 */
const resolveSiteRow = async (input: RenderTalentMaxSiteInput): Promise<MaxSiteRow | null> =>
  input.siteSlug ? loadMaxSiteBySlug(input.siteSlug) : input.talentProfileId ? loadMaxSiteByProfileId(input.talentProfileId) : null;

/** TUL-444: a read that timed out must surface as an error (500, never cached), not a 404 or a half-rendered site. */
export const renderTalentMaxSite = (input: RenderTalentMaxSiteInput): Promise<RenderTalentMaxSiteResult> =>
  failOnReadTimeout(() => renderTalentMaxSiteUnguarded(input));

async function renderTalentMaxSiteUnguarded(
  input: RenderTalentMaxSiteInput,
): Promise<RenderTalentMaxSiteResult> {
  const t0 = perfStart();
  try {
    // TUL-444 / TUL-495: per-loader wall-clock spans (TULALA_PERF_TRACE=1).
    const site = await timed("maxSite.resolveSite", () => resolveSiteRow(input));
    if (!site || !site.siteSlug) return NOT_FOUND;

    const talentProfileId = site.talentProfileId;
    const previewDraft = input.previewDraft === true;
    // Owner draft / history / theme-update preview: bypass the public Data Cache
    // so a save is visible immediately (TTL is up to 5 min otherwise).
    const bypassCache = previewDraft;
    // The talent's own languages: bounds the locale, feeds the header switch, the `node.i18n` overlays and hreflang (PR 4 + 5).
    const pLocale = early(timed("maxSite.locale", () => loadTalentSiteLocaleContext({ talentProfileId, requestedLocale: input.locale, hrefMode: input.hrefMode, pagePath: input.canonicalPath, bypassCache }))); // TUL-444: independent reads start together
    const pPlan = early(timed("maxSite.plan", () => loadTalentPlanKey(talentProfileId, { bypassCache })));
    const pPages = early(timed("maxSite.pages", () => loadMaxSitePages(talentProfileId, { bypassCache })));
    const pDesign = early(timed("maxSite.designSlug", () => loadMaxSiteDesignSlug(talentProfileId, { bypassCache })));
    const pTenant = early(timed("maxSite.tenant", () => loadTalentManagingTenantId(talentProfileId, { bypassCache })));
    const pIdentity = early(timed("maxSite.identity", () => loadTalentSiteIdentity(talentProfileId, { bypassCache })));
    const pDemo = early(timed("maxSite.isDemo", () => loadMaxSiteIsDemo(talentProfileId)));
    // Public published tokens can start with the other profile reads; draft preview loads later.
    const pTokens = early(
      timed("maxSite.themeTokens", () =>
        loadMaxSiteThemeTokens(talentProfileId, { draft: false, bypassCache }),
      ),
    );
    const pCta = early(timed("maxSite.ctaMode", () => pPlan.then((plan) => loadTalentSiteCtaMode(talentProfileId, plan))));
    const localeCtx = await pLocale;
    const locale = localeCtx.locale;
    const pSeoFacts = early(timed("maxSite.seoFacts", () => loadMaxSiteSeoFacts(talentProfileId, locale, { bypassCache })));
    // ── Owner gate for draft preview (owner-only, like the profile preview) ──
    let isOwnerDraftPreview = false;
    if (previewDraft) {
      const [session, ownerUserId] = await Promise.all([
        timed("maxSite.session", () => getCachedActorSession()),
        timed("maxSite.ownerUserId", () => loadTalentOwnerUserId(talentProfileId)),
      ]);
      isOwnerDraftPreview = Boolean(
        session.user && ownerUserId && session.user.id === ownerUserId,
      );
      // A non-owner who appends ?preview=draft falls through to the PUBLIC gate (published site, or 404), never the draft.
    }

    // ── Plan + publish gate ─────────────────────────────────────────────────
    // The public path requires `personalSitePublish` + a published site. The
    // owner draft preview bypasses the gate so the owner can preview an
    // unpublished draft — but the plan is still READ there, because read-time
    // SEO scoping below needs it on both paths.
    const planKey = await pPlan;
    const ctaMode = await pCta; // seeded CTA copy follows booking mode
    const gateOpen = maxSitePublicGate({
      sitePublishedAt: site.sitePublishedAt,
      planKey,
      isOwnerDraftPreview,
    });
    if (!gateOpen) return NOT_FOUND;
    perfMark("maxSite.afterGate", t0);

    // Theme releases Phase 2 — the owner's read-only preview of a saved version.
    const snap = isOwnerDraftPreview && input.previewHistoryEntryId
      ? await timed("maxSite.historySnap", () => loadHistoryPreviewSnapshot(talentProfileId, input.previewHistoryEntryId!))
      : isOwnerDraftPreview && input.previewThemeUpdateId
        ? await timed("maxSite.themeUpdateSnap", () => loadThemeUpdatePreviewSnapshot(talentProfileId, input.previewThemeUpdateId!))
        : null;

    // ── Pick the shell + page set for this view ─────────────────────────────
    const shellSource = snap?.shell ?? (isOwnerDraftPreview ? site.shellTree : site.shellPublished);
    const shellTree = coerceTree(shellSource);

    const allPages = await pPages;
    // PHASE 1 — read-time page scoping. Extra pages are Web Office: a talent
    // without `personalSitePages` serves HOME ONLY on the public path, while
    // every row stays in the database. The owner's draft preview is never
    // scoped — they always see their whole site.
    const pages = isOwnerDraftPreview
      ? allPages
      : scopeMaxSitePagesToPlan(allPages, planKey);
    // Owner draft preview renders draft pages too; the public path requires
    // published (the pure core re-applies this — defense in depth over RLS).
    const requirePublished = !isOwnerDraftPreview;
    // `/politicas` and `/privacidad` are platform pages: the site's shell and theme (from home), only the body swaps.
    const policyDoc = policyDocForSlug(input.pageSlug);
    const page = selectMaxSitePage(pages, {
      pageSlug: policyDoc ? null : input.pageSlug,
      requirePublished,
    });
    if (!page) return NOT_FOUND;

    // Guest body + early design slug (live media / Maison trade-app fixups).
    const designSlugEarly = await pDesign;
    const snapBlocks = snap?.pages?.[page.id];
    const body = coerceTree(snapBlocks ?? publicPageBody(page, { draftPreview: isOwnerDraftPreview }));
    const fixed = await timed("maxSite.prepareTrees", () =>
      prepareTalentSiteTrees({
        talentProfileId,
        locale,
        chain: localeCtx.chain,
        logoUrl: site.logoUrl,
        shellTree,
        body,
        ctaMode,
        designSlug: designSlugEarly,
        siteSlug: site.siteSlug,
      }),
    );
    const blocks = pruneUnconfirmedGuestStubs(fixed.body);
    if (!policyDoc && !hasRenderableBuilderNodes(blocks, { mode: "freeform" })) {
      // A published-but-empty page → 404 rather than a blank document.
      return NOT_FOUND;
    }

    // ── Build nav from the published pages (owner preview also shows drafts) ──
    const navSource: readonly MaxSitePageRow[] = requirePublished
      ? pages
      : pages.map((p) => ({ ...p, status: "published" }));
    const nav = buildMaxSiteNav(navSource);
    const publicPathPrefix = input.publicPathPrefix ?? "";
    const hydratedShell = hydrateShellNav(
      fixed.shellTree,
      nav,
      site.siteSlug,
      publicPathPrefix,
      input.hrefMode ?? "path",
    );

    // TUL-444 Step 2: settle tenant / identity / demo / published tokens together
    // (they were sequential awaits after the early() fan-out).
    const [tenantId, identity, isDemo, publishedTokens] = await Promise.all([
      pTenant,
      pIdentity,
      pDemo,
      pTokens,
    ]);
    const siteTokens =
      snap?.tokens ??
      (isOwnerDraftPreview
        ? await timed("maxSite.themeTokens", () =>
            loadMaxSiteThemeTokens(talentProfileId, { draft: true }),
          )
        : publishedTokens);
    const designSlug = designSlugEarly;
    const policyModel = policyDoc
      ? await timed("maxSite.policyModel", () => loadTalentPolicyModel(talentProfileId, policyDoc, locale))
      : null;
    const node = await timed("maxSite.document", () =>
      renderMaxSiteDocument({
        mainOverride: policyModel ? policyMainNode(policyModel) : undefined,
        siteTokens,
        designSlug,
        shellTree: hydratedShell,
        logoUrl: site.logoUrl,
        page,
        blocks,
        tenantId,
        talentProfileId,
        locale,
        localeCtx,
        publicPathPrefix,
        draftPreview: isOwnerDraftPreview,
        // PHASE 1 — a free site carries the "Made with Tulala" mark; a paid plan removes it (same predicate as /t/[code]).
        showPlatformBadge: talentSiteShowsPlatformBadge(planKey),
        isDemo,
        talentName: identity?.name ?? null,
        webOffice: webOfficeCtxFor(webOfficeSocialEnabled(planKey), {
          canonicalOrigin: input.canonicalOrigin ?? process.env.NEXT_PUBLIC_SITE_URL,
          canonicalPath: input.canonicalPath,
          siteSlug: site.siteSlug,
        }),
      }),
    );

    const seoFacts = await pSeoFacts; // services, links, city; never throws

    const seo = buildMaxSiteSeo({
      ...seoFacts,
      site,
      // PHASE 1 — SEO is Web Office. A talent without `personalSiteSeo` renders
      // with their stored SEO IGNORED (never deleted), so a lapsed Web Office
      // talent's overrides simply stop applying and come back on restore.
      page: scrubTalentSiteSeo(
        page,
        talentPlanGrantsSiteCapability(planKey, "personalSiteSeo"),
      ),
      identity,
      locale,
      noindex: isOwnerDraftPreview,
      canonicalOrigin: input.canonicalOrigin,
      canonicalPath: input.canonicalPath,
      ignoreExplicitCanonical: Boolean(policyDoc),
      locales: { primary: localeCtx.settings.defaultLocale, urlDefault: localeCtx.grammar.defaultLocale, supported: localeCtx.settings.supportedLocales },
    });

    perfMark("maxSite.total", t0);
    return { kind: "render", node, seo: policyModel ? policySeo(seo, policyModel) : seo, locale };
  } catch {
    // Degrade safe — any unexpected failure becomes a 404, never a throw.
    return NOT_FOUND;
  }
}

export type { PublishedTalentPageRenderData } from "@/lib/talent-site/published-talent-page-core";
