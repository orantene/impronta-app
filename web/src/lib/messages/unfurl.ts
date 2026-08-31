"use server";

import { assertPublicHttpUrl, readCappedText } from "@/lib/ssrf-guard";
import type { LinkUnfurl } from "@/lib/messages/unfurl-types";

/**
 * unfurlLink — server-side, SSRF-guarded link preview fetcher.
 *
 * Shared CONTRACT (consumed by the message shells). Returns OpenGraph-ish
 * metadata for an http/https URL, or `{ ok:false, url }` on any failure.
 *
 * Safety posture: scheme allowlist, DNS range checks and the capped body read
 * all live in `@/lib/ssrf-guard`, shared with the Tulala URL importer. Only a
 * small set of <title> / og:* tags are parsed here; no HTML is executed.
 */

const TIMEOUT_MS = 3000;
const MAX_BYTES = 512 * 1024;

export async function unfurlLink(url: string): Promise<LinkUnfurl> {
  const fail: LinkUnfurl = { ok: false, url };
  try {
    const checked = await assertPublicHttpUrl(url);
    if (!checked.ok) return fail;
    const parsed = checked.url;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(parsed.toString(), {
        method: "GET",
        redirect: "manual", // don't auto-follow into an internal host
        signal: controller.signal,
        headers: {
          "user-agent": "TulalaLinkPreview/1.0 (+https://tulala.digital)",
          accept: "text/html,application/xhtml+xml",
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) return fail;

    const contentType = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(contentType)) {
      // Non-HTML (e.g. a raw image / pdf) — nothing to scrape.
      return fail;
    }

    const html = await readCappedText(res, MAX_BYTES);
    if (!html) return fail;

    const meta = parseMeta(html, parsed);
    if (!meta.title && !meta.description && !meta.image && !meta.siteName) {
      return fail;
    }
    return { ok: true, url, ...meta };
  } catch {
    return fail;
  }
}

// ---------------------------------------------------------------------------
// Tiny meta parser
// ---------------------------------------------------------------------------

function parseMeta(html: string, base: URL): Omit<LinkUnfurl, "ok" | "url"> {
  // Only scan the <head> region where meta lives — bounds the work.
  const headEnd = html.search(/<\/head>/i);
  const scope = headEnd > 0 ? html.slice(0, headEnd) : html.slice(0, MAX_BYTES);

  const og = (prop: string) => readMetaContent(scope, "property", prop);
  const name = (prop: string) => readMetaContent(scope, "name", prop);

  const title =
    og("og:title") || readTitleTag(scope) || name("twitter:title") || undefined;
  const description =
    og("og:description") || name("description") || name("twitter:description") || undefined;
  const siteName = og("og:site_name") || undefined;

  let image = og("og:image") || name("twitter:image") || undefined;
  if (image) {
    try {
      image = new URL(image, base).toString();
      if (!/^https?:\/\//i.test(image)) image = undefined;
    } catch {
      image = undefined;
    }
  }

  return {
    title: clip(title),
    description: clip(description, 400),
    image,
    siteName: clip(siteName),
  };
}

function readMetaContent(
  html: string,
  attr: "property" | "name",
  value: string,
): string | undefined {
  // Tolerant of attribute ordering: <meta property="og:title" content="…"> OR
  // <meta content="…" property="og:title">.
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tagRe = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  const attrRe = new RegExp(`${attr}\\s*=\\s*["']${escaped}["']`, "i");
  while ((m = tagRe.exec(html)) !== null) {
    const tag = m[0];
    if (attrRe.test(tag)) {
      const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag);
      if (content && content[1]) return decodeEntities(content[1].trim());
    }
  }
  return undefined;
}

function readTitleTag(html: string): string | undefined {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (m && m[1]) return decodeEntities(m[1].trim());
  return undefined;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => safeFromCharCode(Number.parseInt(code, 10)))
    .replace(/&nbsp;/g, " ");
}

function safeFromCharCode(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

function clip(s: string | undefined, max = 200): string | undefined {
  if (!s) return undefined;
  const t = s.replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
