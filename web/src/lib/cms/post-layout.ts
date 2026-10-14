/**
 * post-layout.ts — "Diseño de posts" model (Posts v1, TUL-1008). PURE, client-safe.
 *
 * One layout per site and language decides how EVERY post page is composed:
 * an ordered list of sections, each from a closed set:
 *
 *   post_content  the current post (title, cover, blocks, date, reading time)
 *   post_author   the author card (name, avatar, short bio)
 *   blog_index    "Más posts": a live list of the latest posts
 *
 * Storage (both families, same envelope):
 *   workspace sites → `cms_pages.blocks` of the system row
 *                     (`is_system_owned`, `system_template_key = 'post_layout'`,
 *                     slug `__post_layout__`), one per tenant + locale
 *   talent sites    → `talent_sites.post_layout` (talent sites have no cms_pages)
 *
 * A missing or unreadable layout is `null`, and the public page then renders
 * the article directly (the pre-layout behaviour).
 */
import { z } from "zod";

export const POST_LAYOUT_SYSTEM_KEY = "post_layout";
/** Reserved slug of the workspace system row (never routable: starts with `__`). */
export const POST_LAYOUT_SLUG = "__post_layout__";
export const POST_LAYOUT_VERSION = 1;
export const POST_LAYOUT_MAX_SECTIONS = 8;
export const MORE_POSTS_LIMIT_MAX = 12;

export const POST_LAYOUT_SECTION_TYPES = ["post_content", "post_author", "blog_index"] as const;
export type PostLayoutSectionType = (typeof POST_LAYOUT_SECTION_TYPES)[number];

const idSchema = z.string().min(1).max(40);

const sectionSchema = z.discriminatedUnion("type", [
  z.object({ id: idSchema, type: z.literal("post_content") }),
  z.object({ id: idSchema, type: z.literal("post_author") }),
  z.object({
    id: idSchema,
    type: z.literal("blog_index"),
    limit: z.number().int().min(1).max(MORE_POSTS_LIMIT_MAX).default(3),
    heading: z.string().max(80).optional(),
  }),
]);

export type PostLayoutSection = z.infer<typeof sectionSchema>;

const envelopeSchema = z.object({
  kind: z.literal("post_layout"),
  v: z.literal(POST_LAYOUT_VERSION),
  sections: z.array(sectionSchema).max(POST_LAYOUT_MAX_SECTIONS),
});

export type PostLayoutEnvelope = z.infer<typeof envelopeSchema>;

const MORE_POSTS_HEADING = { es: "Más posts", en: "More posts" } as const;

/** The theme default: content, author, then a short "more posts" list. */
export function defaultPostLayout(locale: string): PostLayoutSection[] {
  return [
    { id: "content", type: "post_content" },
    { id: "author", type: "post_author" },
    { id: "more", type: "blog_index", limit: 3, heading: MORE_POSTS_HEADING[locale === "es" ? "es" : "en"] },
  ];
}

export function toPostLayoutEnvelope(sections: readonly PostLayoutSection[]): PostLayoutEnvelope {
  return { kind: "post_layout", v: POST_LAYOUT_VERSION, sections: [...sections] };
}

/**
 * Read a stored envelope. Returns `null` for anything unusable: not an
 * envelope, invalid sections, or no `post_content` (a layout without the post
 * would render a page with no article, so the caller falls back instead).
 */
export function parsePostLayout(raw: unknown): PostLayoutSection[] | null {
  const parsed = envelopeSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { sections } = parsed.data;
  if (!sections.some((s) => s.type === "post_content")) return null;
  const ids = new Set(sections.map((s) => s.id));
  if (ids.size !== sections.length) return null;
  return sections;
}

// ---- editing ops (pure; the panel and the save actions both go through these) ----

export function movePostLayoutSection(
  sections: readonly PostLayoutSection[],
  id: string,
  dir: -1 | 1,
): PostLayoutSection[] {
  const i = sections.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sections.length) return [...sections];
  const next = [...sections];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

/** The post content section is the page itself: it cannot be removed. */
export function removePostLayoutSection(sections: readonly PostLayoutSection[], id: string): PostLayoutSection[] {
  return sections.filter((s) => s.id !== id || s.type === "post_content");
}

export function addPostLayoutSection(
  sections: readonly PostLayoutSection[],
  type: Exclude<PostLayoutSectionType, "post_content">,
  locale: string,
): PostLayoutSection[] {
  if (sections.length >= POST_LAYOUT_MAX_SECTIONS) return [...sections];
  if (type === "post_author" && sections.some((s) => s.type === "post_author")) return [...sections];
  let n = sections.length + 1;
  while (sections.some((s) => s.id === `${type}-${n}`)) n += 1;
  const id = `${type}-${n}`;
  const section: PostLayoutSection =
    type === "blog_index"
      ? { id, type, limit: 3, heading: MORE_POSTS_HEADING[locale === "es" ? "es" : "en"] }
      : { id, type };
  return [...sections, section];
}

export function setMorePostsLimit(
  sections: readonly PostLayoutSection[],
  id: string,
  limit: number,
): PostLayoutSection[] {
  const clamped = Math.min(MORE_POSTS_LIMIT_MAX, Math.max(1, Math.round(limit)));
  return sections.map((s) => (s.id === id && s.type === "blog_index" ? { ...s, limit: clamped } : s));
}
