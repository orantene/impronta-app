"use server";

/**
 * Phase 13 — brand kit URL extract.
 *
 * Operator pastes a website URL → we fetch it, parse out plausible
 * brand colors + fonts, and return a token-key-shaped object the
 * Theme Drawer's Code-tab BrandKitImport can apply directly.
 *
 * Heuristics (no external API, no auth):
 *   - colors: scan inline <style> + <meta name="theme-color"> for
 *     hex values and rank by frequency. Top 4 → primary / secondary
 *     / accent / neutral.
 *   - fonts: scan <link rel="stylesheet" href="…fonts.googleapis…">
 *     for `family=` query string; first match → heading + body.
 *
 * Won't catch every site (CSS-in-JS, tokenized hex via vars, etc.) —
 * but works on enough sites to be a real shortcut.
 */

import { requireStaff } from "@/lib/server/action-guards";

export type BrandKitExtractResult =
  | { ok: true; tokens: Record<string, string> }
  | { ok: false; error: string };

const TIMEOUT_MS = 8000;
const MAX_BYTES = 1024 * 512; // 512 KB cap on the parsed HTML

const HEX_RE = /#[0-9a-fA-F]{3,6}\b/g;
const FONT_QUERY_RE = /family=([^&"'\s]+)/g;

export async function extractBrandKitFromUrl(input: {
  url: string;
}): Promise<BrandKitExtractResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };

  let target: URL;
  try {
    target = new URL(input.url);
    if (!/^https?:$/.test(target.protocol)) throw new Error("");
  } catch {
    return { ok: false, error: "Invalid URL — must be http:// or https://." };
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let html: string;
  try {
    const res = await fetch(target.toString(), {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Tulala-BrandExtractor/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return { ok: false, error: `Site returned ${res.status}.` };
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return { ok: false, error: "URL didn't return HTML." };
    }
    const buf = await res.arrayBuffer();
    const sliced = buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf;
    html = new TextDecoder("utf-8", { fatal: false }).decode(sliced);
  } catch (err) {
    return {
      ok: false,
      error:
        (err as Error).name === "AbortError"
          ? "Timed out fetching the site."
          : "Couldn't fetch that URL.",
    };
  } finally {
    clearTimeout(t);
  }

  // ---- color extraction ------------------------------------------------
  // Histogram of hex matches, normalized to lowercase #rrggbb.
  const colorCounts = new Map<string, number>();
  const hexMatches = html.match(HEX_RE) ?? [];
  for (const raw of hexMatches) {
    const norm = normalizeHex(raw);
    if (!norm) continue;
    // Drop near-white and near-black — usually background / text, not brand.
    if (isNearWhite(norm) || isNearBlack(norm)) continue;
    colorCounts.set(norm, (colorCounts.get(norm) ?? 0) + 1);
  }
  // theme-color meta tag — operator's explicit brand color, weighted heavily.
  const themeColorMatch = html.match(
    /<meta[^>]*name=["']theme-color["'][^>]*content=["']([^"']+)["']/i,
  );
  if (themeColorMatch) {
    const norm = normalizeHex(themeColorMatch[1]);
    if (norm) colorCounts.set(norm, (colorCounts.get(norm) ?? 0) + 100);
  }
  const ranked = [...colorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c)
    .slice(0, 4);

  // ---- font extraction -------------------------------------------------
  const fontFamilies: string[] = [];
  const fontLinks = html.match(/<link[^>]*href=["'][^"']*fonts\.googleapis\.com[^"']*["'][^>]*>/gi) ?? [];
  for (const link of fontLinks) {
    const queries = link.match(FONT_QUERY_RE) ?? [];
    for (const q of queries) {
      const family = q
        .replace(/^family=/, "")
        .split(":")[0]
        .replace(/\+/g, " ");
      if (family && !fontFamilies.includes(family)) fontFamilies.push(family);
    }
  }

  // ---- assemble tokens -------------------------------------------------
  const tokens: Record<string, string> = {};
  if (ranked[0]) tokens["color.primary"] = ranked[0];
  if (ranked[1]) tokens["color.secondary"] = ranked[1];
  if (ranked[2]) tokens["color.accent"] = ranked[2];
  if (ranked[3]) tokens["color.neutral"] = ranked[3];
  if (fontFamilies[0]) {
    tokens["typography.heading-font-family"] = `"${fontFamilies[0]}", Georgia, serif`;
  }
  if (fontFamilies[1]) {
    tokens["typography.body-font-family"] = `"${fontFamilies[1]}", system-ui, sans-serif`;
  } else if (fontFamilies[0]) {
    tokens["typography.body-font-family"] = `"${fontFamilies[0]}", system-ui, sans-serif`;
  }

  if (Object.keys(tokens).length === 0) {
    return {
      ok: false,
      error: "Couldn't find any brand colors or fonts on that page.",
    };
  }

  return { ok: true, tokens };
}

function normalizeHex(value: string): string | null {
  const trimmed = value.trim().replace(/^#/, "");
  if (!/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) return null;
  const hex = trimmed.toLowerCase();
  if (hex.length === 3) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  }
  return `#${hex}`;
}

function isNearWhite(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return r > 240 && g > 240 && b > 240;
}

function isNearBlack(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return r < 20 && g < 20 && b < 20;
}
