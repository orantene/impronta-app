#!/usr/bin/env node
/**
 * held-migrations-report.mjs (TUL-1457) - READ-ONLY register of the migrations
 * parked in supabase/migrations/_pending_pm/.
 *
 * check-migrations-applied.mjs does not scan that folder, so a held file can sit
 * there (or be hand-applied and never moved) with nothing watching it. For each
 * *.sql file this prints: version, title, source PR, age in days, and whether the
 * version is recorded in supabase_migrations.schema_migrations on STAGING and PROD.
 *
 * The DB part reads VERSIONS ONLY, via the Supabase Management API
 * /database/query (the same endpoint and SUPABASE_ACCESS_TOKEN that
 * check-anon-function-grants.mjs uses), with a single
 *   select version from supabase_migrations.schema_migrations where version = any(...)
 * No row data is printed, nothing is written, the token is never printed.
 *
 * Targets are fixed (the two project refs below). Without SUPABASE_ACCESS_TOKEN the
 * columns render "not checked (<reason>)" and the script still exits 0: this is a
 * register, never a gate.
 *
 *   node scripts/ci/held-migrations-report.mjs            full table
 *   node scripts/ci/held-migrations-report.mjs --summary  one line, for deploy:smoke
 *   HELD_MIGRATIONS_NO_DB=1                               skip the DB reads
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const STAGING_REF = "fxlankepwnvelxjrahwk";
export const PROD_REF = "pluhdapdnuiulvxmyspd";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "..", "..");
const REPO = join(WEB, "..");
const HELD_DIR = join(REPO, "supabase", "migrations", "_pending_pm");

/** "20261231415400_foo_bar.sql" -> { version, slug } or null. */
export function parseFilename(name) {
  const m = /^(\d{14})_(.+)\.sql$/.exec(name);
  return m ? { version: m[1], slug: m[2] } : null;
}

/** Title: first meaningful header comment line, else the humanised slug. */
export function deriveTitle(slug, sqlText = "") {
  for (const raw of String(sqlText).split("\n").slice(0, 12)) {
    const line = raw.trim();
    if (!line.startsWith("--")) {
      if (line === "") continue;
      break;
    }
    const text = line.replace(/^--+\s*/, "").trim();
    if (/^\d{14}|\.sql\b/.test(text)) continue; // header that just repeats the filename
    if (text && !/^(HELD|NOTE)\b/i.test(text) && text.length > 3) return text.slice(0, 90);
  }
  return slug.replace(/_/g, " ");
}

/** Last "(#1234)" in a commit subject, as "#1234", else null. */
export function extractPr(subject) {
  const all = [...String(subject ?? "").matchAll(/\(#(\d+)\)/g)];
  return all.length ? `#${all[all.length - 1][1]}` : null;
}

/** Whole days between an ISO date and now (never negative); null when unparseable. */
export function ageDays(iso, now = new Date()) {
  const t = Date.parse(iso ?? "");
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

/** Cell text for one target. status = { checked, applied:Set } | { checked:false, reason }. */
export function renderApplied(status, version) {
  if (!status || !status.checked) return `not checked (${status?.reason ?? "unknown"})`;
  return status.applied.has(version) ? "applied" : "NOT applied";
}

function git(args) {
  return execFileSync("git", ["-C", REPO, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function firstAdd(relPath) {
  try {
    const out = git(["log", "--follow", "--diff-filter=A", "--format=%cI%x09%s", "--", relPath]);
    const last = out.split("\n").filter(Boolean).pop();
    if (!last) return { date: null, subject: null };
    const [date, ...rest] = last.split("\t");
    return { date, subject: rest.join("\t") };
  } catch {
    return { date: null, subject: null };
  }
}

export function loadHeld(now = new Date()) {
  let names = [];
  try {
    names = readdirSync(HELD_DIR).filter((n) => n.endsWith(".sql")).sort();
  } catch {
    return [];
  }
  const rows = [];
  for (const name of names) {
    const p = parseFilename(name);
    if (!p) continue;
    const { date, subject } = firstAdd(`supabase/migrations/_pending_pm/${name}`);
    rows.push({
      version: p.version,
      title: deriveTitle(p.slug, readFileSync(join(HELD_DIR, name), "utf8")),
      pr: extractPr(subject) ?? "unknown",
      age: ageDays(date, now),
    });
  }
  return rows;
}

async function readApplied(ref, token, versions) {
  if (versions.length === 0) return { checked: true, applied: new Set() };
  if (!versions.every((v) => /^\d{14}$/.test(v))) return { checked: false, reason: "bad version shape" };
  // Management API takes a bare query string; versions are validated 14-digit literals above.
  const list = versions.map((v) => `'${v}'`).join(",");
  const query = `select version from supabase_migrations.schema_migrations where version = any(array[${list}])`;
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return { checked: false, reason: `HTTP ${res.status}` };
    const rows = await res.json();
    if (!Array.isArray(rows)) return { checked: false, reason: "unexpected response" };
    return { checked: true, applied: new Set(rows.map((r) => String(r.version))) };
  } catch (e) {
    return { checked: false, reason: `request failed: ${e?.name ?? "error"}` };
  }
}

export async function checkTargets(versions, env = process.env) {
  if (env.HELD_MIGRATIONS_NO_DB === "1") {
    const s = { checked: false, reason: "HELD_MIGRATIONS_NO_DB=1" };
    return { staging: s, prod: s };
  }
  const token = env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    const s = { checked: false, reason: "SUPABASE_ACCESS_TOKEN not set" };
    return { staging: s, prod: s };
  }
  const [staging, prod] = await Promise.all([
    readApplied(STAGING_REF, token, versions),
    readApplied(PROD_REF, token, versions),
  ]);
  return { staging, prod };
}

export function summaryLine(rows) {
  if (rows.length === 0) return "held migrations: 0";
  const ages = rows.map((r) => r.age).filter((a) => a !== null);
  const oldest = ages.length ? `${Math.max(...ages)}d` : "unknown";
  return `held migrations: ${rows.length}, oldest ${oldest}`;
}

async function main() {
  const rows = loadHeld();
  if (process.argv.includes("--summary")) {
    console.log(summaryLine(rows));
    return;
  }
  const t = await checkTargets(rows.map((r) => r.version));
  console.log(`Held migrations (supabase/migrations/_pending_pm): ${rows.length}`);
  for (const r of rows) {
    console.log(
      [
        r.version,
        r.title,
        `PR ${r.pr}`,
        r.age === null ? "age unknown" : `${r.age}d`,
        `staging: ${renderApplied(t.staging, r.version)}`,
        `prod: ${renderApplied(t.prod, r.version)}`,
      ].join(" | "),
    );
  }
  console.log(summaryLine(rows));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(`[held-migrations-report] ${e?.message ?? e}`);
    process.exit(0); // register, never a gate
  });
}
