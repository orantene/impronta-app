#!/usr/bin/env node
/**
 * check-field-catalog-frozen.mjs — CI guard: field-catalog.ts must not
 * gain new fields without a paired new Supabase migration.
 *
 * ─── How it works ───────────────────────────────────────────────────
 * This script computes a content hash (SHA-256) of the two static arrays
 * in `field-catalog.ts` that define the catalog:
 *   - `HARDCODED_FIELDS` (the array literal between the sentinel comments)
 *   - The re-export of `TAXONOMY_FIELDS` (via `state.tsx` import)
 *
 * Because `state.tsx` owns TAXONOMY_FIELDS we hash both files together.
 *
 * The hash is stored in `web/.field-catalog-hash` (committed to git).
 * The guard compares the running hash to the stored hash and exits 1 if
 * they diverge — meaning someone edited the static arrays without
 * updating the hash file.
 *
 * To LEGITIMATELY update the static arrays (extremely rare; new fields
 * should go to SQL):
 *   1. Edit `field-catalog.ts` and/or `state.tsx`.
 *   2. Write the paired SQL migration in `supabase/migrations/`.
 *   3. Run:  node scripts/check-field-catalog-frozen.mjs --update
 *      This regenerates `.field-catalog-hash`.
 *   4. Commit both the migration AND the updated hash in the same PR.
 *
 * ─── Wire-up ────────────────────────────────────────────────────────
 * This script is called from:
 *   - `npm run check:field-catalog-frozen` (manual)
 *   - `npm run ci` (prepended; see package.json)
 *   - The CI workflow `.github/workflows/ci.yml` via the `ci` script
 *
 * ─── Why not a checksum on the whole file? ──────────────────────────
 * The file also contains type definitions, JSDoc, helper functions, and
 * the localStorage prototype (Phase E). Those change for legitimate
 * reasons. We hash only the data arrays so the guard stays focused on
 * its narrow mandate: detect field additions that skip the DB.
 * ─────────────────────────────────────────────────────────────────────
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const WEB_ROOT = join(HERE, "..");

const CATALOG_PATH = join(
  REPO_ROOT,
  "web/src/components/admin/shell/internal/field-catalog.ts",
);
const STATE_PATH = join(
  REPO_ROOT,
  "web/src/components/admin/shell/internal/state.tsx",
);
const HASH_FILE = join(WEB_ROOT, ".field-catalog-hash");

const UPDATE_MODE = process.argv.includes("--update");

// ─── Extract the HARDCODED_FIELDS array literal from field-catalog.ts ──
// We look for the block starting with:
//   const HARDCODED_FIELDS: ReadonlyArray<FieldCatalogEntry> = [
// and ending at the matching closing `];`
function extractHardcodedFields(src) {
  const startMarker = "const HARDCODED_FIELDS: ReadonlyArray<FieldCatalogEntry> = [";
  const start = src.indexOf(startMarker);
  if (start === -1) throw new Error("Cannot find HARDCODED_FIELDS in field-catalog.ts");
  // Walk forward counting brackets until we find the closing `];`
  let depth = 0;
  let i = start + startMarker.length - 1; // position of opening `[`
  while (i < src.length) {
    if (src[i] === "[") depth++;
    else if (src[i] === "]") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1).trim();
    }
    i++;
  }
  throw new Error("Mismatched brackets in HARDCODED_FIELDS");
}

// ─── Extract TAXONOMY_FIELDS from state.tsx ──────────────────────────
// Looks for the exported const or the object it contains.
// We extract the entire source of state.tsx (it's the import target and
// the schema for all TAXONOMY_FIELDS, which power derived type fields).
// Simpler than parsing nested structures: just hash the full file
// content minus comment lines and blank lines (so whitespace refactors
// don't trip the guard).
function normaliseSource(src) {
  return src
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return t.length > 0 && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

function computeHash() {
  const catalogSrc = readFileSync(CATALOG_PATH, "utf8");
  const stateSrc = readFileSync(STATE_PATH, "utf8");

  // Hash the HARDCODED_FIELDS block + the normalised state.tsx content
  // (which owns TAXONOMY_FIELDS). If either changes meaningfully, the
  // hash diverges.
  const hardcoded = extractHardcodedFields(catalogSrc);
  const stateNorm = normaliseSource(stateSrc);

  const h = createHash("sha256");
  h.update("HARDCODED_FIELDS:");
  h.update(hardcoded);
  h.update("\nSTATE_TAXONOMY:");
  h.update(stateNorm);
  return h.digest("hex");
}

const current = computeHash();

if (UPDATE_MODE) {
  writeFileSync(HASH_FILE, current + "\n", "utf8");
  console.log(`[check-field-catalog-frozen] Hash updated: ${current}`);
  process.exit(0);
}

if (!existsSync(HASH_FILE)) {
  console.error(
    "[check-field-catalog-frozen] ERROR: .field-catalog-hash not found.\n" +
    "  The guard has not been initialised for this repo checkout.\n" +
    "  Run:  node scripts/check-field-catalog-frozen.mjs --update\n" +
    "  then commit the generated .field-catalog-hash file.",
  );
  process.exit(1);
}

const stored = readFileSync(HASH_FILE, "utf8").trim();

if (current !== stored) {
  console.error(
    "[check-field-catalog-frozen] FAIL: HARDCODED_FIELDS / TAXONOMY_FIELDS in field-catalog.ts\n" +
    "  (or state.tsx) changed without a paired migration.\n\n" +
    `  stored hash : ${stored}\n` +
    `  current hash: ${current}\n\n` +
    "  New fields MUST be hand-authored as SQL migrations against\n" +
    "  profile_field_definitions (supabase/migrations/).\n\n" +
    "  If you intentionally updated the static arrays AND wrote a\n" +
    "  paired SQL migration, re-run:\n" +
    "    node scripts/check-field-catalog-frozen.mjs --update\n" +
    "  and commit both the migration AND the updated .field-catalog-hash.",
  );
  process.exit(1);
}

console.log(`[check-field-catalog-frozen] OK (hash: ${current.slice(0, 12)}…)`);
process.exit(0);
