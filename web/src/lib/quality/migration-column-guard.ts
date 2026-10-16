/**
 * TUL-520 — static migration column guard.
 *
 * Catches the #3179 near-miss class: a migration that UPDATE/INSERTs a column
 * that no longer exists on the live schema (e.g. taxonomy_terms.name_en after
 * the name_i18n fold). The checked-in schema snapshot is
 * `database.types.ts` (public.Tables.*.Row), not a live DB call — so CI can
 * fail closed without service-role credentials.
 *
 * Scope: only migrations with version > SNAPSHOT_APPLIED_THROUGH are scanned.
 * Older files already ran (or have CI shims); replaying them against today's
 * types would false-fail on intentional historical shapes. Bump the watermark
 * when regenerating database.types.ts after applying new migrations.
 */

import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const REPO_ROOT = resolve(WEB_ROOT, "..");
export const TYPES_PATH = join(WEB_ROOT, "src/lib/supabase/database.types.ts");
export const MIGRATIONS_DIR = join(REPO_ROOT, "supabase/migrations");

/**
 * Newest migration version present on main when this guard landed / when types
 * last matched production. Migrations with version <= this are not scanned.
 */
export const SNAPSHOT_APPLIED_THROUGH = "20261231355000";

export type SchemaSnapshot = Map<string, Set<string>>;

export type ColumnRef = {
  kind: "insert" | "update";
  table: string;
  cols: string[];
  offset: number;
};

export type MissingColumnProblem = {
  file: string;
  line: number;
  kind: "insert" | "update";
  table: string;
  missing: string[];
};

/** Parse public.Tables.*.Row column names from generated database.types.ts. */
export function parseSchemaSnapshot(typesContent: string): SchemaSnapshot {
  const out: SchemaSnapshot = new Map();
  const publicStart = typesContent.indexOf("\n  public: {");
  if (publicStart === -1) return out;
  const tablesStart = typesContent.indexOf("\n    Tables: {", publicStart);
  if (tablesStart === -1) return out;

  const lines = typesContent.slice(tablesStart).split("\n");
  let depth = 0;
  let inTables = false;
  let table: string | null = null;
  let inRow = false;

  for (const line of lines) {
    if (!inTables) {
      if (line.trimStart().startsWith("Tables: {")) {
        inTables = true;
        depth = 1;
      }
      continue;
    }

    if (depth === 1) {
      const start = /^      ([A-Za-z_][A-Za-z0-9_]*): \{/.exec(line);
      if (start) {
        table = start[1];
        inRow = false;
      }
    }

    if (table && /^ {8}Row: \{/.test(line)) {
      inRow = true;
      if (!out.has(table)) out.set(table, new Set());
    } else if (inRow) {
      if (/^ {8}\}$/.test(line)) {
        inRow = false;
      } else {
        const col = /^ {10}([A-Za-z_][A-Za-z0-9_]*)\??: /.exec(line);
        if (col) out.get(table!)!.add(col[1]);
      }
    }

    for (const ch of line) {
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    if (depth <= 0) break;
  }

  return out;
}

/** Strip `--` line comments and block comments (naive; good enough for DML lint). */
export function stripSqlComments(sql: string): string {
  let out = sql.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  out = out.replace(/--[^\n]*/g, "");
  return out;
}

const INSERT_RE =
  /INSERT\s+INTO\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(\s*([^)]+)\s*\)/gi;

/**
 * UPDATE [public.]table [AS alias]
 * SET col = …, col2 = …
 */
const UPDATE_RE =
  /UPDATE\s+(?:ONLY\s+)?(?:public\.)?([a-z_][a-z0-9_]*)(?:\s+(?:AS\s+)?[a-z_][a-z0-9_]*)?\s+SET\s+([\s\S]*?)(?=\bWHERE\b|\bRETURNING\b|\bFROM\b|;|$)/gi;

const SET_LHS_RE = /(?:^|,)\s*"?([a-z_][a-z0-9_]*)"?\s*=/gi;

const ADD_COLUMN_RE =
  /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi;

export function extractColumnRefs(sql: string): ColumnRef[] {
  const cleaned = stripSqlComments(sql);
  const out: ColumnRef[] = [];

  let m: RegExpExecArray | null;
  INSERT_RE.lastIndex = 0;
  while ((m = INSERT_RE.exec(cleaned))) {
    const cols = m[2]
      .split(/\s*,\s*/)
      .map((c) => c.trim().replace(/^"|"$/g, "").toLowerCase())
      .filter((c) => /^[a-z_][a-z0-9_]*$/.test(c));
    out.push({ kind: "insert", table: m[1].toLowerCase(), cols, offset: m.index });
  }

  UPDATE_RE.lastIndex = 0;
  while ((m = UPDATE_RE.exec(cleaned))) {
    const setClause = m[2];
    const cols: string[] = [];
    let sm: RegExpExecArray | null;
    SET_LHS_RE.lastIndex = 0;
    while ((sm = SET_LHS_RE.exec(setClause))) {
      cols.push(sm[1].toLowerCase());
    }
    if (cols.length > 0) {
      out.push({ kind: "update", table: m[1].toLowerCase(), cols, offset: m.index });
    }
  }

  return out;
}

/** Columns introduced by ADD COLUMN in the same SQL body (same-file DDL+DML). */
export function columnsAddedInSql(sql: string): Map<string, Set<string>> {
  const cleaned = stripSqlComments(sql);
  const out = new Map<string, Set<string>>();
  let m: RegExpExecArray | null;
  ADD_COLUMN_RE.lastIndex = 0;
  while ((m = ADD_COLUMN_RE.exec(cleaned))) {
    const table = m[1].toLowerCase();
    const col = m[2].toLowerCase();
    if (!out.has(table)) out.set(table, new Set());
    out.get(table)!.add(col);
  }
  return out;
}

export function lineOf(sql: string, offset: number): number {
  return sql.slice(0, offset).split("\n").length;
}

export function findMissingColumns(
  sql: string,
  snapshot: SchemaSnapshot,
  file = "(fixture)",
): MissingColumnProblem[] {
  const added = columnsAddedInSql(sql);
  const refs = extractColumnRefs(sql);
  const problems: MissingColumnProblem[] = [];

  for (const ref of refs) {
    const known = snapshot.get(ref.table);
    if (!known) {
      // Table absent from types — likely CREATE TABLE in this (or a peer) migration.
      continue;
    }
    const sameFile = added.get(ref.table) ?? new Set();
    const missing = ref.cols.filter((c) => !known.has(c) && !sameFile.has(c));
    if (missing.length > 0) {
      problems.push({
        file,
        line: lineOf(sql, ref.offset),
        kind: ref.kind,
        table: ref.table,
        missing: [...new Set(missing)].sort(),
      });
    }
  }
  return problems;
}

export function migrationVersion(filename: string): string | null {
  const m = /^(\d{14})_/.exec(filename);
  return m ? m[1] : null;
}

export function listMigrationFiles(
  dir: string,
  afterVersion: string = SNAPSHOT_APPLIED_THROUGH,
): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => {
      const v = migrationVersion(f);
      return v !== null && v > afterVersion;
    })
    .sort();
}

export function scanMigrations(
  dir: string,
  snapshot: SchemaSnapshot,
  afterVersion: string = SNAPSHOT_APPLIED_THROUGH,
): MissingColumnProblem[] {
  const problems: MissingColumnProblem[] = [];
  for (const f of listMigrationFiles(dir, afterVersion)) {
    const sql = readFileSync(join(dir, f), "utf8");
    problems.push(...findMissingColumns(sql, snapshot, basename(f)));
  }
  return problems;
}

export function loadRepoSchemaSnapshot(): SchemaSnapshot {
  return parseSchemaSnapshot(readFileSync(TYPES_PATH, "utf8"));
}

export function formatProblems(problems: readonly MissingColumnProblem[]): string {
  return problems
    .map(
      (p) =>
        `${p.file}:${p.line}  ${p.kind.toUpperCase()} public.${p.table} missing column(s): ${p.missing.join(", ")}`,
    )
    .join("\n");
}
