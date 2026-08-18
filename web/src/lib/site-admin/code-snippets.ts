/**
 * Custom-code snippet library — pure logic behind Website → Setup → Custom code.
 *
 * WHAT LIVES HERE
 * ───────────────
 * Everything about a snippet that does not need Supabase, React, or a request:
 * the shape of a row, the validation the server action runs before writing, and
 * — the part that matters most — `selectSnippetsForRender`, the single function
 * that decides what actually reaches a visitor's page.
 *
 * That function is deliberately the ONLY road to the storefront. The injector
 * (components/integrations/tenant-code-snippets.tsx) renders exactly what this
 * returns and nothing else, so the four rules that keep custom code safe are one
 * testable unit rather than four scattered `if`s:
 *
 *   1. TENANT   — a row whose `tenantId` is not the tenant being rendered is
 *                 dropped. The DB (RLS + the reader RPC) already enforces this;
 *                 this is the second, independent copy of the rule, because a
 *                 snippet leaking onto another agency's site is the worst thing
 *                 this feature can do.
 *   2. PUBLISHED— drafts never render. An operator pasting half a script and
 *                 walking away must not break their live site.
 *   3. PLACEMENT— head vs body_end routes to two different mount points.
 *   4. BREAKOUT — inline code containing a sequence that would CLOSE its own
 *                 tag is dropped, not escaped. See `inlineCodeBreakout` below.
 *
 * Kept dependency-light (no "use server", no Supabase, no React) so it imports
 * into the client editor, the server actions, the storefront injector, and
 * `tsx --test` alike — the same reason `redirects.ts` next door is shaped this
 * way.
 *
 * WHY `js` RUNS AND `external_*` DOES NOT — the CSP, stated plainly
 * ────────────────────────────────────────────────────────────────
 * `next.config.ts contentSecurityPolicy()` already ships
 * `script-src 'self' 'unsafe-inline' …` and
 * `style-src  'self' 'unsafe-inline' …` in production. Inline `<style>` and
 * inline `<script>` therefore execute today with NO CSP change — so `css` and
 * `js` snippets work as authored.
 *
 * External files do not. `script-src` / `style-src` name a fixed list of hosts
 * (Stripe, Google, hCaptcha, …) and a tenant's chosen CDN is not on it. Adding
 * one would mean either a per-request CSP (the header is static, emitted from
 * `next.config.ts`) or allow-listing a CDN for EVERY tenant and the platform hub
 * — a global weakening this PR refuses to make. Adding a `nonce` is worse than
 * useless here: a nonce makes browsers IGNORE `'unsafe-inline'`, which would
 * break every inline script the app and its vendors already emit.
 *
 * So `external_script` / `external_style` exist in the schema and in this type
 * union — the storage contract is forward-compatible — but they are not
 * offered in the editor and `selectSnippetsForRender` will not render them.
 * The alternative was letting an operator save a snippet that silently never
 * runs, which is the failure mode this whole surface exists to end.
 */

// ── vocabulary ───────────────────────────────────────────────────────────────

export const CODE_SNIPPET_KINDS = [
  "css",
  "js",
  "external_script",
  "external_style",
] as const;
export type CodeSnippetKind = (typeof CODE_SNIPPET_KINDS)[number];

export const CODE_SNIPPET_PLACEMENTS = ["head", "body_end"] as const;
export type CodeSnippetPlacement = (typeof CODE_SNIPPET_PLACEMENTS)[number];

/**
 * The kinds that actually EXECUTE under the current Content-Security-Policy.
 * See the file header. Anything not in this list is stored but never rendered.
 */
export const RUNNABLE_CODE_SNIPPET_KINDS = ["css", "js"] as const;
export type RunnableCodeSnippetKind = (typeof RUNNABLE_CODE_SNIPPET_KINDS)[number];

export function isRunnableSnippetKind(kind: string): kind is RunnableCodeSnippetKind {
  return (RUNNABLE_CODE_SNIPPET_KINDS as readonly string[]).includes(kind);
}

export function isCodeSnippetKind(value: unknown): value is CodeSnippetKind {
  return (
    typeof value === "string" && (CODE_SNIPPET_KINDS as readonly string[]).includes(value)
  );
}

export function isCodeSnippetPlacement(value: unknown): value is CodeSnippetPlacement {
  return (
    typeof value === "string" &&
    (CODE_SNIPPET_PLACEMENTS as readonly string[]).includes(value)
  );
}

// ── caps ─────────────────────────────────────────────────────────────────────

/** Mirrors `cms_code_snippets_name_len`. */
export const CODE_SNIPPET_NAME_MAX = 80;
/** Mirrors `cms_code_snippets_code_len`. */
export const CODE_SNIPPET_CODE_MAX = 20_000;
/** Mirrors `cms_code_snippets_src_url_len`. */
export const CODE_SNIPPET_URL_MAX = 500;
/** Hard cap on rows the admin surface loads AND on rows a tenant may own. */
export const CODE_SNIPPET_LIST_LIMIT = 50;
/**
 * Total characters of PUBLISHED inline code a single page will carry. A tenant
 * can hit `CODE_SNIPPET_CODE_MAX` fifty times over and still not be allowed to
 * ship a megabyte into every page; snippets past the budget are dropped in
 * author order and reported by `selectSnippetsForRender`.
 */
export const CODE_SNIPPET_RENDER_BUDGET = 60_000;

// ── row shape ────────────────────────────────────────────────────────────────

/** One snippet as the admin surface sees it. */
export interface CodeSnippetRecord {
  id: string;
  name: string;
  kind: CodeSnippetKind;
  /** Inline source for `css` / `js`. Empty string for external kinds. */
  code: string;
  /** Absolute https URL for `external_*`. Null for inline kinds. */
  srcUrl: string | null;
  placement: CodeSnippetPlacement;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  sortOrder: number;
}

/**
 * A row as the RENDER path sees it: the record plus the tenant that owns it.
 *
 * `tenantId` is carried explicitly rather than assumed from the query, so
 * `selectSnippetsForRender` can re-check ownership itself. A function that has
 * to be told which tenant a row belongs to cannot quietly stop checking.
 */
export interface OwnedCodeSnippet extends CodeSnippetRecord {
  tenantId: string;
}

// ── validation (server action pre-write) ─────────────────────────────────────

export interface CodeSnippetInput {
  name: string;
  kind: string;
  code?: string | null;
  srcUrl?: string | null;
  placement: string;
}

export interface NormalizedCodeSnippet {
  name: string;
  kind: CodeSnippetKind;
  code: string;
  srcUrl: string | null;
  placement: CodeSnippetPlacement;
}

export type NormalizeResult =
  | { ok: true; value: NormalizedCodeSnippet }
  | { ok: false; error: string };

/**
 * The sequences that would let inline code escape the tag it is written into.
 *
 * Escaping is NOT an option for either container. `<style>` and `<script>` are
 * raw-text elements: the HTML parser ends them on the literal byte sequence
 * `</style` / `</script`, and no entity or backslash inside changes that — the
 * parser is not running a CSS or JS tokenizer yet. `<!--` is listed for scripts
 * because it flips the tokenizer into script-data-escaped state, where a nested
 * `<script>` can then smuggle markup past the closing tag.
 *
 * So the rule is REJECT, not sanitize: an operator gets a clear error at save
 * time, and any row that reached the table by another route is dropped at
 * render. A snippet legitimately needing the literal text `</script>` can build
 * it at runtime (`"<\/scr" + "ipt>"`), which is what every CMS tells authors.
 */
const BREAKOUT_PATTERNS: Readonly<Record<RunnableCodeSnippetKind, readonly RegExp[]>> = {
  css: [/<\/\s*style/i],
  js: [/<\/\s*script/i, /<!--/, /-->/],
};

/**
 * Returns the offending sequence when `code` could break out of a `kind` tag,
 * or null when it is safe to emit verbatim.
 */
export function inlineCodeBreakout(
  kind: RunnableCodeSnippetKind,
  code: string,
): string | null {
  for (const pattern of BREAKOUT_PATTERNS[kind]) {
    const hit = pattern.exec(code);
    if (hit) return hit[0];
  }
  return null;
}

/**
 * Normalize a tenant-supplied external URL, or null when it must not be used.
 *
 * https only: `javascript:` is script execution wearing a URL, `data:` is the
 * same trick with a payload attached, and plain `http:` on an https page is a
 * mixed-content block plus an active-MITM channel into the tenant's own site.
 * Credentials in the authority (`https://user:pass@host`) are rejected because
 * they turn a shared config value into a leaked secret.
 */
export function normalizeExternalUrl(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed || trimmed.length > CODE_SNIPPET_URL_MAX) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  if (!parsed.hostname) return null;
  const serialized = parsed.toString();
  return serialized.length <= CODE_SNIPPET_URL_MAX ? serialized : null;
}

/**
 * Validate + canonicalize one editor payload. Every message is written for the
 * non-developer who will read it in the admin, not for a stack trace.
 */
export function normalizeCodeSnippetInput(input: CodeSnippetInput): NormalizeResult {
  const name = (input.name ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Give this snippet a name." };
  if (name.length > CODE_SNIPPET_NAME_MAX) {
    return { ok: false, error: `Keep the name under ${CODE_SNIPPET_NAME_MAX} characters.` };
  }

  if (!isCodeSnippetKind(input.kind)) {
    return { ok: false, error: "Choose whether this is CSS or JavaScript." };
  }
  if (!isCodeSnippetPlacement(input.placement)) {
    return { ok: false, error: "Choose where this snippet runs." };
  }

  if (!isRunnableSnippetKind(input.kind)) {
    return {
      ok: false,
      error:
        "Linking a file from another website is not available yet. Paste the CSS or JavaScript itself instead.",
    };
  }

  const code = (input.code ?? "").replace(/\r\n/g, "\n").trim();
  if (!code) return { ok: false, error: "Add some code, or delete the snippet." };
  if (code.length > CODE_SNIPPET_CODE_MAX) {
    return {
      ok: false,
      error: `This snippet is too long. Keep it under ${CODE_SNIPPET_CODE_MAX.toLocaleString("en-US")} characters.`,
    };
  }

  const breakout = inlineCodeBreakout(input.kind, code);
  if (breakout) {
    return {
      ok: false,
      error:
        input.kind === "css"
          ? `Remove "${breakout}" — a closing style tag inside CSS ends the block early and breaks the page.`
          : `Remove "${breakout}" — it ends the script early and breaks the page. Build the text in code instead, for example "<\\/scr" + "ipt>".`,
    };
  }

  return {
    ok: true,
    value: { name, kind: input.kind, code, srcUrl: null, placement: input.placement },
  };
}

// ── render selection (the storefront's only road) ────────────────────────────

/** One snippet cleared for the DOM. `kind` narrows the tag to emit. */
export interface RenderableSnippet {
  id: string;
  name: string;
  kind: RunnableCodeSnippetKind;
  code: string;
}

export interface SnippetRenderSelection {
  snippets: RenderableSnippet[];
  /** Rows dropped, by reason — surfaced in logs, never silently swallowed. */
  dropped: {
    otherTenant: number;
    unpublished: number;
    otherPlacement: number;
    notRunnableKind: number;
    breakout: number;
    overBudget: number;
  };
}

/**
 * THE gate between the `cms_code_snippets` table and a visitor's browser.
 *
 * Everything the storefront injects passes through here. See the four rules in
 * the file header; each has a counter in `dropped` so a snippet that does not
 * appear on the page can be explained rather than guessed at.
 *
 * Order is `sortOrder` then `createdAt` — the same order the admin list shows
 * and the reader RPC returns, so "third in the list" means "third on the page".
 */
export function selectSnippetsForRender(
  rows: readonly OwnedCodeSnippet[],
  options: { tenantId: string; placement: CodeSnippetPlacement },
): SnippetRenderSelection {
  const dropped = {
    otherTenant: 0,
    unpublished: 0,
    otherPlacement: 0,
    notRunnableKind: 0,
    breakout: 0,
    overBudget: 0,
  };

  // A blank tenant id can never match a row: fail closed rather than treating
  // "no tenant resolved" as "every tenant".
  if (!options.tenantId) {
    return { snippets: [], dropped: { ...dropped, otherTenant: rows.length } };
  }

  const eligible = rows.filter((row) => {
    if (row.tenantId !== options.tenantId) {
      dropped.otherTenant += 1;
      return false;
    }
    if (!row.isPublished) {
      dropped.unpublished += 1;
      return false;
    }
    if (row.placement !== options.placement) {
      dropped.otherPlacement += 1;
      return false;
    }
    if (!isRunnableSnippetKind(row.kind)) {
      dropped.notRunnableKind += 1;
      return false;
    }
    return true;
  });

  eligible.sort(
    (a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt),
  );

  const snippets: RenderableSnippet[] = [];
  let budget = CODE_SNIPPET_RENDER_BUDGET;
  for (const row of eligible) {
    // `eligible` already proved the kind is runnable; TS cannot see that through
    // a filter callback, so narrow once here rather than at every use.
    if (!isRunnableSnippetKind(row.kind)) continue;
    const kind: RunnableCodeSnippetKind = row.kind;
    const code = row.code ?? "";
    // A blank row cannot exist (cms_code_snippets_payload_check) — skipped
    // rather than counted, because there is nothing for an operator to fix.
    if (!code.trim()) continue;
    if (inlineCodeBreakout(kind, code)) {
      dropped.breakout += 1;
      continue;
    }
    if (code.length > budget) {
      dropped.overBudget += 1;
      continue;
    }
    budget -= code.length;
    snippets.push({ id: row.id, name: row.name, kind, code });
  }

  return { snippets, dropped };
}

/** True when any counter in a selection recorded a drop worth logging. */
export function selectionDroppedAnything(selection: SnippetRenderSelection): boolean {
  return Object.values(selection.dropped).some((n) => n > 0);
}

// ── admin-side summary helpers ───────────────────────────────────────────────

/**
 * Whether the tenant is allowed one more snippet. The limit is per tenant, not
 * per placement — the point is a bounded amount of custom code per site.
 */
export function canAddSnippet(currentCount: number): boolean {
  return currentCount < CODE_SNIPPET_LIST_LIMIT;
}

/** Published characters currently riding on one placement. */
export function publishedCodeLength(
  rows: readonly CodeSnippetRecord[],
  placement: CodeSnippetPlacement,
): number {
  return rows
    .filter((r) => r.isPublished && r.placement === placement && isRunnableSnippetKind(r.kind))
    .reduce((sum, r) => sum + (r.code?.length ?? 0), 0);
}
