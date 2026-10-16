/**
 * post-blocks.ts — the `cms_posts.body_blocks` shape (Posts v1, TUL-1005).
 *
 * Pure and client/server safe. A post body is an array of
 * `{ id, type, ...props }`, one zod schema per type. Rules that matter:
 *   - `service` stores ONLY `offering_id`. The price is resolved at render
 *     time from the shared price source; it is never saved in the post.
 *   - `video` accepts YouTube and Vimeo only.
 *   - No per-block colours or fonts: blocks carry content, the theme styles.
 *   - Parsing never throws: invalid blocks are dropped one by one so a single
 *     bad block cannot blank a published post.
 */
import { z } from "zod";

const id = z.string().min(1).max(64);
const text = z.string().max(20_000);
const shortText = z.string().max(500);

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);

export type PostVideoProvider = "youtube" | "vimeo";

/** Returns the provider for a YouTube/Vimeo https URL, else null. */
export function postVideoProvider(url: string): PostVideoProvider | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase();
  if (YOUTUBE_HOSTS.has(host)) return "youtube";
  if (VIMEO_HOSTS.has(host)) return "vimeo";
  return null;
}

/**
 * Privacy-friendly embed URL (youtube-nocookie, vimeo dnt=1), or null when the
 * URL is not a recognisable video link.
 */
export function postVideoEmbedUrl(url: string): string | null {
  const provider = postVideoProvider(url);
  if (!provider) return null;
  const parsed = new URL(url);
  if (provider === "youtube") {
    let videoId: string | null = null;
    if (parsed.hostname === "youtu.be") {
      videoId = parsed.pathname.split("/")[1] ?? null;
    } else if (parsed.pathname === "/watch") {
      videoId = parsed.searchParams.get("v");
    } else {
      const m = parsed.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/);
      videoId = m ? m[1] : null;
    }
    if (!videoId || !/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) return null;
    return `https://www.youtube-nocookie.com/embed/${videoId}`;
  }
  const m = parsed.pathname.match(/\/(\d{4,})(?:\/|$)/);
  if (!m) return null;
  return `https://player.vimeo.com/video/${m[1]}?dnt=1`;
}

const videoUrl = z
  .string()
  .max(500)
  .refine((v) => postVideoEmbedUrl(v) !== null, "YouTube or Vimeo only");

const httpsUrl = z
  .string()
  .max(2000)
  .refine((v) => /^https:\/\//i.test(v) || v.startsWith("/"), "https or site-relative URL");

export const paragraphBlockSchema = z.object({
  id,
  type: z.literal("paragraph"),
  text,
});
export const headingBlockSchema = z.object({
  id,
  type: z.literal("heading"),
  text: shortText,
  level: z.union([z.literal(2), z.literal(3)]),
});
export const listBlockSchema = z.object({
  id,
  type: z.literal("list"),
  ordered: z.boolean(),
  items: z.array(shortText).max(100),
});
export const imageBlockSchema = z.object({
  id,
  type: z.literal("image"),
  url: httpsUrl,
  alt: shortText,
  caption: shortText.optional(),
});
export const galleryBlockSchema = z.object({
  id,
  type: z.literal("gallery"),
  images: z.array(z.object({ url: httpsUrl, alt: shortText })).min(1).max(24),
});
export const quoteBlockSchema = z.object({
  id,
  type: z.literal("quote"),
  text: shortText,
  cite: shortText.optional(),
});
export const videoBlockSchema = z.object({
  id,
  type: z.literal("video"),
  url: videoUrl,
});
export const dividerBlockSchema = z.object({
  id,
  type: z.literal("divider"),
});
/** `.strip()` (zod default) drops any `price`-like prop a client sends. */
export const serviceBlockSchema = z.object({
  id,
  type: z.literal("service"),
  offering_id: z.string().uuid(),
});
export const bookButtonBlockSchema = z.object({
  id,
  type: z.literal("book_button"),
  label: z.string().max(80).optional(),
  offering_id: z.string().uuid().optional(),
});
export const faqBlockSchema = z.object({
  id,
  type: z.literal("faq"),
  question: shortText,
  answer: text,
});

export const postBlockSchema = z.discriminatedUnion("type", [
  paragraphBlockSchema,
  headingBlockSchema,
  listBlockSchema,
  imageBlockSchema,
  galleryBlockSchema,
  quoteBlockSchema,
  videoBlockSchema,
  dividerBlockSchema,
  serviceBlockSchema,
  bookButtonBlockSchema,
  faqBlockSchema,
]);

export type PostBlock = z.infer<typeof postBlockSchema>;
export type PostBlockType = PostBlock["type"];
export type PostBlockOf<T extends PostBlockType> = Extract<PostBlock, { type: T }>;

/** Drops invalid blocks and returns the valid ones in order. Never throws. */
export function parsePostBlocks(raw: unknown): PostBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: PostBlock[] = [];
  for (const item of raw) {
    const res = postBlockSchema.safeParse(item);
    if (res.success) out.push(res.data);
  }
  return out;
}

function countWords(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/u).length : 0;
}

/** Words in the readable text of the post (paragraph, heading, list, quote, faq). */
export function postWordCount(blocks: readonly PostBlock[]): number {
  let n = 0;
  for (const b of blocks) {
    switch (b.type) {
      case "paragraph":
      case "heading":
      case "quote":
        n += countWords(b.text);
        break;
      case "list":
        for (const item of b.items) n += countWords(item);
        break;
      case "faq":
        n += countWords(b.question) + countWords(b.answer);
        break;
      default:
        break;
    }
  }
  return n;
}

const WORDS_PER_MINUTE = 200;

/** Whole minutes at 200 wpm, minimum 1 for any post with text, 0 when empty. */
export function readingMinutes(blocks: readonly PostBlock[]): number {
  const words = postWordCount(blocks);
  return words === 0 ? 0 : Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}
