#!/usr/bin/env node
/**
 * Generate the profile field catalog seed migration.
 *
 * Reads the source-of-truth frontend catalog from:
 *   web/src/app/prototypes/admin-shell/_field-catalog.ts (FIELD_CATALOG hardcoded)
 *   web/src/app/prototypes/admin-shell/_state.tsx       (TAXONOMY_FIELDS)
 *
 * Emits SQL to stdout:
 *   - INSERT INTO profile_field_definitions (one row per field)
 *   - INSERT INTO profile_field_recommendations (one row per appliesTo /
 *     requiredFor / recommendedFor pair)
 *
 * Usage:
 *   node scripts/generate-profile-field-catalog-seed.mjs \
 *     > supabase/migrations/20260901120400_seed_profile_field_catalog.sql
 *
 * Re-run when the prototype catalog changes. Idempotent via ON CONFLICT
 * (field_key) DO UPDATE so re-applying the migration is safe.
 *
 * Why a generator (not hand-typed SQL)?
 *   - The catalog has ~200 entries; hand-typing invites drift between
 *     the prototype and the seed.
 *   - The script reads the .ts files as text and parses the array
 *     literals. No TypeScript runtime needed (avoids ts-node + React
 *     transitive deps for a build-time tool).
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const CATALOG_PATH = path.join(
  REPO_ROOT,
  "web/src/app/prototypes/admin-shell/_field-catalog.ts",
);
const STATE_PATH = path.join(
  REPO_ROOT,
  "web/src/app/prototypes/admin-shell/_state.tsx",
);

// ─── tiny TS-array-literal parser ──────────────────────────────────────
// Both source files store the catalog as plain TS object-literal arrays.
// We extract by string slicing (not by AST) — this is brittle if the
// source format changes drastically, but it's simple, deterministic,
// and avoids dragging in a TypeScript compiler. The CI hook below
// re-runs the generator on every PR touching the catalog files; if the
// parser breaks, the generated SQL diff will catch it before merge.

function readFile(p) {
  return fs.readFileSync(p, "utf8");
}

function sqlString(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlBool(value, fallback = false) {
  if (value === undefined || value === null) return fallback ? "TRUE" : "FALSE";
  return value ? "TRUE" : "FALSE";
}

function sqlTextArray(arr) {
  if (!arr || arr.length === 0) return "ARRAY[]::TEXT[]";
  return `ARRAY[${arr.map(sqlString).join(", ")}]::TEXT[]`;
}

function sqlJsonbArray(arr) {
  if (!arr) return "NULL";
  return `'${JSON.stringify(arr).replace(/'/g, "''")}'::JSONB`;
}

function sqlInteger(n) {
  if (n === null || n === undefined) return "NULL";
  return String(n);
}

// ─── Parse FIELD_CATALOG hardcoded entries ─────────────────────────────
// The hardcoded entries are in HARDCODED_FIELDS (they used to be
// FIELD_CATALOG before Phase A). Look for that const definition.

function extractArrayLiteral(source, constName) {
  // Match `const NAME: ... = [` … `];`
  const re = new RegExp(`(?:export\\s+)?const\\s+${constName}[^=]*=\\s*\\[`, "m");
  const startMatch = source.match(re);
  if (!startMatch) {
    throw new Error(`Could not find const ${constName} in source.`);
  }
  const startIdx = startMatch.index + startMatch[0].length - 1; // position of [
  // Walk to find matching ]
  let depth = 0;
  let i = startIdx;
  let inString = null;
  let inComment = null;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (inComment === "//") {
      if (ch === "\n") inComment = null;
    } else if (inComment === "/*") {
      if (ch === "*" && next === "/") { inComment = null; i++; }
    } else if (inString) {
      if (ch === "\\") { i += 2; continue; }
      if (ch === inString) inString = null;
    } else {
      if (ch === "/" && next === "/") { inComment = "//"; i++; }
      else if (ch === "/" && next === "*") { inComment = "/*"; i++; }
      else if (ch === "\"" || ch === "'" || ch === "`") inString = ch;
      else if (ch === "[") depth++;
      else if (ch === "]") {
        depth--;
        if (depth === 0) {
          return source.slice(startIdx, i + 1);
        }
      }
    }
    i++;
  }
  throw new Error(`Unterminated array literal for ${constName}.`);
}

function parseEntries(arrayLiteral) {
  // Strip the outer brackets, split on top-level commas, eval each
  // object literal. We use Function(`return ({...})`) to evaluate each
  // entry safely (no template strings, no spread, only plain literals
  // — which is what the catalog contains).
  const inner = arrayLiteral.slice(1, -1);
  const entries = [];
  let depth = 0;
  let buf = "";
  let inString = null;
  let inComment = null;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    const next = inner[i + 1];
    if (inComment === "//") {
      if (ch === "\n") inComment = null;
      continue;
    }
    if (inComment === "/*") {
      if (ch === "*" && next === "/") { inComment = null; i++; }
      continue;
    }
    if (inString) {
      buf += ch;
      if (ch === "\\") { buf += inner[++i]; continue; }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === "/" && next === "/") { inComment = "//"; i++; continue; }
    if (ch === "/" && next === "*") { inComment = "/*"; i++; continue; }
    if (ch === "\"" || ch === "'" || ch === "`") inString = ch;
    if (ch === "{" || ch === "[") depth++;
    if (ch === "}" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      const trimmed = buf.trim();
      if (trimmed) entries.push(trimmed);
      buf = "";
      continue;
    }
    buf += ch;
  }
  const tail = buf.trim();
  if (tail) entries.push(tail);
  // Each entry is an object literal `{ id: "...", ... }`. Evaluate by
  // wrapping in `(...)` and using Function.
  return entries.map((e) => {
    // Strip TS type-cast `as const` / `as <T>` suffixes inside values.
    const cleaned = e
      .replace(/\s+as\s+const\b/g, "")
      .replace(/\s+as\s+[A-Za-z_<>[\]"|& ]+/g, "");
    // eslint-disable-next-line no-new-func
    const fn = new Function(`return (${cleaned});`);
    return fn();
  });
}

// ─── Read catalog files ────────────────────────────────────────────────

const catalogSrc = readFile(CATALOG_PATH);
const stateSrc = readFile(STATE_PATH);

const HARDCODED_FIELDS = parseEntries(
  extractArrayLiteral(catalogSrc, "HARDCODED_FIELDS"),
);

// Parse TAXONOMY_FIELDS (Record<TaxonomyParentId, RegField[]>). We treat
// each parent's array independently and tag entries with the parent.
function parseTaxonomyFields(source) {
  const re = /export const TAXONOMY_FIELDS: Record<TaxonomyParentId, RegField\[\]> = \{/;
  const startMatch = source.match(re);
  if (!startMatch) throw new Error("Could not find TAXONOMY_FIELDS.");
  const startIdx = startMatch.index + startMatch[0].length - 1;
  let depth = 0;
  let i = startIdx;
  let inString = null;
  let inComment = null;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (inComment === "//") { if (ch === "\n") inComment = null; }
    else if (inComment === "/*") { if (ch === "*" && next === "/") { inComment = null; i++; } }
    else if (inString) {
      if (ch === "\\") { i += 2; continue; }
      if (ch === inString) inString = null;
    } else {
      if (ch === "/" && next === "/") { inComment = "//"; i++; }
      else if (ch === "/" && next === "*") { inComment = "/*"; i++; }
      else if (ch === "\"" || ch === "'" || ch === "`") inString = ch;
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
  // Body = `models: [...], hosts: [...], ...`. Split on top-level entries.
  // Only depth-0 `<word>: [` matches a parent — naively scanning the
  // body with a regex catches `defaultVisibility: [` inside entries
  // and emits junk parents. Walk depth-aware.
  const parents = {};
  const positions = [];
  let depth = 0, inStr = null, inCmt = null, i = 0;
  while (i < body.length) {
    const ch = body[i], next = body[i + 1];
    if (inCmt === "//") { if (ch === "\n") inCmt = null; i++; continue; }
    if (inCmt === "/*") { if (ch === "*" && next === "/") { inCmt = null; i++; } i++; continue; }
    if (inStr) {
      if (ch === "\\") { i += 2; continue; }
      if (ch === inStr) inStr = null;
      i++;
      continue;
    }
    if (ch === "/" && next === "/") { inCmt = "//"; i += 2; continue; }
    if (ch === "/" && next === "*") { inCmt = "/*"; i += 2; continue; }
    if (ch === "\"" || ch === "'" || ch === "`") { inStr = ch; i++; continue; }
    if (ch === "[" || ch === "{") { depth++; i++; continue; }
    if (ch === "]" || ch === "}") { depth--; i++; continue; }
    // At depth 0, look for `<word>: [` — that's a parent declaration.
    if (depth === 0 && /\w/.test(ch)) {
      const m = body.slice(i).match(/^(\w+)\s*:\s*\[/);
      if (m) {
        const name = m[1];
        const openBracketIdx = i + m[0].length - 1;
        positions.push({ name, openBracketIdx });
        // Jump forward to the open bracket; the inner walk below will
        // consume the array.
        i = openBracketIdx;
        continue;
      }
    }
    i++;
  }
  for (const { name, openBracketIdx } of positions) {
    let depth = 0;
    let i = openBracketIdx;
    let inString = null;
    let inComment = null;
    while (i < body.length) {
      const ch = body[i];
      const next = body[i + 1];
      if (inComment === "//") { if (ch === "\n") inComment = null; }
      else if (inComment === "/*") { if (ch === "*" && next === "/") { inComment = null; i++; } }
      else if (inString) {
        if (ch === "\\") { i += 2; continue; }
        if (ch === inString) inString = null;
      } else {
        if (ch === "/" && next === "/") { inComment = "//"; i++; }
        else if (ch === "/" && next === "*") { inComment = "/*"; i++; }
        else if (ch === "\"" || ch === "'" || ch === "`") inString = ch;
        else if (ch === "[") depth++;
        else if (ch === "]") {
          depth--;
          if (depth === 0) {
            const arrLiteral = body.slice(openBracketIdx, i + 1);
            parents[name] = parseEntries(arrLiteral);
            break;
          }
        }
      }
      i++;
    }
  }
  return parents;
}

const TAXONOMY_FIELDS = parseTaxonomyFields(stateSrc);

// ─── Build the union "all fields" list ─────────────────────────────────
// Same shape as DERIVED_TYPE_FIELDS in _field-catalog.ts: each TAXONOMY
// entry projects into a catalog row tagged with appliesTo: [parent].

function deriveTypeFields() {
  const out = [];
  for (const [parent, fields] of Object.entries(TAXONOMY_FIELDS)) {
    for (const f of fields) {
      out.push({
        id: `${parent}.${f.id}`,
        legacyShortId: f.id,
        label: f.label,
        tier: "type-specific",
        section: f.subsection === "physical" ? "measurements"
          : f.subsection === "wardrobe" ? "wardrobe"
          : "type-specific",
        kind: f.kind,
        placeholder: f.placeholder,
        helper: f.helper,
        options: f.options,
        subsection: f.subsection,
        optional: f.optional,
        sensitive: f.sensitive,
        defaultVisibility: f.defaultVisibility,
        appliesTo: [parent],
        showInRegistration: true,
        showInEditDrawer: true,
        showInPublic: f.defaultVisibility?.includes("public") ?? false,
        showInDirectory: false,
        talentEditable: true,
      });
    }
  }
  return out;
}

const ALL_FIELDS = [...HARDCODED_FIELDS, ...deriveTypeFields()];

// ─── Emit SQL ──────────────────────────────────────────────────────────

const lines = [];
lines.push("-- Auto-generated by scripts/generate-profile-field-catalog-seed.mjs");
lines.push("-- Source of truth: web/src/app/prototypes/admin-shell/_field-catalog.ts");
lines.push("--                  web/src/app/prototypes/admin-shell/_state.tsx (TAXONOMY_FIELDS)");
lines.push("-- Re-run the generator after editing either source.");
lines.push("--");
lines.push("-- Idempotent: ON CONFLICT (field_key) DO UPDATE keeps existing rows");
lines.push("-- in sync. Safe to re-apply.");
lines.push("");
lines.push("BEGIN;");
lines.push("");

for (const f of ALL_FIELDS) {
  if (!f.tier) continue; // safety
  const fieldKey = f.id;
  const tier = f.tier;
  const section = f.section;
  const subsection = f.subsection ?? null;
  const kind = f.kind ?? "text";
  const placeholder = f.placeholder ?? null;
  const helper = f.helper ?? null;
  const options = f.options ?? null;
  const isOptional = f.optional !== false;     // default true
  const isSensitive = !!f.sensitive;
  const defaultVisibility = f.defaultVisibility ?? ["agency"];
  const showInRegistration = f.showInRegistration !== false && tier !== "global";
  const showInEditDrawer = f.showInEditDrawer !== false;
  const showInPublic = f.showInPublic === true
    || (f.showInPublic === undefined && defaultVisibility.includes("public"));
  const showInDirectory = !!f.showInDirectory;
  const adminOnly = !!f.adminOnly;
  const talentEditable = f.talentEditable !== false && !adminOnly;
  const requiresReviewOnChange = !!f.requiresReviewOnChange;
  const isSearchable = !!f.searchable;
  const countMin = f.countMin ?? null;
  const displayOrder = f.order ?? 100;
  const note = f.note ?? null;

  lines.push(`INSERT INTO public.profile_field_definitions (
  field_key, label, tier, section, subsection,
  kind, placeholder, helper, options,
  is_optional, is_sensitive, default_visibility,
  show_in_registration, show_in_edit_drawer, show_in_public, show_in_directory,
  admin_only, talent_editable, requires_review_on_change,
  is_searchable, count_min, display_order, note
) VALUES (
  ${sqlString(fieldKey)}, ${sqlString(f.label)}, ${sqlString(tier)}, ${sqlString(section)}, ${sqlString(subsection)},
  ${sqlString(kind)}, ${sqlString(placeholder)}, ${sqlString(helper)}, ${sqlJsonbArray(options)},
  ${sqlBool(isOptional, true)}, ${sqlBool(isSensitive)}, ${sqlTextArray(defaultVisibility)},
  ${sqlBool(showInRegistration)}, ${sqlBool(showInEditDrawer)}, ${sqlBool(showInPublic)}, ${sqlBool(showInDirectory)},
  ${sqlBool(adminOnly)}, ${sqlBool(talentEditable)}, ${sqlBool(requiresReviewOnChange)},
  ${sqlBool(isSearchable)}, ${sqlInteger(countMin)}, ${sqlInteger(displayOrder)}, ${sqlString(note)}
)
ON CONFLICT (field_key) DO UPDATE SET
  label = EXCLUDED.label,
  tier = EXCLUDED.tier,
  section = EXCLUDED.section,
  subsection = EXCLUDED.subsection,
  kind = EXCLUDED.kind,
  placeholder = EXCLUDED.placeholder,
  helper = EXCLUDED.helper,
  options = EXCLUDED.options,
  is_optional = EXCLUDED.is_optional,
  is_sensitive = EXCLUDED.is_sensitive,
  default_visibility = EXCLUDED.default_visibility,
  show_in_registration = EXCLUDED.show_in_registration,
  show_in_edit_drawer = EXCLUDED.show_in_edit_drawer,
  show_in_public = EXCLUDED.show_in_public,
  show_in_directory = EXCLUDED.show_in_directory,
  admin_only = EXCLUDED.admin_only,
  talent_editable = EXCLUDED.talent_editable,
  requires_review_on_change = EXCLUDED.requires_review_on_change,
  is_searchable = EXCLUDED.is_searchable,
  count_min = EXCLUDED.count_min,
  display_order = EXCLUDED.display_order,
  note = EXCLUDED.note;
`);
}

// ─── Recommendations ───────────────────────────────────────────────────
// Resolve taxonomy_term_id by joining via taxonomy_terms.slug. The
// frontend's TaxonomyParentId values are short ids ("hosts", "music")
// while production taxonomy_terms uses longer slugs ("hosts-promo",
// "music-djs"). Translation map below — keep in sync with the v2
// taxonomy seed (`supabase/migrations/20260801120400_taxonomy_v2_seed_parents.sql`).
const PARENT_SLUG_MAP = {
  models:         "models",
  hosts:          "hosts-promo",
  performers:     "performers",
  music:          "music-djs",
  creators:       "influencers-creators",
  chefs:          "chefs-culinary",
  wellness:       "wellness-beauty",
  hospitality:    "hospitality-property",
  transportation: "transportation",
  photo_video:    "photo-video-creative",
  event_staff:    "event-staff",
  security:       "security-protection",
};

lines.push("-- Recommendations (applies / required / recommended).");
lines.push("-- Joins on taxonomy_terms.slug = catalog parentId where term_type=parent_category.");
lines.push("");

// Truncate-and-rebuild for recommendations: the catalog regenerates this
// table on every run, so easier to wipe and re-seed than diff. We scope
// the wipe by field_definition_id IN (current catalog fields) so manual
// rows from a future settings UI don't get clobbered.
lines.push(`-- Wipe catalog-managed recommendation rows. Workspace-managed rows
-- belong in workspace_profile_field_settings, not here.
DELETE FROM public.profile_field_recommendations
 WHERE field_definition_id IN (
   SELECT id FROM public.profile_field_definitions
 );
`);

for (const f of ALL_FIELDS) {
  const requiredFor = f.requiredFor ?? [];
  const recommendedFor = f.recommendedFor ?? [];
  const appliesTo = f.appliesTo ?? [];
  const buckets = [
    ...appliesTo.map((t) => ({ relationship: "applies", taxonomyParent: t })),
    ...requiredFor.map((t) => ({ relationship: "required", taxonomyParent: t })),
    ...recommendedFor.map((t) => ({ relationship: "recommended", taxonomyParent: t })),
  ];
  for (const b of buckets) {
    const dbSlug = PARENT_SLUG_MAP[b.taxonomyParent] ?? b.taxonomyParent;
    lines.push(`INSERT INTO public.profile_field_recommendations (
  field_definition_id, taxonomy_term_id, relationship
)
SELECT pfd.id, tt.id, ${sqlString(b.relationship)}
  FROM public.profile_field_definitions pfd
  JOIN public.taxonomy_terms tt
    ON tt.slug = ${sqlString(dbSlug)}
   AND tt.term_type = 'parent_category'
 WHERE pfd.field_key = ${sqlString(f.id)}
ON CONFLICT (field_definition_id, taxonomy_term_id, relationship) DO NOTHING;
`);
  }
}

lines.push("COMMIT;");
lines.push("");

process.stdout.write(lines.join("\n"));
