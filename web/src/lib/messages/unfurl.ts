"use server";

import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

import type { LinkUnfurl } from "@/lib/messages/unfurl-types";

/**
 * unfurlLink — server-side, SSRF-guarded link preview fetcher.
 *
 * Shared CONTRACT (consumed by the message shells). Returns OpenGraph-ish
 * metadata for an http/https URL, or `{ ok:false, url }` on any failure.
 *
 * Safety posture:
 *   • http/https scheme allowlist only.
 *   • DNS-resolve the host and reject any private / loopback / link-local /
 *     unique-local range, plus the cloud metadata address (169.254.169.254).
 *   • 3s timeout, body read capped at ~512KB.
 *   • Only a small set of <title> / og:* tags are parsed; no HTML is executed.
 */

const TIMEOUT_MS = 3000;
const MAX_BYTES = 512 * 1024;

export async function unfurlLink(url: string): Promise<LinkUnfurl> {
  const fail: LinkUnfurl = { ok: false, url };
  try {
    if (typeof url !== "string" || url.length === 0 || url.length > 2048) {
      return fail;
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return fail;
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return fail;
    }

    const host = parsed.hostname;
    if (!host || isBlockedHostname(host)) {
      return fail;
    }

    // Resolve to IPs and reject any private/reserved address — closes the
    // DNS-rebinding / internal-name SSRF hole.
    const safe = await isHostPubliclyRoutable(host);
    if (!safe) return fail;

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

    const html = await readCapped(res, MAX_BYTES);
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
// SSRF guards
// ---------------------------------------------------------------------------

function isBlockedHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "metadata" || h.endsWith(".internal") || h.endsWith(".local")) return true;
  // Bare IP literals are validated by the range check below; block obvious ones early.
  if (isIP(h) && isPrivateIp(h)) return true;
  return false;
}

async function isHostPubliclyRoutable(host: string): Promise<boolean> {
  // If the host is already an IP literal, just range-check it.
  if (isIP(host)) return !isPrivateIp(host);
  try {
    const records = await dnsLookup(host, { all: true });
    if (!records || records.length === 0) return false;
    for (const r of records) {
      if (isPrivateIp(r.address)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isPrivateIpv4(ip);
  if (v === 6) return isPrivateIpv6(ip);
  return true; // unknown shape → treat as unsafe
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const h = ip.toLowerCase();
  if (h === "::" || h === "::1") return true; // unspecified + loopback
  if (h.startsWith("fe80")) return true; // link-local
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique-local fc00::/7
  // IPv4-mapped (::ffff:a.b.c.d) — range-check the embedded v4.
  const mapped = /::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(h);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
}

// ---------------------------------------------------------------------------
// Body read (capped) + tiny meta parser
// ---------------------------------------------------------------------------

async function readCapped(res: Response, maxBytes: number): Promise<string | null> {
  const body = res.body;
  if (!body) {
    // No stream — fall back to text() but still bound it.
    const txt = await res.text();
    return txt.slice(0, maxBytes * 2);
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
        if (total >= maxBytes) break;
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
  }
  if (total === 0) return null;
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

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
