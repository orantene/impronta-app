/**
 * P4-SEO (T4.3) — pure, side-effect-free SEO authoring helpers shared by the
 * in-canvas Page settings drawer (`edit-chrome/page-settings-drawer.tsx`), the
 * SEO server actions (`cms-seo-actions.ts`), and the storefront render paths
 * (homepage `app/page.tsx`, `app/(public)/p/[[...slug]]/page.tsx`).
 *
 * Kept dependency-light (no "use server", no Supabase) so it imports cleanly
 * into both client and server modules and is unit-testable with `tsx --test`.
 *
 * Three concerns:
 *   1. JSON-LD structured data — parse + validate an operator-authored JSON
 *      string into a schema.org object the page can emit inside a
 *      `<script type="application/ld+json">`. We accept a single object or an
 *      array of objects; we require an `@context` so we never emit malformed
 *      structured data that hurts more than it helps.
 *   2. Redirect path normalization — the `cms_redirects` table CHECK demands
 *      `old_path`/`new_path` start with `/` and differ; we normalize +
 *      pre-validate so the operator gets a friendly message instead of a raw
 *      Postgres constraint violation.
 *   3. A starter Organization JSON-LD stub so operators aren't staring at a
 *      blank textarea.
 */

export type JsonLdValue =
  | string
  | number
  | boolean
  | null
  | JsonLdValue[]
  | { [key: string]: JsonLdValue };

export type JsonLdDocument =
  | Record<string, JsonLdValue>
  | Array<Record<string, JsonLdValue>>;

/** Soft cap so a runaway paste can't bloat the page row / `<head>`. */
export const PAGE_JSON_LD_MAX = 16_000;

export type JsonLdParseResult =
  | { ok: true; value: JsonLdDocument | null }
  | { ok: false; error: string };

/**
 * Parse + validate operator-authored JSON-LD.
 *
 * - Empty / whitespace input → `{ ok: true, value: null }` (clears the field).
 * - Must be valid JSON within the size cap.
 * - Must be an object (or array of objects), each carrying an `@context`
 *   (schema.org structured data is meaningless without it). We do NOT deeply
 *   validate the schema.org vocabulary — that's the operator's call — but we
 *   guarantee the shape can be safely embedded and parsed by crawlers.
 */
export function parsePageJsonLd(raw: string | null | undefined): JsonLdParseResult {
  const trimmed = (raw ?? "").trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > PAGE_JSON_LD_MAX) {
    return {
      ok: false,
      error: `Structured data must be ${PAGE_JSON_LD_MAX.toLocaleString()} characters or fewer.`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "Structured data must be valid JSON." };
  }

  const validateObject = (
    candidate: unknown,
  ):
    | { ok: true; value: Record<string, JsonLdValue> }
    | { ok: false; error: string } => {
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      Array.isArray(candidate)
    ) {
      return { ok: false, error: "Each structured-data entry must be a JSON object." };
    }
    const obj = candidate as Record<string, unknown>;
    const context = obj["@context"];
    if (typeof context !== "string" || context.trim().length === 0) {
      return {
        ok: false,
        error:
          'Structured data needs an "@context" (e.g. "https://schema.org").',
      };
    }
    return { ok: true, value: obj as Record<string, JsonLdValue> };
  };

  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      return { ok: false, error: "Structured-data array can't be empty." };
    }
    const out: Array<Record<string, JsonLdValue>> = [];
    for (const entry of parsed) {
      const result = validateObject(entry);
      if (!result.ok) return { ok: false, error: result.error };
      out.push(result.value);
    }
    return { ok: true, value: out };
  }

  const result = validateObject(parsed);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, value: result.value };
}

/**
 * Render a stored JSON-LD document to the exact string emitted inside a
 * `<script type="application/ld+json">`. `<` is escaped to its unicode
 * sequence so a `</script>` inside a string value can't break out of the tag
 * (the standard JSON-LD-in-HTML hardening; matches lib/seo/talent-json-ld).
 */
export function jsonLdDocumentToScript(doc: JsonLdDocument | null): string {
  if (!doc) return "";
  return JSON.stringify(doc).replace(/</g, "\\u003c");
}

/** Pretty-print a stored document back into the textarea (stable 2-space). */
export function jsonLdDocumentToEditorText(doc: JsonLdDocument | null): string {
  if (!doc) return "";
  try {
    return JSON.stringify(doc, null, 2);
  } catch {
    return "";
  }
}

/** A friendly starter so the authoring textarea is never blank. */
export function organizationJsonLdStub(input: {
  name: string;
  url?: string | null;
}): string {
  const doc: Record<string, JsonLdValue> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: input.name || "Your organization",
  };
  if (input.url && input.url.trim().length > 0) {
    doc.url = input.url.trim();
  }
  return JSON.stringify(doc, null, 2);
}

// ── redirect path normalization ──────────────────────────────────────────────

export type RedirectPathResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

/** Max redirect path length — matches the storefront URL cap (PAGE_SLUG_MAX + prefix slack). */
export const REDIRECT_PATH_MAX = 512;

/**
 * Normalize an operator-typed redirect path into the form the
 * `cms_redirects` CHECK constraints accept:
 *   - trims whitespace
 *   - strips a trailing slash (except the root "/")
 *   - prefixes a leading "/" if missing
 *   - rejects whitespace-in-path, query/hash, and over-length
 * Returns the normalized path or a friendly error.
 */
export function normalizeRedirectPath(raw: string): RedirectPathResult {
  const trimmed = (raw ?? "").trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Path is required." };
  }
  if (/\s/.test(trimmed)) {
    return { ok: false, error: "Path can't contain spaces." };
  }
  if (trimmed.includes("?") || trimmed.includes("#")) {
    return { ok: false, error: "Use a path only — no query string or #fragment." };
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return { ok: false, error: "Use a path (e.g. /old-page), not a full URL." };
  }
  let path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  // Collapse accidental double slashes (but keep the single leading one).
  path = path.replace(/\/{2,}/g, "/");
  // Strip a trailing slash on anything but the root.
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  if (path.length > REDIRECT_PATH_MAX) {
    return {
      ok: false,
      error: `Path must be ${REDIRECT_PATH_MAX} characters or fewer.`,
    };
  }
  return { ok: true, value: path };
}

export type RedirectPairResult =
  | { ok: true; oldPath: string; newPath: string; statusCode: 301 | 302 }
  | { ok: false; error: string };

/** Validate a full redirect tuple the way the DB CHECKs will. */
export function normalizeRedirectPair(input: {
  oldPath: string;
  newPath: string;
  statusCode?: number;
}): RedirectPairResult {
  const oldR = normalizeRedirectPath(input.oldPath);
  if (!oldR.ok) return { ok: false, error: `From: ${oldR.error}` };
  const newR = normalizeRedirectPath(input.newPath);
  if (!newR.ok) return { ok: false, error: `To: ${newR.error}` };
  if (oldR.value === newR.value) {
    return { ok: false, error: "The two paths must be different." };
  }
  const statusCode = input.statusCode === 302 ? 302 : 301;
  return { ok: true, oldPath: oldR.value, newPath: newR.value, statusCode };
}
