/**
 * upsert-conflict-audit.ts — an `onConflict` target that Postgres cannot infer.
 *
 * WHY
 * ───
 * `supabase.from("t").upsert(row, { onConflict: "a,b" })` becomes
 * `INSERT … ON CONFLICT (a, b) …`. Postgres infers which unique index that names.
 * It CANNOT infer a PARTIAL index unless the statement also repeats the
 * predicate — and PostgREST emits the bare form with no way to attach one. The
 * result is `42P10: there is no unique or exclusion constraint matching the ON
 * CONFLICT specification`, raised while PLANNING, so it fails for every row
 * regardless of data.
 *
 * Two writers shipped with exactly this and could never insert anything:
 * `session-writer.ts` against the partial `sessions_series_occurrence_uniq`, and
 * `mint-on-paid.ts` against `admissions_line_seq_uniq`. Both passed every gate,
 * because nothing in `tsx --test` reaches a database and both tables were empty.
 * AN EMPTY TABLE IS NOT EVIDENCE OF A WORKING WRITER — it is exactly what a
 * broken one produces, and it is indistinguishable from a feature nobody has
 * used yet.
 *
 * WHAT IT DOES
 * ────────────
 * Extracts every (table, onConflict columns) pair from `web/src`, replays the
 * migrations IN ORDER to build the set of unique indexes and constraints that
 * exist at HEAD, and classifies each call:
 *
 *   partial  a unique index matches the columns but is PARTIAL → 42P10 at runtime
 *   missing  nothing unique matches those columns on that table → 42P10 at runtime
 *   ok       a total unique index or constraint matches
 *   unknown  the target or the index is not statically decidable (expression
 *            index, dynamic table name) — reported, never failed on
 *
 * REPLAYED IN ORDER, NOT GREPPED. An index can be created in one migration and
 * dropped or replaced in a later one; the state that matters is the one at HEAD.
 * A grep would find the CREATE and never see the DROP — the same defect this
 * repo has an incident file about, one level up.
 *
 * WHY `missing` IS A FAILURE AND NOT A WARNING: it is the same 42P10. A call
 * whose columns match nothing unique is not "probably fine, the PK will catch
 * it" — Postgres does not fall back to the primary key when a target is named.
 *
 * An upsert with NO `onConflict` is not flagged: it conflicts on the primary
 * key, which always exists and is never partial.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { WEB_ROOT, blankComments } from "./supabase-unchecked-read";

export { WEB_ROOT };

export const MIGRATIONS_DIR = join(WEB_ROOT, "..", "supabase", "migrations");

export type UniqueIndex = {
  name: string;
  table: string;
  /** Lower-cased column names. Empty when the definition is an expression. */
  columns: string[];
  partial: boolean;
  /** Migration file it was last defined in. */
  source: string;
  /** True when the column list could not be parsed (expressions, function calls). */
  opaque: boolean;
};

export type UpsertCall = {
  file: string;
  line: number;
  table: string | null;
  /** Null when the call names no onConflict — it conflicts on the primary key. */
  columns: string[] | null;
  /** True when `onConflict` is present but its value is not a string literal. */
  dynamic?: boolean;
  raw: string;
};

export type Verdict = "ok" | "partial" | "missing" | "unknown";

export type Finding = {
  file: string;
  line: number;
  table: string;
  columns: string[];
  verdict: Verdict;
  /** The index that explains the verdict, when there is one. */
  index?: string;
  detail: string;
};

// ── migrations ───────────────────────────────────────────────────────────────

const stripSqlComments = (sql: string): string =>
  sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const normTable = (t: string): string =>
  t.trim().replace(/^public\./i, "").replace(/"/g, "").toLowerCase();

/** Split a parenthesised column list, rejecting anything that is not a plain column. */
function parseColumnList(inner: string): { columns: string[]; opaque: boolean } {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of inner) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);

  const columns: string[] = [];
  let opaque = false;
  for (const p of parts) {
    // Drop per-column modifiers Postgres allows in an index definition.
    const cleaned = p
      .replace(/\b(asc|desc|nulls\s+(first|last))\b/gi, "")
      .replace(/\b\w+_ops\b/gi, "")
      .trim()
      .replace(/^"(.*)"$/, "$1");
    if (!cleaned) continue;
    if (!/^[a-z_][a-z0-9_]*$/i.test(cleaned)) {
      opaque = true; // an expression, a cast, a function call
      continue;
    }
    columns.push(cleaned.toLowerCase());
  }
  return { columns, opaque };
}

/** Split a CREATE TABLE body on commas that are not inside parentheses. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

/** Read the balanced parenthesised group starting at `open`. */
function balanced(sql: string, open: number): { inner: string; end: number } | null {
  if (sql[open] !== "(") return null;
  let depth = 0;
  for (let i = open; i < sql.length; i++) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")") {
      depth--;
      if (depth === 0) return { inner: sql.slice(open + 1, i), end: i };
    }
  }
  return null;
}

/**
 * Replay every migration in filename order and return the unique indexes and
 * constraints that exist at the end. Keyed by name, so a later `CREATE OR
 * REPLACE`-style redefinition or a DROP wins over an earlier definition.
 */
export function collectUniqueIndexes(dir = MIGRATIONS_DIR): UniqueIndex[] {
  return collectSchema(dir).indexes;
}

/**
 * The unique indexes at HEAD, plus the set of tables whose CREATE TABLE we
 * actually saw.
 *
 * That second set is not bookkeeping — it is the difference between "this table
 * has no unique index covering those columns" and "I have never seen this table
 * defined". `agency_taxonomy_settings` is in the database with a perfectly good
 * `(tenant_id, taxonomy_term_id)` unique constraint and is created by NO
 * migration in the repo: its DDL predates the history. Reporting that as a
 * missing constraint is a confident false accusation, and a guard that makes
 * those gets switched off by the third person who has to disprove one.
 */
export function collectSchema(dir = MIGRATIONS_DIR): { indexes: UniqueIndex[]; tables: Set<string> } {
  const knownTables = new Set<string>();
  const byName = new Map<string, UniqueIndex>();
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    const sql = stripSqlComments(readFileSync(join(dir, file), "utf8"));

    // Events are collected with their offsets and applied IN POSITIONAL ORDER.
    // Applying all CREATEs then all DROPs is wrong WITHIN a file as well as
    // across them: `20261229000712` drops `sessions_series_occurrence_uniq` and
    // immediately recreates it TOTAL, and a category-ordered pass deleted the
    // index it had just added, reporting a fixed writer as still broken. The
    // header of this file claimed "replayed in order"; only the file loop was.
    const events: { pos: number; run: () => void }[] = [];

    // CREATE UNIQUE INDEX [CONCURRENTLY] [IF NOT EXISTS] name ON [public.]t [USING m] (cols) [WHERE …]
    const idxRe =
      /create\s+unique\s+index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?([\w".]+)\s+on\s+(?:only\s+)?([\w".]+)\s*(?:using\s+\w+\s*)?\(/gi;
    let m: RegExpExecArray | null;
    while ((m = idxRe.exec(sql)) !== null) {
      const grp = balanced(sql, idxRe.lastIndex - 1);
      if (!grp) continue;
      // Postgres allows NULLS [NOT] DISTINCT, INCLUDE (…), WITH (…) and
      // TABLESPACE between the column list and WHERE. Testing for `where`
      // immediately after the paren reads a PARTIAL index as TOTAL — a guard
      // reporting green on the exact defect it exists to catch. `#1814` adds
      // `… (event_id, starts_at, venue_id) NULLS NOT DISTINCT WHERE event_id IS
      // NOT NULL`, which the naive test would have waved through.
      const tail = sql
        .slice(grp.end + 1, grp.end + 600)
        .replace(/^\s*nulls\s+(not\s+)?distinct\b/i, "")
        .replace(/^\s*include\s*\([^)]*\)/i, "")
        .replace(/^\s*with\s*\([^)]*\)/i, "")
        .replace(/^\s*tablespace\s+\w+/i, "");
      const partial = /^\s*where\b/i.test(tail);
      const { columns, opaque } = parseColumnList(grp.inner);
      const name = m[1].replace(/"/g, "").toLowerCase();
      const tbl = normTable(m[2]);
      const at = m.index;
      events.push({
        pos: at,
        run: () => byName.set(name, { name, table: tbl, columns, partial, source: file, opaque }),
      });
      idxRe.lastIndex = grp.end;
    }

    // DROP INDEX [CONCURRENTLY] [IF EXISTS] a, b;
    const dropRe = /drop\s+index\s+(?:concurrently\s+)?(?:if\s+exists\s+)?([^;]+);/gi;
    while ((m = dropRe.exec(sql)) !== null) {
      const names = m[1].split(",").map((n) => n.trim().replace(/^public\./i, "").replace(/"/g, "").toLowerCase());
      events.push({ pos: m.index, run: () => names.forEach((n) => byName.delete(n)) });
    }

    // ALTER TABLE t ADD CONSTRAINT n UNIQUE (cols)  /  … PRIMARY KEY (cols)
    const consRe =
      /alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?([\w".]+)[\s\S]{0,200}?add\s+constraint\s+([\w"]+)\s+(unique|primary\s+key)\s*\(/gi;
    while ((m = consRe.exec(sql)) !== null) {
      const grp = balanced(sql, consRe.lastIndex - 1);
      if (!grp) continue;
      const { columns, opaque } = parseColumnList(grp.inner);
      const name = m[2].replace(/"/g, "").toLowerCase();
      const ctbl = normTable(m[1]);
      events.push({
        pos: m.index,
        run: () =>
          byName.set(name, { name, table: ctbl, columns, partial: false, source: file, opaque }),
      });
      consRe.lastIndex = grp.end;
    }

    const dropConsRe =
      /alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?[\w".]+\s+drop\s+constraint\s+(?:if\s+exists\s+)?([\w"]+)/gi;
    while ((m = dropConsRe.exec(sql)) !== null) {
      const n = m[1].replace(/"/g, "").toLowerCase();
      events.push({ pos: m.index, run: () => byName.delete(n) });
    }

    // CREATE TABLE t ( … UNIQUE (a,b) … PRIMARY KEY (a,b) … )
    const tblRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?([\w".]+)\s*\(/gi;
    while ((m = tblRe.exec(sql)) !== null) {
      const grp = balanced(sql, tblRe.lastIndex - 1);
      if (!grp) continue;
      const table = normTable(m[1]);
      knownTables.add(table);
      const body = grp.inner;
      const inlineRe = /(?:constraint\s+([\w"]+)\s+)?\b(unique|primary\s+key)\s*\(/gi;
      let im: RegExpExecArray | null;
      while ((im = inlineRe.exec(body)) !== null) {
        const g2 = balanced(body, inlineRe.lastIndex - 1);
        if (!g2) continue;
        const { columns, opaque } = parseColumnList(g2.inner);
        const name = (im[1]?.replace(/"/g, "") ?? `${table}_${columns.join("_")}_key`).toLowerCase();
        events.push({
          pos: tblRe.lastIndex,
          run: () => byName.set(name, { name, table, columns, partial: false, source: file, opaque }),
        });
        inlineRe.lastIndex = g2.end;
      }

      // COLUMN-LEVEL `slug TEXT PRIMARY KEY` / `email TEXT UNIQUE` — no parentheses,
      // so the loop above cannot see them. Missing these made 49 healthy upserts
      // look broken on the first run of this audit, which is worse than finding
      // nothing: a guard that cries wolf on real files gets switched off.
      for (const part of splitTopLevel(body)) {
        const col = /^\s*([\w"]+)\s+[\s\S]*?\b(primary\s+key|unique)\b/i.exec(part);
        if (!col) continue;
        // A table-level `UNIQUE (…)` / `PRIMARY KEY (…)` clause starts with the
        // keyword, not a column name — those are handled above.
        if (/^\s*(constraint|unique|primary|foreign|check|exclude)\b/i.test(part)) continue;
        // `REFERENCES other(id)` is not this column being unique.
        if (/^\s*[\w"]+\s+[\s\S]*?\breferences\b[\s\S]*$/i.test(part) && !/\b(primary\s+key|unique)\b/i.test(part.split(/\breferences\b/i)[0])) continue;
        const name = `${table}_${col[1].replace(/"/g, "").toLowerCase()}_${/primary/i.test(col[2]) ? "pkey" : "key"}`;
        const cols = [col[1].replace(/"/g, "").toLowerCase()];
        events.push({
          pos: tblRe.lastIndex,
          run: () => byName.set(name, { name, table, columns: cols, partial: false, source: file, opaque: false }),
        });
      }
      tblRe.lastIndex = grp.end;
    }

    const dropTblRe = /drop\s+table\s+(?:if\s+exists\s+)?([\w".,\s]+?)(?:cascade|restrict)?\s*;/gi;
    while ((m = dropTblRe.exec(sql)) !== null) {
      const gone = new Set(m[1].split(",").map((t) => normTable(t)));
      events.push({
        pos: m.index,
        run: () => {
          for (const [k, v] of byName) if (gone.has(v.table)) byName.delete(k);
        },
      });
    }

    events.sort((a, b) => a.pos - b.pos).forEach((e) => e.run());
  }

  return { indexes: [...byName.values()], tables: knownTables };
}

// ── application code ─────────────────────────────────────────────────────────

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Every `.upsert(` in a file, with the table from the nearest preceding
 * `.from("…")` and the `onConflict` columns from the call's own options.
 */
export function extractUpserts(raw: string, file: string): UpsertCall[] {
  // Scan the COMMENT-FREE view. This module's own header documents the defect
  // using `.upsert(…, { onConflict: "a,b" })` as an example, and the first run of
  // this audit dutifully reported that example as a finding against a table `t`.
  // A scanner that counts its own prose is the bug it is looking for, one level up.
  const source = blankComments(raw);
  const out: UpsertCall[] = [];
  const re = /\.upsert\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const grp = balanced(source, re.lastIndex - 1);
    const args = grp?.inner ?? source.slice(re.lastIndex, re.lastIndex + 600);

    // The table: the nearest `.from("x")` that is part of THIS chain. Taking the
    // last one anywhere in the file grabs an unrelated earlier query — that is how
    // `booking-hours.ts` first reported `talent_profiles(talent_profile_id)`, a
    // table/column pair that never appears together in the code. A statement
    // terminator between the two means they are not the same chain.
    const before = source.slice(0, m.index);
    let table: string | null = null;
    for (const fm of [...before.matchAll(/\.from\s*\(\s*["'`]([\w.]+)["'`]\s*\)/g)].reverse()) {
      const between = before.slice(fm.index! + fm[0].length);
      if (between.length > 400 || /[;}]/.test(between)) break;
      table = normTable(fm[1]);
      break;
    }

    const oc = /onConflict\s*:\s*["'`]([^"'`]+)["'`]/.exec(args);
    // An `onConflict` whose value is NOT a string literal — `onConflict:
    // conflictTarget`, chosen at runtime. The first version of this scanner
    // matched only literals, so such a call fell through to "no onConflict" and
    // was skipped as if it conflicted on the primary key. That is how this audit
    // MISSED `recipient-safety.ts:364`, where both candidate indexes are partial
    // and blocking a user has never worked. A target we cannot read must be
    // reported as unread, never as safe.
    const dynamic = !oc && /onConflict\s*:/.test(args);
    out.push({
      file,
      line: source.slice(0, m.index).split("\n").length,
      table,
      columns: oc ? oc[1].split(",").map((c) => c.trim().toLowerCase()).filter(Boolean) : null,
      dynamic,
      raw: (oc?.[0] ?? (dynamic ? "onConflict: <not a literal>" : ".upsert() with no onConflict")).slice(0, 120),
    });
    if (grp) re.lastIndex = grp.end;
  }
  return out;
}

export function scanUpserts(root = join(WEB_ROOT, "src")): UpsertCall[] {
  const out: UpsertCall[] = [];
  for (const abs of walk(root, [])) {
    const rel = relative(WEB_ROOT, abs).split(sep).join("/");
    out.push(...extractUpserts(readFileSync(abs, "utf8"), rel));
  }
  return out;
}

const sameSet = (a: string[], b: string[]): boolean =>
  a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");

export function classify(
  call: UpsertCall,
  indexes: readonly UniqueIndex[],
  knownTables?: ReadonlySet<string>,
): Finding | null {
  if (call.dynamic) {
    return {
      file: call.file,
      line: call.line,
      table: call.table ?? "?",
      columns: [],
      verdict: "unknown",
      detail:
        "onConflict is computed at runtime, so its target cannot be read statically. " +
        "NOT a clean bill of health — `recipient-safety.ts` picks between two indexes " +
        "this way and BOTH of them are partial. Check this one by hand.",
    };
  }
  if (!call.columns) return null; // conflicts on the primary key; always inferable
  const base = { file: call.file, line: call.line, table: call.table ?? "?", columns: call.columns };

  if (!call.table) {
    return { ...base, verdict: "unknown", detail: "could not resolve the table from a preceding .from()" };
  }

  const onTable = indexes.filter((i) => i.table === call.table);
  const matches = onTable.filter((i) => !i.opaque && sameSet(i.columns, call.columns));

  const total = matches.find((i) => !i.partial);
  if (total) {
    return { ...base, verdict: "ok", index: total.name, detail: `matches ${total.name}` };
  }

  if (matches.length > 0) {
    const p = matches[0];
    return {
      ...base,
      verdict: "partial",
      index: p.name,
      detail:
        `${p.name} is PARTIAL (has a WHERE predicate). PostgREST emits a bare ` +
        `ON CONFLICT, which Postgres cannot infer to a partial index — every call ` +
        `raises 42P10 at planning time, for every row.`,
    };
  }

  if (onTable.some((i) => i.opaque)) {
    return {
      ...base,
      verdict: "unknown",
      detail: `${call.table} has a unique index this parser cannot read (expression or functional index)`,
    };
  }

  if (knownTables && !knownTables.has(call.table)) {
    return {
      ...base,
      verdict: "unknown",
      detail:
        `no migration in this repo creates ${call.table} — its DDL predates the ` +
        `migration history, so nothing here can prove a constraint absent. Verify ` +
        `against the database before believing anything about this one.`,
    };
  }

  const near = onTable.map((i) => `${i.name}(${i.columns.join(",")})`).join(", ") || "none";
  return {
    ...base,
    verdict: "missing",
    detail:
      `no unique index or constraint on ${call.table} covers (${call.columns.join(", ")}). ` +
      `Postgres does NOT fall back to the primary key when a target is named — this is 42P10. ` +
      `Unique on this table: ${near}`,
  };
}

export function audit(root?: string, migrations?: string): Finding[] {
  const { indexes, tables } = collectSchema(migrations);
  return scanUpserts(root)
    .map((c) => classify(c, indexes, tables))
    .filter((f): f is Finding => f !== null)
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/** Findings that break at runtime. The CI guard fails on these. */
export const isBreaking = (f: Finding): boolean => f.verdict === "partial" || f.verdict === "missing";

export type Baseline = Record<string, string>;

/** `file:line` → verdict, for the ones already known. */
export function toBaseline(findings: readonly Finding[]): Baseline {
  const b: Baseline = {};
  for (const f of findings.filter(isBreaking)) b[`${f.file}:${f.line}`] = f.verdict;
  return b;
}

export type Drift = { key: string; expected?: string; actual?: string; detail?: string };

export function diffAgainstBaseline(findings: readonly Finding[], baseline: Baseline): Drift[] {
  const actual = toBaseline(findings);
  const detail = new Map(findings.map((f) => [`${f.file}:${f.line}`, f.detail]));
  const drift: Drift[] = [];
  for (const key of new Set([...Object.keys(actual), ...Object.keys(baseline)])) {
    if (actual[key] !== baseline[key]) {
      drift.push({ key, expected: baseline[key], actual: actual[key], detail: detail.get(key) });
    }
  }
  return drift.sort((a, b) => a.key.localeCompare(b.key));
}

export function explainDrift(drift: readonly Drift[]): string {
  return drift
    .map((d) =>
      d.actual
        ? `  ${d.key}\n      NEW ${d.actual.toUpperCase()} onConflict target.\n      ${d.detail}\n` +
          `      Fix: name a TOTAL unique index, or make the index total, or drop the\n` +
          `           onConflict and let it conflict on the primary key.`
        : `  ${d.key}\n      FIXED (was ${d.expected}) — remove it from the baseline in this same\n` +
          `      commit, or the slack becomes headroom for the next one.`,
    )
    .join("\n\n");
}
