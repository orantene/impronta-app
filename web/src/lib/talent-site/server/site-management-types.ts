/**
 * Talent Max Site — management action TYPES (no runtime, no "use server").
 *
 * Split out of `site-management-actions.ts` because that file is a "use server"
 * module — every export there must be an async server action, so it can't also
 * export these types. Both the actions file and the client components import
 * the shapes from here.
 */

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
  /** True when the talent has Max (the only tier with the builder). */
  canManage: boolean;
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
