#!/usr/bin/env node
/**
 * One-time backfill: dynFields → talent_profile_field_values.
 *
 * The prototype keeps per-talent type-specific values in
 * `ProfileState.dynFields` (a flat key→value map) plus the override
 * store `__profileOverrides` (sparse merge). When Phase D goes live,
 * those values need to land in `talent_profile_field_values` rows
 * keyed by (talent_profile_id, field_definition_id).
 *
 * This script reads the dynFields blob from a notional source
 * (production: a Postgres table that today stores the JSON; locally:
 * a JSON file you export from the prototype's localStorage) and emits
 * SQL inserts.
 *
 * Two modes:
 *   --dry-run    — print SQL to stdout (default)
 *   --apply      — execute via scripts/_pg-via-mgmt-api.mjs against
 *                  the hosted Supabase project
 *
 * Usage:
 *   # dry run, read from a stub JSON
 *   node scripts/backfill-talent-field-values.mjs \
 *     --source ./scratch/dynFields-snapshot.json \
 *     > scratch/backfill.sql
 *
 *   # actually apply
 *   node scripts/backfill-talent-field-values.mjs \
 *     --source ./scratch/dynFields-snapshot.json --apply
 *
 * The source JSON shape:
 *   {
 *     "<talent_profile_id>": {
 *       "primaryType": "models",
 *       "secondaryTypes": ["hosts"],
 *       "dynFields": { "height": "5'9\"", "bust": "86 cm", ... },
 *       "dynFieldVisibility": { "bust": ["agency"], ... }    // optional
 *     },
 *     ...
 *   }
 *
 * The script:
 *   1. Resolves each dynFields key → catalog field_key by trying
 *      `<primaryType>.<key>` first, then `<secondaryType>.<key>`.
 *      Skips keys with no catalog entry (logs a warning).
 *   2. Wraps the value in JSONB matching the catalog kind (string for
 *      text/select; array for multiselect/chips; number for number).
 *   3. INSERT ON CONFLICT (talent_profile_id, field_definition_id) DO
 *      UPDATE — re-running is safe.
 *   4. visibility_override pulled from dynFieldVisibility when present;
 *      NULL otherwise (caller falls back to catalog default).
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

// ─── Args ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(flag, fallback) {
  const idx = args.indexOf(flag);
  if (idx === -1) return fallback;
  return args[idx + 1];
}
const SOURCE = getArg("--source");
const APPLY = args.includes("--apply");

if (!SOURCE) {
  console.error("Usage: backfill-talent-field-values.mjs --source <path> [--apply]");
  process.exit(2);
}

// ─── Read catalog (we re-use the seed generator's parser) ──────────────

const CATALOG_PATH = path.join(REPO_ROOT, "web/src/app/prototypes/admin-shell/_field-catalog.ts");
const STATE_PATH   = path.join(REPO_ROOT, "web/src/app/prototypes/admin-shell/_state.tsx");

function readFile(p) { return fs.readFileSync(p, "utf8"); }

// Minimal duplicate of the seed generator's array-literal parser.
// (The seed generator already handles this; we re-use the logic to
// avoid a runtime dependency on TypeScript.)
function extractArrayLiteral(source, constName) {
  const re = new RegExp(`(?:export\\s+)?const\\s+${constName}[^=]*=\\s*\\[`, "m");
  const startMatch = source.match(re);
  if (!startMatch) throw new Error(`Could not find const ${constName}.`);
  const startIdx = startMatch.index + startMatch[0].length - 1;
  let depth = 0, i = startIdx, inStr = null, inCmt = null;
  while (i < source.length) {
    const ch = source[i], next = source[i + 1];
    if (inCmt === "//") { if (ch === "\n") inCmt = null; }
    else if (inCmt === "/*") { if (ch === "*" && next === "/") { inCmt = null; i++; } }
    else if (inStr) {
      if (ch === "\\") { i += 2; continue; }
      if (ch === inStr) inStr = null;
    } else {
      if (ch === "/" && next === "/") { inCmt = "//"; i++; }
      else if (ch === "/" && next === "*") { inCmt = "/*"; i++; }
      else if (ch === '"' || ch === "'" || ch === "`") inStr = ch;
      else if (ch === "[") depth++;
      else if (ch === "]") {
        depth--;
        if (depth === 0) return source.slice(startIdx, i + 1);
      }
    }
    i++;
  }
  throw new Error(`Unterminated literal for ${constName}.`);
}

function parseEntries(arrayLiteral) {
  const inner = arrayLiteral.slice(1, -1);
  const out = [];
  let depth = 0, buf = "", inStr = null, inCmt = null;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i], next = inner[i + 1];
    if (inCmt === "//") { if (ch === "\n") inCmt = null; continue; }
    if (inCmt === "/*") { if (ch === "*" && next === "/") { inCmt = null; i++; } continue; }
    if (inStr) {
      buf += ch;
      if (ch === "\\") { buf += inner[++i]; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === "/" && next === "/") { inCmt = "//"; i++; continue; }
    if (ch === "/" && next === "*") { inCmt = "/*"; i++; continue; }
    if (ch === '"' || ch === "'" || ch === "`") inStr = ch;
    if (ch === "{" || ch === "[") depth++;
    if (ch === "}" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      const t = buf.trim();
      if (t) out.push(t);
      buf = "";
      continue;
    }
    buf += ch;
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out.map(e => {
    const cleaned = e
      .replace(/\s+as\s+const\b/g, "")
      .replace(/\s+as\s+[A-Za-z_<>[\]"|& ]+/g, "");
    return new Function(`return (${cleaned});`)();
  });
}

const catalogSrc = readFile(CATALOG_PATH);
const HARDCODED_FIELDS = parseEntries(extractArrayLiteral(catalogSrc, "HARDCODED_FIELDS"));

// Parse TAXONOMY_FIELDS structure (same shape as the seed generator).
function parseTaxonomyFields(source) {
  const re = /export const TAXONOMY_FIELDS: Record<TaxonomyParentId, RegField\[\]> = \{/;
  const startMatch = source.match(re);
  if (!startMatch) throw new Error("TAXONOMY_FIELDS not found.");
  const startIdx = startMatch.index + startMatch[0].length - 1;
  let depth = 0, i = startIdx, inStr = null, inCmt = null;
  while (i < source.length) {
    const ch = source[i], next = source[i + 1];
    if (inCmt === "//") { if (ch === "\n") inCmt = null; }
    else if (inCmt === "/*") { if (ch === "*" && next === "/") { inCmt = null; i++; } }
    else if (inStr) {
      if (ch === "\\") { i += 2; continue; }
      if (ch === inStr) inStr = null;
    } else {
      if (ch === "/" && next === "/") { inCmt = "//"; i++; }
      else if (ch === "/" && next === "*") { inCmt = "/*"; i++; }
      else if (ch === '"' || ch === "'" || ch === "`") inStr = ch;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const body = source.slice(startIdx + 1, i);
          return parseTaxonomyBody(body);
        }
      }
    }
    i++;
  }
  throw new Error("Unterminated TAXONOMY_FIELDS body.");
}

function parseTaxonomyBody(body) {
  const parents = {};
  const re = /(\w+):\s*\[/g;
  let match;
  const positions = [];
  while ((match = re.exec(body)) !== null) {
    positions.push({ name: match[1], openBracketIdx: match.index + match[0].length - 1 });
  }
  for (const { name, openBracketIdx } of positions) {
    let depth = 0, i = openBracketIdx, inStr = null, inCmt = null;
    while (i < body.length) {
      const ch = body[i], next = body[i + 1];
      if (inCmt === "//") { if (ch === "\n") inCmt = null; }
      else if (inCmt === "/*") { if (ch === "*" && next === "/") { inCmt = null; i++; } }
      else if (inStr) {
        if (ch === "\\") { i += 2; continue; }
        if (ch === inStr) inStr = null;
      } else {
        if (ch === "/" && next === "/") { inCmt = "//"; i++; }
        else if (ch === "/" && next === "*") { inCmt = "/*"; i++; }
        else if (ch === '"' || ch === "'" || ch === "`") inStr = ch;
        else if (ch === "[") depth++;
        else if (ch === "]") {
          depth--;
          if (depth === 0) {
            parents[name] = parseEntries(body.slice(openBracketIdx, i + 1));
            break;
          }
        }
      }
      i++;
    }
  }
  return parents;
}

const stateSrc = readFile(STATE_PATH);
const TAXONOMY_FIELDS = parseTaxonomyFields(stateSrc);

// Build the same DERIVED_TYPE_FIELDS that the catalog uses + a quick
// lookup index from `<parentId>.<shortId>` → catalog entry.
const DERIVED_TYPE_FIELDS = [];
for (const [parent, fields] of Object.entries(TAXONOMY_FIELDS)) {
  for (const f of fields) {
    DERIVED_TYPE_FIELDS.push({
      id: `${parent}.${f.id}`,
      legacyShortId: f.id,
      kind: f.kind,
      appliesTo: [parent],
    });
  }
}
const ALL_FIELDS = [
  ...HARDCODED_FIELDS,
  ...DERIVED_TYPE_FIELDS,
];

const fieldByKey = new Map(ALL_FIELDS.map(f => [f.id, f]));

// ─── Read source snapshot ──────────────────────────────────────────────

const sourcePath = path.resolve(SOURCE);
if (!fs.existsSync(sourcePath)) {
  console.error(`Source file not found: ${sourcePath}`);
  process.exit(2);
}
const snapshot = JSON.parse(fs.readFileSync(sourcePath, "utf8"));

// ─── Resolve + emit SQL ────────────────────────────────────────────────

function sqlString(s) {
  if (s === null || s === undefined) return "NULL";
  return `'${String(s).replace(/'/g, "''")}'`;
}
function sqlJsonbValue(value, kind) {
  if (kind === "multiselect" || kind === "chips") {
    const arr = Array.isArray(value) ? value : [value];
    return `'${JSON.stringify(arr).replace(/'/g, "''")}'::JSONB`;
  }
  if (kind === "number") {
    const n = Number(value);
    return Number.isFinite(n) ? `'${n}'::JSONB` : `'${JSON.stringify(value)}'::JSONB`;
  }
  if (typeof value === "object") {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'::JSONB`;
  }
  return `'${JSON.stringify(value).replace(/'/g, "''")}'::JSONB`;
}
function sqlVisibilityArray(arr) {
  if (!arr || !Array.isArray(arr) || arr.length === 0) return "NULL";
  return `ARRAY[${arr.map(sqlString).join(", ")}]::TEXT[]`;
}

const out = [];
out.push("-- Backfill talent_profile_field_values from prototype dynFields.");
out.push("-- Re-run safe: ON CONFLICT (talent_profile_id, field_definition_id) DO UPDATE.");
out.push("--");
out.push("-- Source snapshot: " + sourcePath);
out.push("");
out.push("BEGIN;");
out.push("");

let inserted = 0, skipped = 0;
for (const [talentProfileId, profileSnapshot] of Object.entries(snapshot)) {
  const dyn = profileSnapshot.dynFields ?? {};
  const vis = profileSnapshot.dynFieldVisibility ?? {};
  const primary = profileSnapshot.primaryType;
  const secondaries = profileSnapshot.secondaryTypes ?? [];
  const candidateParents = [primary, ...secondaries].filter(Boolean);

  for (const [shortId, value] of Object.entries(dyn)) {
    // Resolve to a catalog field_key by trying each parent.
    let entry = null;
    for (const parent of candidateParents) {
      const candidate = fieldByKey.get(`${parent}.${shortId}`);
      if (candidate) { entry = candidate; break; }
    }
    // Fall back to a top-level catalog entry with the same id.
    if (!entry) {
      entry = fieldByKey.get(shortId) ?? null;
    }
    if (!entry) {
      console.warn(`[skip] no catalog entry for "${shortId}" on talent ${talentProfileId} (parents tried: ${candidateParents.join(", ") || "none"})`);
      skipped++;
      continue;
    }
    if (value === null || value === undefined || value === "") {
      skipped++;
      continue;
    }
    const visibility = vis[shortId];
    out.push(`INSERT INTO public.talent_profile_field_values (
  talent_profile_id, field_definition_id, value, visibility_override, workflow_state, last_edited_role
)
SELECT ${sqlString(talentProfileId)}, pfd.id, ${sqlJsonbValue(value, entry.kind)}, ${sqlVisibilityArray(visibility)}, 'live', 'platform'
  FROM public.profile_field_definitions pfd
 WHERE pfd.field_key = ${sqlString(entry.id)}
ON CONFLICT (talent_profile_id, field_definition_id) DO UPDATE SET
  value = EXCLUDED.value,
  visibility_override = EXCLUDED.visibility_override,
  updated_at = now();
`);
    inserted++;
  }
}

out.push("COMMIT;");
out.push("");
out.push(`-- Generated ${inserted} INSERT statements; skipped ${skipped} keys.`);

const sql = out.join("\n");

if (APPLY) {
  // Defer to scripts/_pg-via-mgmt-api.mjs which knows how to run SQL
  // via Supabase Management API. Wrap the whole thing in a single
  // transaction (already wrapped above with BEGIN/COMMIT).
  const helperPath = path.join(REPO_ROOT, "scripts/_pg-via-mgmt-api.mjs");
  if (!fs.existsSync(helperPath)) {
    console.error(`Helper not found: ${helperPath}. Run with --dry-run output instead.`);
    process.stdout.write(sql);
    process.exit(1);
  }
  // Load + invoke helper.
  const helper = await import(url.pathToFileURL(helperPath).href);
  if (typeof helper.runSQL !== "function") {
    console.error("Helper does not export runSQL(); run with --dry-run instead.");
    process.stdout.write(sql);
    process.exit(1);
  }
  console.log(`Applying ${inserted} field-value inserts to hosted Supabase…`);
  await helper.runSQL(sql);
  console.log(`Applied. ${skipped} keys skipped (no catalog match).`);
} else {
  process.stdout.write(sql);
}
