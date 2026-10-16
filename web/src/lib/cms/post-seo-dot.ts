/**
 * post-seo-dot.ts — the SEO dot on the Posts list and in the settings sheet
 * (Posts v1, TUL-1006).
 *
 * Pure and client/server safe. Six checks from the design (section 4):
 * title length, description, cover, 300 or more words, a link to a service,
 * alt texts. It returns ids and booleans only; the UI maps each id to plain
 * ES/EN copy through the i18n catalog. No AI fix in v1.
 */
import { postWordCount, type PostBlock } from "@/lib/cms/post-blocks";

export type PostSeoCheckId = "title" | "description" | "cover" | "words" | "service" | "alts";

export type PostSeoCheck = { id: PostSeoCheckId; ok: boolean };

/** green = nothing to fix, yellow = one or two things, red = three or more. */
export type PostSeoLevel = "green" | "yellow" | "red";

export type PostSeoInput = {
  title: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  coverImageUrl?: string | null;
  coverImageAlt?: string | null;
  relatedOfferingId?: string | null;
  blocks: readonly PostBlock[];
};

export type PostSeoResult = {
  level: PostSeoLevel;
  checks: PostSeoCheck[];
  /** Ids of the checks that failed, in check order. */
  failing: PostSeoCheckId[];
};

export const SEO_TITLE_MIN = 30;
export const SEO_TITLE_MAX = 60;
export const SEO_DESCRIPTION_MAX = 160;
export const SEO_MIN_WORDS = 300;

function trimmed(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function hasServiceLink(input: PostSeoInput): boolean {
  if (trimmed(input.relatedOfferingId)) return true;
  return input.blocks.some(
    (b) => b.type === "service" || (b.type === "book_button" && Boolean(b.offering_id)),
  );
}

/** Every image (blocks, gallery, cover) that exists must carry an alt text. */
function altsComplete(input: PostSeoInput): boolean {
  if (trimmed(input.coverImageUrl) && !trimmed(input.coverImageAlt)) return false;
  for (const b of input.blocks) {
    if (b.type === "image" && !trimmed(b.alt)) return false;
    if (b.type === "gallery" && b.images.some((img) => !trimmed(img.alt))) return false;
  }
  return true;
}

export function evaluatePostSeo(input: PostSeoInput): PostSeoResult {
  // The SEO title falls back to the post title, like the public page does.
  const seoTitle = trimmed(input.metaTitle) || trimmed(input.title);
  const description = trimmed(input.metaDescription);
  const checks: PostSeoCheck[] = [
    { id: "title", ok: seoTitle.length >= SEO_TITLE_MIN && seoTitle.length <= SEO_TITLE_MAX },
    { id: "description", ok: description.length > 0 && description.length <= SEO_DESCRIPTION_MAX },
    { id: "cover", ok: trimmed(input.coverImageUrl).length > 0 },
    { id: "words", ok: postWordCount(input.blocks) >= SEO_MIN_WORDS },
    { id: "service", ok: hasServiceLink(input) },
    { id: "alts", ok: altsComplete(input) },
  ];
  const failing = checks.filter((c) => !c.ok).map((c) => c.id);
  const level: PostSeoLevel = failing.length === 0 ? "green" : failing.length <= 2 ? "yellow" : "red";
  return { level, checks, failing };
}
