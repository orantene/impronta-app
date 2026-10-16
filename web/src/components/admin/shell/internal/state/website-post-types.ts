/**
 * One `cms_posts` row as the Website surfaces see it (W3). Every field is
 * real — the fixture-era `author` / `tags` / `hits7d` are gone: author was a
 * literal placeholder, tags have no column, and no per-post analytics exist.
 */
export type WebsitePost = {
  id: string;
  title: string;
  /** Leading-slash path form of the slug (e.g. "/spring-2026"). */
  slug: string;
  status: "published" | "draft" | "archived";
  /** cms_posts.locale — en|es. */
  locale: string;
  /** True when the post has a non-empty excerpt (summary). */
  hasExcerpt: boolean;
  publishedAt?: string;
  updatedAt: string;
  /**
   * `cms_posts.updated_by` resolved to a display name via the workspace
   * teamMembers map; "" when unresolvable (member left, or no editor
   * recorded) so surfaces render nothing instead of a raw UUID.
   */
  lastEditedBy: string;
  /** Hidden by the platform admin (takedown); the reason is shown to the owner. */
  takenDown?: boolean;
  takenDownReason?: string;
};
