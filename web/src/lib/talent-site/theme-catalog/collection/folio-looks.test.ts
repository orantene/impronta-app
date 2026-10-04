/**
 * Folio Look layer: stone / light / dark stay Look-owned (no derived tokens).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { validateLook } from "../validate";
import {
  COLLECTION_DEFAULT_LOOK,
  FOLIO_BUILTIN_LOOKS,
  folioLookTokensFromCode,
} from "./folio-looks";

test("every Folio Look validates", () => {
  for (const look of FOLIO_BUILTIN_LOOKS) {
    const check = validateLook(look.buildPayload());
    assert.deepEqual(check.errors, [], look.slug);
    assert.equal(check.ok, true, look.slug);
  }
});

test("folioLookTokensFromCode resolves stone and rejects unknown", () => {
  assert.equal(COLLECTION_DEFAULT_LOOK.folio, "folio-stone");
  const stone = folioLookTokensFromCode("folio-stone");
  assert.ok(stone);
  // Authored Folio stone palette override (Mateo warm sand), not the code default #ECEAE5.
  assert.equal(stone!["color.background"], "#ECEAE5");
  assert.equal(folioLookTokensFromCode("folio-nope"), null);
});
