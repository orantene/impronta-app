/**
 * url-import.ts — turning a fetched page into text a model can read.
 *
 * Pure, so it can be tested against saved HTML with no network. The fetch itself
 * is in `url-import.server.ts`.
 *
 * WHY IT STRIPS RATHER THAN PARSES
 * ────────────────────────────────
 * No DOM parser, no cheerio, no new dependency. The output is not structured
 * data — it is PROSE FOR THE EXTRACTOR, which already turns prose into facts and
 * is the only thing in the system that reads it. A real parse would produce a
 * tidier intermediate that then gets flattened into a string anyway.
 *
 * So the job is narrow: remove what is not language (script, style, nav soup,
 * tag syntax), keep the order of what remains, and cap it. Getting the boilerplate
 * out matters more than getting the structure right, because a page that is 90%
 * cookie banner spends the model's whole context on the cookie banner.
 *
 * WHAT IT REFUSES TO DECIDE
 * ─────────────────────────
 * Nothing here produces a fact, a confidence or a status. Imported facts are
 * `source: url_import`, `status: needs_approval`, always, decided by the store's
 * provenance rules rather than here — an import is a stranger's website, not the
 * person telling us about themselves, and the plan is explicit that it is never
 * silently trusted.
 */

/** Cap on the prose handed to the model. Roughly 2,000 tokens of page. */
export const MAX_IMPORT_CHARS = 8000;

export type ImportedPage = {
  url: string;
  /** Canonical host, for the source attribution on every fact it produces. */
  host: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
  /** Social handles found in links. Cheap and unusually reliable. */
  handles: { instagram: string | null; tiktok: string | null; facebook: string | null };
  /** Stripped visible text, capped. */
  text: string;
};

/**
 * Blocks that are never about the business.
 *
 * Removed wholesale before the tag strip, because their CONTENTS are the
 * problem, not their markup: a nav's link text is a menu, and a script's body is
 * JavaScript that reads as English to a tokeniser and as nonsense to a reader.
 */
const DROPPED_ELEMENTS = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "nav",
  "header",
  "footer",
  "form",
  "select",
  "iframe",
];

export function extractPageText(html: string): string {
  let out = html;

  for (const tag of DROPPED_ELEMENTS) {
    out = out.replace(
      new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"),
      " ",
    );
    // Unclosed variants, which are common in hand-written markup.
    out = out.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi"), " ");
  }

  out = out.replace(/<!--[\s\S]*?-->/g, " ");

  // Block-level tags become newlines so sentences do not run together. A
  // headline glued to the paragraph under it reads as one broken sentence and
  // the extractor quotes it that way.
  out = out.replace(/<(?:p|div|br|li|h[1-6]|section|article|tr)\b[^>]*>/gi, "\n");
  out = out.replace(/<[^>]+>/g, " ");

  out = decodeEntities(out);

  return out
    .split("\n")
    .map((line) => line.replace(/[ \t\u00a0]+/g, " ").trim())
    .filter((line) => line.length > 0)
    // One-word lines are almost always leftover UI: "Home", "Menu", "Close".
    // Two words survive, because "Deep Tissue" is a service.
    .filter((line) => line.length > 2 && !/^[^\s]{1,3}$/.test(line))
    .join("\n")
    .slice(0, MAX_IMPORT_CHARS);
}

/**
 * Social handles from the page's own links.
 *
 * Worth doing separately from the model extraction because it is deterministic
 * and near-perfect: a link to instagram.com/glowstudio IS the handle, with no
 * inference and no confidence to discount. The model is left to read prose,
 * which is what it is good at.
 */
export function extractHandles(html: string): ImportedPage["handles"] {
  return {
    instagram: firstHandle(html, /(?:instagram\.com|instagr\.am)\/([A-Za-z0-9_.]{2,30})/gi),
    tiktok: firstHandle(html, /tiktok\.com\/@([A-Za-z0-9_.]{2,30})/gi),
    facebook: firstHandle(html, /facebook\.com\/([A-Za-z0-9_.]{2,50})/gi),
  };
}

/**
 * Paths that look like a handle but are the platform's own furniture.
 *
 * Without this, every page with a share button imports the handle "sharer" or
 * "explore", and the visitor is asked to confirm an Instagram account that does
 * not exist.
 */
const NOT_HANDLES = new Set([
  "p",
  "reel",
  "reels",
  "explore",
  "accounts",
  "about",
  "developer",
  "developers",
  "legal",
  "privacy",
  "terms",
  "help",
  "sharer",
  "share",
  "sharer.php",
  "dialog",
  "plugins",
  "tr",
  "profile.php",
  "pages",
  "groups",
  "events",
  "watch",
  "story.php",
  "embed",
  "login",
  "signup",
  "home",
]);

function firstHandle(html: string, pattern: RegExp): string | null {
  for (const match of html.matchAll(pattern)) {
    const raw = match[1];
    if (!raw) continue;
    const handle = raw.replace(/\.$/, "");
    if (NOT_HANDLES.has(handle.toLowerCase())) continue;
    // A handle that is only digits is a numeric profile id, not a username.
    if (/^\d+$/.test(handle)) continue;
    return handle;
  }
  return null;
}

export function readMeta(
  html: string,
): { title: string | null; description: string | null; siteName: string | null } {
  const headEnd = html.search(/<\/head>/i);
  const scope = headEnd > 0 ? html.slice(0, headEnd) : html.slice(0, 40000);

  const og = (prop: string) => metaContent(scope, "property", prop);
  const named = (prop: string) => metaContent(scope, "name", prop);

  return {
    title: og("og:title") ?? titleTag(scope) ?? named("twitter:title") ?? null,
    description:
      og("og:description") ?? named("description") ?? named("twitter:description") ?? null,
    siteName: og("og:site_name") ?? null,
  };
}

function metaContent(
  html: string,
  attr: "property" | "name",
  value: string,
): string | null {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const attrRe = new RegExp(`${attr}\\s*=\\s*["']${escaped}["']`, "i");
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    if (!attrRe.test(tag)) continue;
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag);
    const text = content?.[1]?.trim();
    if (text) return decodeEntities(text);
  }
  return null;
}

function titleTag(html: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const text = m?.[1]?.trim();
  return text ? decodeEntities(text) : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number.parseInt(code, 10);
      if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return "";
      try {
        return String.fromCodePoint(n);
      } catch {
        return "";
      }
    });
}

/**
 * Is there enough here to be worth asking a model about?
 *
 * A page behind a login, a JavaScript-only single-page app or a parked domain
 * all return HTML with no prose in it. Spending an extraction call on 40
 * characters produces confident nonsense, and the honest answer to the visitor
 * is "I could not read that page" rather than four invented facts.
 */
export const MIN_USEFUL_IMPORT_CHARS = 120;

export function isWorthExtracting(page: ImportedPage): boolean {
  const prose = page.text.length;
  const meta = (page.title?.length ?? 0) + (page.description?.length ?? 0);
  return prose + meta >= MIN_USEFUL_IMPORT_CHARS;
}
