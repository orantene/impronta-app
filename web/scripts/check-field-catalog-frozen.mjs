#!/usr/bin/env node
/**
 * check-field-catalog-frozen.mjs — CI guard: field-catalog.ts must not
 * gain new fields without a paired new Supabase migration.
 *
 * ─── How it works ───────────────────────────────────────────────────
 * This script computes a content hash (SHA-256) of the two static field
 * arrays that define the catalog:
 *   - `HARDCODED_FIELDS`  (array literal in `field-catalog.ts`)
 *   - `TAXONOMY_FIELDS`   (object literal in `state/fixtures.ts`)
 *
 * BOTH are extracted as LITERALS, never as whole files. It used to hash the
 * entire normalised `state.tsx` "because state.tsx owns TAXONOMY_FIELDS" —
 * true when it was written, false since the Phase-1b decomposition moved the
 * data into `state/*` and left `state.tsx` a 31-line re-export barrel. The
 * guard was therefore hashing a barrel (protecting nothing on the taxonomy
 * side) while firing on any unrelated re-export added to it. Exactly that
 * happened: #920 added one `applyWorkspaceFieldOverride,` re-export line and
 * the guard went red on main with no field added and no migration owed, which
 * is how it ended up quietly dropped from the CI workflow.
 *
 * The hash is stored in `web/.field-catalog-hash` (committed to git).
 * The guard compares the running hash to the stored hash and exits 1 if
 * they diverge — meaning someone edited the static arrays without
 * updating the hash file.
 *
 * To LEGITIMATELY update the static arrays (extremely rare; new fields
 * should go to SQL):
 *   1. Edit `field-catalog.ts` and/or `state/fixtures.ts`.
 *   2. Write the paired SQL migration in `supabase/migrations/`.
 *   3. Run:  node scripts/check-field-catalog-frozen.mjs --update
 *      This regenerates `.field-catalog-hash`.
 *   4. Commit both the migration AND the updated hash in the same PR.
 *
 * ─── Wire-up ────────────────────────────────────────────────────────
 * This script is called from:
 *   - `npm run check:field-catalog-frozen` (manual)
 *   - `npm run ci` (see package.json)
 *   - `.github/workflows/ci.yml`, as its own step. The workflow runs a CURATED
 *     lane list rather than `npm run ci`, so a guard that lives only in the
 *     `ci` script is a guard nothing runs.
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
const TAXONOMY_PATH = join(
  REPO_ROOT,
  "web/src/components/admin/shell/internal/state/fixtures.ts",
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

// ─── Extract a balanced literal that follows a declaration marker ─────
// Shared by both inputs: walk from the opening bracket counting depth, so
// nested arrays/objects inside the literal are included and everything after
// it (types, helpers, JSDoc, unrelated exports) is excluded. Hashing a whole
// FILE is what made this guard dishonest before; do not go back to it.
function extractLiteral(src, startMarker, open, close, label) {
  const start = src.indexOf(startMarker);
  if (start === -1) {
    throw new Error(
      `Cannot find ${label}. If it was renamed or moved, update this guard ` +
        `to point at the new declaration rather than deleting the check.`,
    );
  }
  let depth = 0;
  for (let i = start + startMarker.length - 1; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close) {
      depth--;
      if (depth === 0) return src.slice(start, i + 1).trim();
    }
  }
  throw new Error(`Mismatched ${open}${close} in ${label}`);
}

function computeHash() {
  const hardcoded = extractHardcodedFields(readFileSync(CATALOG_PATH, "utf8"));
  const taxonomy = extractLiteral(
    readFileSync(TAXONOMY_PATH, "utf8"),
    "export const TAXONOMY_FIELDS: Record<TaxonomyParentId, RegField[]> = {",
    "{",
    "}",
    "TAXONOMY_FIELDS in state/fixtures.ts",
  );
  const h = createHash("sha256");
  h.update("HARDCODED_FIELDS:");
  h.update(hardcoded);
  h.update("\nTAXONOMY_FIELDS:");
  h.update(taxonomy);
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
    "[check-field-catalog-frozen] FAIL: HARDCODED_FIELDS (field-catalog.ts) or\n" +
    "  TAXONOMY_FIELDS (state/fixtures.ts) changed without a paired migration.\n\n" +
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
