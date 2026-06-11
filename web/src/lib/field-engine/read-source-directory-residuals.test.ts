// read-source-directory-residuals.test.ts
//
// T2.5a — unit tests for the two NEW directory read-source surfaces
// (`directory_search`, `directory_card_values`) and the dropped redundant
// taxonomy read.
//
// Pure / config-level only (no DB). DB-level parity is proven by the harness +
// the per-residual evidence tables in the PR body:
//   • #1 search: A-vs-B id-set 0/0 symmetric diff on 8 attribute-value queries
//     for the bridged keys. T2.6 repointed the 3 social keys from A → B via the
//     canonical creator.* handles; full-search id-set parity is identical on all
//     name/handle queries (URL-text-only diffs are non-meaningful artifacts).
//   • #2 card values: A field_values scalar rows for the card defs == 0; the
//     bridged-scalar projection is proven 69/69 normalized-equal on body_type.
//   • #3 taxonomy: field_values.value_taxonomy_ids empty across all 1188 rows →
//     dropped (not repointed).
//
// Run:
//   npx tsx --test src/lib/field-engine/read-source-directory-residuals.test.ts
// Wired into `npm run test:fields` (→ `ci`).

import test from "node:test";
import assert from "node:assert/strict";

import {
  parseFieldEngineReadSourceFlags,
  readSourceForSurface,
  FIELD_ENGINE_READ_SURFACES,
} from "@/lib/field-engine/read-source-types";
import { DIRECTORY_SEARCH_SOCIAL_A_TO_B_KEY } from "@/lib/field-engine/read-source-directory-search";
import { OLD_TO_NEW_KEY } from "@/lib/fields/legacy-mirror";

// ── Surface registration + default ───────────────────────────────────────────

test("both new surfaces are registered and default to System B", () => {
  assert.ok(FIELD_ENGINE_READ_SURFACES.includes("directory_search"));
  assert.ok(FIELD_ENGINE_READ_SURFACES.includes("directory_card_values"));
  const flags = parseFieldEngineReadSourceFlags(undefined);
  assert.equal(readSourceForSurface(flags, "directory_search"), "b");
  assert.equal(readSourceForSurface(flags, "directory_card_values"), "b");
});

test("per-surface kill switch reverts just one new surface to A", () => {
  const f1 = parseFieldEngineReadSourceFlags("directory_search:a");
  assert.equal(readSourceForSurface(f1, "directory_search"), "a");
  // others keep their default
  assert.equal(readSourceForSurface(f1, "directory_card_values"), "b");
  assert.equal(readSourceForSurface(f1, "directory_facets"), "b");

  const f2 = parseFieldEngineReadSourceFlags("directory_card_values:a");
  assert.equal(readSourceForSurface(f2, "directory_card_values"), "a");
  assert.equal(readSourceForSurface(f2, "directory_search"), "b");
});

test("global kill switch (=a) reverts both new surfaces to A", () => {
  const flags = parseFieldEngineReadSourceFlags("a");
  assert.equal(readSourceForSurface(flags, "directory_search"), "a");
  assert.equal(readSourceForSurface(flags, "directory_card_values"), "a");
});

// ── #1 search coverage bridge ────────────────────────────────────────────────

test("the 3 social search keys repoint to canonical System B creator.* handles", () => {
  // T2.6: these keys are NOT in the generic A→B key bridge (B uses a different
  // key — handle vs URL), so the B-reader resolves them via the dedicated social
  // map instead. After this repoint the search reader has ZERO System-A reads.
  const expected: Record<string, string> = {
    instagram_url: "creator.instagram_handle",
    tiktok_url: "creator.tiktok_handle",
    youtube_url: "creator.youtube_channel",
  };
  for (const [aKey, bKey] of Object.entries(expected)) {
    assert.equal(DIRECTORY_SEARCH_SOCIAL_A_TO_B_KEY[aKey], bKey, `${aKey} → ${bKey}`);
    assert.equal(OLD_TO_NEW_KEY[aKey], undefined, `${aKey} must not be in the generic bridge`);
  }
});

test("the bridged searchable keys DO resolve through the A→B key bridge", () => {
  // A representative sample of the 13 bridged searchable keys must map to a B
  // field_key (so the B-reader reads them from canonical System B).
  const bridged = [
    "body_type",
    "eye_color",
    "hair_color",
    "experience_level",
    "availability_status",
    "travel_scope",
    "website_url",
  ];
  for (const k of bridged) {
    assert.ok(
      typeof OLD_TO_NEW_KEY[k] === "string" && OLD_TO_NEW_KEY[k].length > 0,
      `${k} must bridge to a B field_key`,
    );
  }
});
