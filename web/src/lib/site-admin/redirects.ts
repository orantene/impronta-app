/**
 * Redirect-manager helpers — pure, side-effect-free logic behind the workspace
 * Website → Redirects surface (`admin/website/redirects`).
 *
 * Path normalization + the DB CHECK parity live in `cms-seo.ts`
 * (`normalizeRedirectPath` / `normalizeRedirectPair`); this module is the layer
 * above it: bulk import parsing, hygiene auditing, and CSV export.
 *
 * Why the audit exists at all: the resolver
 * (`lib/cms/middleware-redirect.tryCmsRedirectResponse`) does ONE exact-path
 * lookup per request and returns the row's `new_path` verbatim. It does not
 * follow chains. So a tenant that adds `/a → /b` and later `/b → /c` gets two
 * hops in the browser (a 301 to /b, then a 301 to /c) — which costs crawl
 * budget and leaks link equity — and `/a → /b` plus `/b → /a` is an infinite
 * loop the browser terminates with ERR_TOO_MANY_REDIRECTS. Neither is a DB
 * constraint violation, so nothing catches them but this.
 *
 * Kept dependency-light (no "use server", no Supabase, no React) so it imports
 * into the client table, the server actions, and `tsx --test` alike.
 */

import { normalizeRedirectPair, normalizeRedirectPath } from "./cms-seo";

/** One redirect as the admin surface sees it. */
export interface RedirectRecord {
  id: string;
  oldPath: string;
  newPath: string;
  statusCode: number;
  active: boolean;
  createdAt: string;
  updatedAt: string | null;
}

// ── hygiene audit ────────────────────────────────────────────────────────────

export type RedirectIssue =
  /** `newPath` is itself the source of another active redirect → 2+ hops. */
  | { kind: "chain"; finalPath: string; hops: number }
  /** Following the chain comes back to this row's own source → infinite loop. */
  | { kind: "loop" }
  /**
   * A disabled row whose `oldPath` an active row already claims. Re-enabling it
   * will fail on `cms_redirects_tenant_old_path_active_key`, so the operator
   * should know before they click.
   */
  | { kind: "shadowed" };

/**
 * Hard cap on rows the surface loads. Lives here rather than beside the query
 * in `actions.ts`: that file is `"use server"`, where a non-async export is a
 * build error — and one that only surfaces when the route is compiled, long
 * after `tsc` and `verify:server-actions` have both gone green.
 */
export const REDIRECT_LIST_LIMIT = 500;

/** How far `resolveFinalPath` walks before it calls the chain a loop. */
export const MAX_CHAIN_DEPTH = 10;

/**
 * Follow `startPath` through the active redirect graph and report where a
 * browser would actually land.
 *
 * `hops` counts redirect responses, so an unredirected path is 0 hops and a
 * healthy single redirect is 1. `looped` means the walk revisited a path (or
 * blew MAX_CHAIN_DEPTH) — the browser would give up with a redirect error.
 */
export function resolveFinalPath(
  startPath: string,
  activeByOldPath: ReadonlyMap<string, string>,
): { finalPath: string; hops: number; looped: boolean } {
  const seen = new Set<string>([startPath]);
  let current = startPath;
  let hops = 0;
  while (hops < MAX_CHAIN_DEPTH) {
    const next = activeByOldPath.get(current);
    if (next === undefined) return { finalPath: current, hops, looped: false };
    hops += 1;
    if (seen.has(next)) return { finalPath: next, hops, looped: true };
    seen.add(next);
    current = next;
  }
  return { finalPath: current, hops, looped: true };
}

/**
 * Per-row hygiene issues, keyed by redirect id. A row with no issues is absent
 * from the map (so `map.get(id) ?? []` is the read).
 */
export function auditRedirects(
  rows: ReadonlyArray<RedirectRecord>,
): Map<string, RedirectIssue[]> {
  const activeByOldPath = new Map<string, string>();
  for (const row of rows) {
    if (row.active) activeByOldPath.set(row.oldPath, row.newPath);
  }

  const issues = new Map<string, RedirectIssue[]>();
  const push = (id: string, issue: RedirectIssue) => {
    const list = issues.get(id);
    if (list) list.push(issue);
    else issues.set(id, [issue]);
  };

  for (const row of rows) {
    if (!row.active) {
      if (activeByOldPath.has(row.oldPath)) push(row.id, { kind: "shadowed" });
      continue;
    }
    const walk = resolveFinalPath(row.newPath, activeByOldPath);
    if (walk.looped) {
      push(row.id, { kind: "loop" });
    } else if (walk.hops > 0) {
      // hops on the DESTINATION, +1 for this row's own redirect.
      push(row.id, {
        kind: "chain",
        finalPath: walk.finalPath,
        hops: walk.hops + 1,
      });
    }
  }
  return issues;
}

/** Human-readable one-liner for an issue — shared by the table and the tests. */
export function describeRedirectIssue(issue: RedirectIssue): string {
  switch (issue.kind) {
    case "loop":
      return "Redirect loop — this path forwards back to itself. Visitors get an error page.";
    case "chain":
      return `Chained: visitors take ${issue.hops} hops before landing on ${issue.finalPath}. Point this straight at ${issue.finalPath}.`;
    case "shadowed":
      return "Another active redirect already uses this From path. Turning this one back on will fail until the other is disabled.";
  }
}

// ── bulk import ──────────────────────────────────────────────────────────────

/** Cap on one paste, so a runaway spreadsheet can't fire 10k inserts. */
export const REDIRECT_IMPORT_MAX = 500;

export type ParsedImportLine =
  | {
      ok: true;
      line: number;
      oldPath: string;
      newPath: string;
      statusCode: 301 | 302;
    }
  | { ok: false; line: number; raw: string; error: string };

export interface RedirectImportParse {
  rows: ParsedImportLine[];
  /** Count of `ok: true` entries — the UI's "N ready" figure. */
  validCount: number;
  /** True when the paste was truncated at REDIRECT_IMPORT_MAX. */
  truncated: boolean;
}

const HEADER_TOKENS = new Set([
  "from",
  "to",
  "old",
  "new",
  "old_path",
  "new_path",
  "source",
  "target",
  "destination",
  "status",
  "status_code",
  "code",
  "type",
]);

/** A first line of pure column names is a header, not a redirect. */
function looksLikeHeader(fields: readonly string[]): boolean {
  if (fields.length < 2) return false;
  return fields
    .slice(0, 2)
    .every((f) => HEADER_TOKENS.has(f.toLowerCase().replace(/\s+/g, "_")));
}

/** Accepts `a,b` · `a<TAB>b` · `a b` · `a -> b` · `a → b`, quotes stripped. */
function splitFields(raw: string): string[] {
  return raw
    .replace(/\s*(?:->|→|=>)\s*/g, ",")
    .split(/[,\t;]|\s+/)
    .map((f) => f.trim().replace(/^["']|["']$/g, ""))
    .filter((f) => f.length > 0);
}

function parseStatusField(raw: string | undefined): 301 | 302 | null {
  if (raw === undefined) return 301;
  const token = raw.trim().toLowerCase();
  if (token === "" || token === "301" || token === "permanent") return 301;
  if (token === "302" || token === "temporary" || token === "temp") return 302;
  return null;
}

/**
 * Parse a pasted block of redirects into per-line results.
 *
 * One redirect per line: `from`, `to`, and an optional status
 * (`301`/`302`/`permanent`/`temporary`; default 301). Blank lines and `#`
 * comments are skipped silently. Every line is reported — failures included —
 * so the UI can show a preview with the bad rows called out rather than
 * swallowing them.
 *
 * Line numbers are 1-based against the ORIGINAL text, so the operator can find
 * the offending row in their own paste.
 */
export function parseRedirectImport(text: string): RedirectImportParse {
  const lines = (text ?? "").split(/\r?\n/);
  const rows: ParsedImportLine[] = [];
  const seenSources = new Set<string>();
  let truncated = false;
  let considered = 0;
  let headerChecked = false;

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? "";
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const fields = splitFields(trimmed);
    if (!headerChecked) {
      headerChecked = true;
      if (looksLikeHeader(fields)) continue;
    }

    if (considered >= REDIRECT_IMPORT_MAX) {
      truncated = true;
      break;
    }
    considered += 1;
    const lineNo = i + 1;

    if (fields.length < 2) {
      rows.push({
        ok: false,
        line: lineNo,
        raw: trimmed,
        error: "Needs two paths: from and to.",
      });
      continue;
    }
    if (fields.length > 3) {
      rows.push({
        ok: false,
        line: lineNo,
        raw: trimmed,
        error: "Too many columns — expected from, to, and an optional 301/302.",
      });
      continue;
    }

    const statusCode = parseStatusField(fields[2]);
    if (statusCode === null) {
      rows.push({
        ok: false,
        line: lineNo,
        raw: trimmed,
        error: `"${fields[2]}" isn't a status — use 301 or 302.`,
      });
      continue;
    }

    const pair = normalizeRedirectPair({
      oldPath: fields[0] ?? "",
      newPath: fields[1] ?? "",
      statusCode,
    });
    if (!pair.ok) {
      rows.push({ ok: false, line: lineNo, raw: trimmed, error: pair.error });
      continue;
    }
    if (seenSources.has(pair.oldPath)) {
      rows.push({
        ok: false,
        line: lineNo,
        raw: trimmed,
        error: `${pair.oldPath} appears more than once in this paste.`,
      });
      continue;
    }
    seenSources.add(pair.oldPath);

    rows.push({
      ok: true,
      line: lineNo,
      oldPath: pair.oldPath,
      newPath: pair.newPath,
      statusCode: pair.statusCode,
    });
  }

  return {
    rows,
    validCount: rows.filter((r) => r.ok).length,
    truncated,
  };
}

// ── export ───────────────────────────────────────────────────────────────────

function csvCell(value: string | number | boolean): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Round-trip-safe CSV: the header + column order match what
 * `parseRedirectImport` accepts, so an export can be edited in a spreadsheet
 * and pasted straight back into the importer.
 */
export function toRedirectsCsv(rows: ReadonlyArray<RedirectRecord>): string {
  const lines = ["from,to,status,state"];
  for (const row of rows) {
    lines.push(
      [
        csvCell(row.oldPath),
        csvCell(row.newPath),
        csvCell(row.statusCode),
        csvCell(row.active ? "active" : "disabled"),
      ].join(","),
    );
  }
  return lines.join("\n");
}

// ── search ───────────────────────────────────────────────────────────────────

/** Case-insensitive substring match over both paths. Empty query matches all. */
export function matchesRedirectQuery(row: RedirectRecord, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  return (
    row.oldPath.toLowerCase().includes(needle) ||
    row.newPath.toLowerCase().includes(needle)
  );
}

/**
 * Live validation for the add/edit form — same rules the server will apply, so
 * the operator sees the problem while typing instead of after a round trip.
 * Returns null when the field is fine (or still empty).
 */
export function redirectFieldHint(raw: string): string | null {
  if (raw.trim() === "") return null;
  const result = normalizeRedirectPath(raw);
  return result.ok ? null : result.error;
}
