import assert from "node:assert/strict";
import { test } from "node:test";

import {
  countOwnerPublishBlockers,
  finalizeOwnerPreflightIssues,
  messageContainsInternalPublishTerms,
  type OwnerPreflightIssue,
} from "./publish-preflight-owner-filter";
import { BRAND_IDENTITY_MESSAGE } from "./publish-preflight-brand-identity";

test("internal terms: snapshot / policy / locale / legacy never pass the owner filter", () => {
  assert.equal(
    messageContainsInternalPublishTerms(
      "Missing published homepage snapshot for locale: es. (Free publish policy)",
    ),
    true,
  );
  assert.equal(messageContainsInternalPublishTerms("Show 0 legacy sections"), true);
  assert.equal(
    messageContainsInternalPublishTerms("Your page needs a main title."),
    false,
  );
});

test("TUL-524: seeded first-publish wall issues become 0 owner blockers", () => {
  const wall: OwnerPreflightIssue[] = [
    {
      severity: "error",
      category: "brand_identity",
      message: BRAND_IDENTITY_MESSAGE,
    },
    {
      severity: "warn",
      category: "seo",
      message:
        "Missing published homepage snapshot for locale: es. (Free publish policy)",
    },
    {
      severity: "warn",
      category: "seo",
      message: "Missing published homepage snapshot for locales: es, en.",
    },
  ];
  assert.equal(countOwnerPublishBlockers(wall, "free"), 0);
  const finalized = finalizeOwnerPreflightIssues(wall, "free");
  assert.equal(finalized.length, 1);
  assert.equal(finalized[0]?.category, "brand_identity");
  assert.equal(finalized[0]?.severity, "warn");
  for (const issue of finalized) {
    assert.equal(messageContainsInternalPublishTerms(issue.message), false);
  }
});

test("free plan still promotes real link integrity gaps without policy jargon", () => {
  const issues: OwnerPreflightIssue[] = [
    {
      severity: "warn",
      category: "link_integrity",
      message: "A button points to a page that does not exist.",
    },
  ];
  const finalized = finalizeOwnerPreflightIssues(issues, "free");
  assert.equal(finalized.length, 1);
  assert.equal(finalized[0]?.severity, "error");
  assert.equal(messageContainsInternalPublishTerms(finalized[0]!.message), false);
});

test("seo warns stay advisory on free (no Free publish policy promotion)", () => {
  const issues: OwnerPreflightIssue[] = [
    {
      severity: "warn",
      category: "seo",
      message: "Add a short page description so search results look complete.",
    },
  ];
  const finalized = finalizeOwnerPreflightIssues(issues, "free");
  assert.equal(finalized[0]?.severity, "warn");
  assert.doesNotMatch(finalized[0]!.message, /policy/i);
});
