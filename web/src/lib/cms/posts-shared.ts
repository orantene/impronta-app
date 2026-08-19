/**
 * posts-shared.ts — pure helpers for the Website → Posts manager.
 *
 * Client-safe and server-safe on purpose: the editor UI
 * (`WebsitePostEditor.tsx`) previews the slug as the title is typed, the
 * server actions (`admin-site-posts.ts` → `lib/site-admin/server/posts.ts`)
 * validate the same shape, and the tests exercise both without touching
 * React or Supabase. Keeping the rules here is what stops the client
 * preview and the server validator from drifting apart.
 */

/** `cms_posts.locale` — constrained to en|es by the table's CHECK. */
export const POST_LOCALES = ["en", "es"] as const;
export type PostLocale = (typeof POST_LOCALES)[number];

export function isPostLocale(value: string): value is PostLocale {
  return (POST_LOCALES as readonly string[]).includes(value);
}

/**
 * Mirror of the pages `slugifyTitle` (WebsitePageActions.tsx): lowercase
 * ASCII, digits and single hyphens, accents folded, capped at 240 chars.
 * The server still validates; the client only previews.
 */
export function slugifyPostTitle(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 240);
}

/** Same grammar `quickRenamePageAction` enforces for page slugs. */
export function isValidPostSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 240;
}

/** The post statuses this surface manages (cms_page_status enum values). */
export type WebsitePostStatus = "draft" | "published" | "archived";

export function toWebsitePostStatus(value: string): WebsitePostStatus {
  return value === "published" || value === "archived" ? value : "draft";
}

export type WebsitePostActionId = "publish" | "unpublish" | "delete";

export type PostActionContext = {
  /** Role gate — below `admin` nothing is offered. */
  canEdit: boolean;
  /** The platform hub's public site is managed in code, not this surface. */
  isPlatformHub: boolean;
};

/**
 * Which state-changing actions a post offers, mirroring `derivePageActions`
 * (state/website-pages-list.ts): pure, exhaustive, and the only place the
 * rules live. The UI owns confirmation, not permission.
 *
 * The novice guard: a PUBLISHED post cannot be deleted — it must be
 * unpublished first, so "visible to visitors" and "gone forever" are never
 * one click apart. The server enforces the same rule
 * (`deletePost`, lib/site-admin/server/posts.ts).
 */
export function derivePostActions(
  status: WebsitePostStatus,
  ctx: PostActionContext,
): WebsitePostActionId[] {
  if (!ctx.canEdit || ctx.isPlatformHub) return [];
  if (status === "published") return ["unpublish"];
  // draft + archived behave the same here: not publicly visible, so they can
  // be published or deleted.
  return ["publish", "delete"];
}
