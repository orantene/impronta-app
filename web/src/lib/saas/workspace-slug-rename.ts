/**
 * Existing workspaces whose slug is URL soup ("https-www-airstriplasvegas-com",
 * "https-www-instagram-com-thebarbe") from a pasted link in the name field.
 * Pure planner for scripts/rename-url-slugs.mts: decide a clean slug per tenant,
 * never reuse a taken one, flag the ones that cannot be decided safely.
 */
import { WORKSPACE_SLUG_MAX_LENGTH, isReservedWorkspaceSlug, normalizeWorkspaceSlugCandidate } from "@/lib/saas/workspace-signup";

export type RenameAgency = { id: string; slug: string | null; status: string | null };
export type RenamePlanItem = { tenantId: string; from: string; to: string; truncatedHandle: boolean };
export type RenameSkip = { tenantId: string; slug: string; reason: string };

const TLDS = "com|net|org|co|io|app|mx|es|us|uk|info|biz|me|shop|store|studio|online|site|xyz|dev";
const SOCIALS = "instagram|facebook|tiktok|twitter|x|linkedin|youtube|linktr|snapchat|pinterest|threads";
const SOUP_RE = /^(?:https?-)(?:www-)?(.+)$/;
const SOCIAL_RE = new RegExp(`^(${SOCIALS})-(?:com|ee|me)-(.+)$`);
const DOMAIN_RE = new RegExp(`^(.+?)-(?:${TLDS})(?:-.*)?$`);

/** True for a slug that is clearly a pasted link: starts with the scheme. */
export function isUrlSoupSlug(slug: string | null | undefined): boolean {
  return !!slug && /^https?-/.test(slug);
}

/** The clean base for a soup slug, or null when it cannot be derived. */
export function cleanBaseFromSoup(slug: string): { base: string; truncatedHandle: boolean } | null {
  const m = SOUP_RE.exec(slug);
  if (!m) return null;
  const rest = m[1];
  const social = SOCIAL_RE.exec(rest);
  if (social) {
    const handle = normalizeWorkspaceSlugCandidate(social[2]);
    if (!handle) return null;
    // The old slug was cut at the max length: the handle may be incomplete.
    return { base: handle, truncatedHandle: slug.length >= WORKSPACE_SLUG_MAX_LENGTH - 1 };
  }
  const domain = DOMAIN_RE.exec(rest);
  const base = normalizeWorkspaceSlugCandidate(domain ? domain[1] : rest);
  return base && base !== "www" ? { base, truncatedHandle: false } : null;
}

export function planSlugRenames(
  agencies: readonly RenameAgency[],
  takenSlugs: ReadonlySet<string>,
): { plan: RenamePlanItem[]; skipped: RenameSkip[] } {
  const taken = new Set([...takenSlugs].map((s) => s.toLowerCase()));
  const plan: RenamePlanItem[] = [];
  const skipped: RenameSkip[] = [];
  for (const a of agencies) {
    if (!a.slug || !isUrlSoupSlug(a.slug)) continue;
    const clean = cleanBaseFromSoup(a.slug);
    if (!clean) {
      skipped.push({ tenantId: a.id, slug: a.slug, reason: "cannot_derive" });
      continue;
    }
    let to = clean.base;
    for (let n = 2; (taken.has(to) || isReservedWorkspaceSlug(to)) && n < 50; n += 1) to = `${clean.base}-${n}`;
    if (taken.has(to) || isReservedWorkspaceSlug(to)) {
      skipped.push({ tenantId: a.id, slug: a.slug, reason: "no_free_slug" });
      continue;
    }
    taken.add(to);
    plan.push({ tenantId: a.id, from: a.slug, to, truncatedHandle: clean.truncatedHandle });
  }
  return { plan, skipped };
}
