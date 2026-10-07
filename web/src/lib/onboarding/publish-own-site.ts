/**
 * TUL-32 · the last step of talent onboarding: the talent's free site exists,
 * is published, and has an address. No new engine: every step is an existing
 * action, injected so the sequence is unit-testable.
 *
 *   already live        → return the address, write nothing (idempotent)
 *   no design yet       → apply the default design (Maison), the same action
 *                         "Use this design" runs (a flag-off refusal is fine)
 *   publish             → `publishMaxSiteAction` (provisions the site, pages,
 *                         shell, `site_published_at`)
 *   read back           → slug → public URL
 *
 * Best-effort by contract: a failure returns `{ ok: false }` and the arrival
 * falls back to the profile link; onboarding itself never fails on it.
 */

import { talentSitePathUrl, talentSitePublicUrl } from "@/lib/talent-site/site-public-url";

export type OwnSiteRow = {
  site_slug: string | null;
  site_published_at: string | null;
  theme_design_slug: string | null;
} | null;

export type PublishOwnSiteDeps = {
  readSite: () => Promise<{ row: OwnSiteRow; isDemo: boolean; error?: string }>;
  applyDefaultDesign: () => Promise<{ ok: boolean; code?: string; error?: string }>;
  publish: () => Promise<{ ok: boolean; error?: string }>;
  /** Host address (`<slug>.tulala.digital`) when subdomains are on, else the `/t/site/<slug>` path. */
  subdomainsEnabled: boolean;
  /** Origin for the path fallback, e.g. `https://tulala.digital`. */
  pathOrigin: string;
};

export type PublishOwnSiteResult =
  | { ok: true; siteSlug: string; publicUrl: string; alreadyLive: boolean }
  | { ok: false; error: string };

export function ownSiteUrl(
  slug: string | null,
  opts: { isDemo: boolean; subdomainsEnabled: boolean; pathOrigin: string },
): string | null {
  if (!slug) return null;
  if (opts.subdomainsEnabled) {
    const host = talentSitePublicUrl(slug, { isDemo: opts.isDemo });
    if (host) return host;
  }
  const path = talentSitePathUrl(slug);
  return path ? `${opts.pathOrigin.replace(/\/$/, "")}${path}` : null;
}

export async function ensureOwnSitePublished(deps: PublishOwnSiteDeps): Promise<PublishOwnSiteResult> {
  const urlOpts = (isDemo: boolean) => ({ isDemo, subdomainsEnabled: deps.subdomainsEnabled, pathOrigin: deps.pathOrigin });

  const first = await deps.readSite();
  if (first.error) return { ok: false, error: first.error };
  if (first.row?.site_published_at) {
    const url = ownSiteUrl(first.row.site_slug, urlOpts(first.isDemo));
    if (url && first.row.site_slug) return { ok: true, siteSlug: first.row.site_slug, publicUrl: url, alreadyLive: true };
  }

  if (!first.row?.theme_design_slug) {
    const applied = await deps.applyDefaultDesign();
    // feature_disabled = the design flag is off: publish has no design gate then.
    if (!applied.ok && applied.code !== "feature_disabled") return { ok: false, error: applied.error ?? "design_failed" };
  }

  const published = await deps.publish();
  if (!published.ok) return { ok: false, error: published.error ?? "publish_failed" };

  const after = await deps.readSite();
  if (after.error) return { ok: false, error: after.error };
  const slug = after.row?.site_slug ?? null;
  const url = after.row?.site_published_at ? ownSiteUrl(slug, urlOpts(after.isDemo)) : null;
  if (!slug || !url) return { ok: false, error: "site_not_live" };
  return { ok: true, siteSlug: slug, publicUrl: url, alreadyLive: false };
}
