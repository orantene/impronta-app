import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * An ON CONFLICT target must name an index that EXISTS.
 *
 * `talent_profile_taxonomy` has a two-column primary key
 * (talent_profile_id, taxonomy_term_id). The roster drawer's term assignment
 * named three columns — adding relationship_type — and no index covers that
 * triple, so PostgREST's inference failed 42P10 on every call and assigning a
 * taxonomy term from that drawer had never worked. Probed through the real
 * client: the three-column target returns 42P10, the two-column target gets past
 * inference and reaches the term's own validation trigger.
 *
 * THE PRODUCT RULE THIS PINS: one row per term per profile, with
 * relationship_type a mutable attribute of that row. Re-assigning a term under a
 * new relationship MOVES it rather than adding a second copy. That is already
 * how the surrounding code behaves — assigning a primary_role deletes the
 * profile's existing primary_role rows first — and what
 * `ux_talent_profile_taxonomy_one_primary` enforces.
 *
 * Note for anyone tempted to check this against the data: "no term appears
 * twice" is true BY CONSTRUCTION because the PK says so, so row counts cannot
 * be evidence either way. The behaviour is the evidence.
 */

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..", "..", "app", "(workspace)", "[tenantSlug]", "admin", "roster", "[id]", "extended-actions.ts");

const src = readFileSync(SRC, "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

test("taxonomy upsert targets the two-column primary key, not a three-column triple", () => {
  assert.doesNotMatch(
    src,
    /onConflict:\s*["'`][^"'`]*relationship_type[^"'`]*["'`]/,
    "no index covers (talent_profile_id, taxonomy_term_id, relationship_type); " +
      "a conflict target naming it returns 42P10 for every row",
  );
  assert.match(
    src,
    /onConflict:\s*["'`]talent_profile_id,taxonomy_term_id["'`]/,
  );
});
