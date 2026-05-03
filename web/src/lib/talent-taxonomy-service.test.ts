import test from "node:test";
import assert from "node:assert/strict";

import { defaultRelationshipForTerm } from "@/lib/talent-taxonomy-service";

test("defaultRelationshipForTerm: v2 term_type drives mapping", () => {
  // talent_type term → primary_role by default (caller can downgrade explicitly)
  assert.equal(defaultRelationshipForTerm("talent_type", "talent_type"), "primary_role");
  assert.equal(defaultRelationshipForTerm("specialty", "tag"), "specialty");
  assert.equal(defaultRelationshipForTerm("skill", "skill"), "skill");
  assert.equal(defaultRelationshipForTerm("context", "event_type"), "context");
  assert.equal(defaultRelationshipForTerm("credential", "tag"), "credential");
  assert.equal(defaultRelationshipForTerm("attribute", "tag"), "attribute");
  // Transitional language assignments (pre-talent_languages migration) bucket as attribute.
  assert.equal(defaultRelationshipForTerm("language", "language"), "attribute");
});

test("defaultRelationshipForTerm: legacy rows fall back to kind", () => {
  // term_type=null and kind drives the choice for legacy data.
  assert.equal(defaultRelationshipForTerm(null, "talent_type"), "primary_role");
  assert.equal(defaultRelationshipForTerm(null, "skill"), "skill");
  assert.equal(defaultRelationshipForTerm(null, "event_type"), "context");
  assert.equal(defaultRelationshipForTerm(null, "industry"), "context");
  assert.equal(defaultRelationshipForTerm(null, "tag"), "attribute");
  assert.equal(defaultRelationshipForTerm(null, "fit_label"), "attribute");
});
