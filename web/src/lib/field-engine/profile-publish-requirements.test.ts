import test from "node:test";
import assert from "node:assert/strict";

import {
  isResolvedFieldPublishBlocking,
  type PublishBlockingResolvedField,
} from "@/lib/field-engine/profile-publish-requirements";

function field(
  overrides: Partial<PublishBlockingResolvedField> = {},
): PublishBlockingResolvedField {
  return {
    field_definition_id: "field-1",
    field_key: "performer.act_type",
    label: "Act type",
    is_required: false,
    required_before_publish: false,
    is_admin_only: false,
    default_visibility: ["public", "agency"],
    ...overrides,
  };
}

test("publish requirements: required_before_publish fields block publishing", () => {
  assert.equal(
    isResolvedFieldPublishBlocking(field({ required_before_publish: true })),
    true,
  );
});

test("publish requirements: tenant required_override fields block publishing", () => {
  assert.equal(
    isResolvedFieldPublishBlocking(field({ is_required: true })),
    true,
  );
});

test("publish requirements: admin-only fields never block public publishing", () => {
  assert.equal(
    isResolvedFieldPublishBlocking(field({ is_required: true, is_admin_only: true })),
    false,
  );
});

test("publish requirements: hidden fields never block publishing", () => {
  assert.equal(
    isResolvedFieldPublishBlocking(field({ is_required: true, default_visibility: [] })),
    false,
  );
});

test("publish requirements: optional visible fields do not block publishing", () => {
  assert.equal(isResolvedFieldPublishBlocking(field()), false);
});
