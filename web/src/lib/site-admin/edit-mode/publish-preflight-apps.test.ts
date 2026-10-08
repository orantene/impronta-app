/**
 * TUL-39 — premium apps blocked on publish when the talent lacks Web Office.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { collectAppPreflightIssues } from "./publish-preflight-apps";

const TREE_WITH_NAIL = [
  {
    id: "sec-1",
    kind: "section",
    children: [{ id: "nd-1", kind: "app_nail_designer", props: {} }],
  },
];

const TREE_PLAIN = [
  {
    id: "sec-1",
    kind: "section",
    children: [{ id: "t-1", kind: "text", props: {} }],
  },
];

test("no plan options → no app issues (config stub + skip gate)", () => {
  assert.deepEqual(collectAppPreflightIssues(TREE_WITH_NAIL), []);
  assert.deepEqual(collectAppPreflightIssues(TREE_WITH_NAIL, { canUsePremiumApps: true }), []);
  assert.deepEqual(collectAppPreflightIssues(TREE_WITH_NAIL, { canUsePremiumApps: null }), []);
});

test("free talent with Nail Designer in tree gets a blocking error", () => {
  const issues = collectAppPreflightIssues(TREE_WITH_NAIL, {
    canUsePremiumApps: false,
    locale: "en",
  });
  assert.equal(issues.length, 1);
  assert.equal(issues[0]!.severity, "error");
  assert.equal(issues[0]!.category, "builder_payload");
  assert.equal(issues[0]!.nodeId, "nd-1");
  assert.match(issues[0]!.message, /Nail Designer/);
  assert.match(issues[0]!.message, /Web Office/);
});

test("free talent without premium apps publishes clean", () => {
  assert.deepEqual(
    collectAppPreflightIssues(TREE_PLAIN, { canUsePremiumApps: false }),
    [],
  );
});

test("Spanish locale uses Oficina Web copy", () => {
  const issues = collectAppPreflightIssues(TREE_WITH_NAIL, {
    canUsePremiumApps: false,
    locale: "es",
  });
  assert.match(issues[0]!.message, /Oficina Web/);
});
