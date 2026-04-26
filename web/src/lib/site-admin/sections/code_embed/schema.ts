import { z } from "zod";
import { sectionPresentationSchema } from "../shared/presentation";

/**
 * Allow-listed iframe hosts. Anything else fails Zod validation; the
 * renderer will refuse to emit an <iframe>. Keeps tenants from pasting
 * untrusted markup or random JS-laden URLs.
 */
const ALLOWED_HOSTS = [
  "youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
  "vimeo.com",
  "player.vimeo.com",
  "calendly.com",
  "open.spotify.com",
  "spotify.com",
  "soundcloud.com",
  "loom.com",
  "google.com",
  "maps.google.com",
  "docs.google.com",
  "typeform.com",
  "airtable.com",
  "figma.com",
  "tally.so",
  "instagram.com",
  "tiktok.com",
];

function isAllowedEmbedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    return ALLOWED_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export const codeEmbedSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  caption: z.string().max(280).optional(),
  /** HTTPS URL on an allow-listed host. */
  url: z
    .string()
    .url()
    .max(2048)
    .refine(isAllowedEmbedUrl, "URL must be HTTPS and on an allow-listed host"),
  ratio: z.enum(["16/9", "4/3", "1/1", "9/16", "3/4"]).default("16/9"),
  title: z.string().min(1).max(140).default("Embedded content"),
  presentation: sectionPresentationSchema,
});

export type CodeEmbedV1 = z.infer<typeof codeEmbedSchemaV1>;
export const codeEmbedSchemasByVersion = { 1: codeEmbedSchemaV1 } as const;
