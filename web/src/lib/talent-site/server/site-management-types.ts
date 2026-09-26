/**
 * Talent Max Site — management action TYPES (no runtime, no "use server").
 *
 * Split out of `site-management-actions.ts` because that file is a "use server"
 * module — every export there must be an async server action, so it can't also
 * export these types. Both the actions file and the client components import
 * the shapes from here.
 */

import type { TalentSiteCapabilities } from "@/lib/access/talent-membership";

export type MaxSiteManagerPage = {
  id: string;
  slug: string;
  title: string;
  navLabel: string | null;
  status: "draft" | "scheduled" | "published" | string;
  isHome: boolean;
  sortOrder: number;
  publishedAt: string | null;
  updatedAt: string;
};

export type MaxSiteManagerState = {
  /**
   * Phase 1 — true when the talent may edit their own site at all
   * (`personalSiteEdit`). Every tier qualifies once
   * `TALENT_FREE_WEBSITE_ENABLED` is on; while it is off this is Max-only,
   * exactly as it was when the field meant "has Max".
   */
  canManage: boolean;
  /** Per-capability record; the UI reads this instead of re-deriving gates. */
  capabilities: TalentSiteCapabilities;
  tier: "free" | "pro" | "max";
  talentProfileId: string;
  displayName: string;
  siteSlug: string | null;
  logoUrl: string | null;
  sitePublishedAt: string | null;
  /** Whether the published shell has ever been baked. */
  hasPublishedShell: boolean;
  /** The talent's site URL (`/t/site/<slug>`), null until a slug exists. */
  publicSiteUrl: string | null;
  pages: MaxSiteManagerPage[];
};

export type MaxSiteActionResult<T = void> =
  | { ok: true; data?: T }
  | {
      ok: false;
      code:
        | "not_authenticated"
        | "workspace_not_found"
        | "talent_profile_not_found"
        | "plan_required"
        | "not_owner"
        | "site_not_found"
        | "page_not_found"
        | "invalid_input"
        | "slug_taken"
        | "cannot_delete_home"
        | "server_error";
      error: string;
    };

/**
 * Phase 3 — the read-only answer to "should Today invite this talent to set up
 * their free website?". Produced by `site-activation-state.ts`, which is a
 * "use server" module and so cannot export this shape itself.
 */
export type TalentSiteActivationState = {
  /** The plan grants "edit my own site". False → render nothing on Today. */
  canManage: boolean;
  /** A site row with a real slug exists (i.e. it has been provisioned). */
  hasSite: boolean;
  /** The site has been published at least once. */
  isPublished: boolean;
  /** Provisioned slug when hasSite; null otherwise (Today suggests from name). */
  siteSlug: string | null;
};
