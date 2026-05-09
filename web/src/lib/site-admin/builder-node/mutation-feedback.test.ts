import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatBuilderNodeMutationError,
  summarizeBuilderNodeIssues,
} from "./mutation-feedback";

test("summarizeBuilderNodeIssues normalizes and limits issue detail rows", () => {
  const details = summarizeBuilderNodeIssues([
    { path: "tree[0].props.layout", message: "Expected grid or stack" },
    { path: "target.parent", message: "Allowed child kinds: heading, paragraph" },
    { path: "target.index", message: "Choose a different destination index." },
    { path: "tree[0].children[1]", message: "Missing required child" },
    { path: "", message: "Unknown field" },
    { path: "tree[1]", message: "Should be trimmed out by max length" },
  ]);

  assert.deepEqual(details, [
    "Builder tree: Expected grid or stack",
    "Target container: Allowed child kinds: heading, paragraph",
    "Destination position: Choose a different destination index.",
  ]);
});

test("summarizeBuilderNodeIssues de-duplicates repeated lines", () => {
  const details = summarizeBuilderNodeIssues([
    { path: "target.parent", message: "Allowed child kinds: heading, paragraph" },
    { path: "target.parent", message: "Allowed child kinds: heading, paragraph" },
    { path: "target.index", message: "Choose a different destination index." },
  ]);

  assert.deepEqual(details, [
    "Target container: Allowed child kinds: heading, paragraph",
    "Destination position: Choose a different destination index.",
  ]);
});

test("summarizeBuilderNodeIssues humanizes patch payload paths", () => {
  const details = summarizeBuilderNodeIssues([
    { path: "target.patch", message: "Adjust at least one field before saving this update." },
  ]);

  assert.deepEqual(details, [
    "Update payload: Adjust at least one field before saving this update.",
  ]);
});

test("formatBuilderNodeMutationError includes operation-specific invalid target guidance", () => {
  const message = formatBuilderNodeMutationError({
    operation: "move",
    code: "INVALID_MOVE_TARGET",
    message: "A node cannot be moved into itself.",
  });

  assert.match(message, /Move blocked/i);
  assert.match(message, /cannot be moved into itself/i);
});

test("formatBuilderNodeMutationError preserves specific no-op move messages", () => {
  const message = formatBuilderNodeMutationError({
    operation: "move",
    code: "INVALID_MOVE_TARGET",
    message: "This block is already at that position.",
    details: ["target.index: Choose a different destination index."],
  });

  assert.match(message, /already at that position/i);
  assert.match(message, /Details:/i);
});

test("formatBuilderNodeMutationError appends schema mismatch details", () => {
  const message = formatBuilderNodeMutationError({
    operation: "patch",
    code: "VALIDATION_FAILED",
    message: "Validation failed.",
    details: [
      "tree[0].props.columns: Expected number",
      "tree[0].children[1]: Missing id",
    ],
  });

  assert.match(message, /Schema mismatch detected/i);
  assert.match(message, /Details:/i);
  assert.match(message, /tree\[0\]\.props\.columns: Expected number/i);
});

test("formatBuilderNodeMutationError keeps guarded-node message intact", () => {
  const guarded = "Your current plan cannot edit site shell blocks.";
  const message = formatBuilderNodeMutationError({
    operation: "remove",
    code: "GUARDED_NODE",
    message: guarded,
  });

  assert.equal(message, guarded);
});

test("formatBuilderNodeMutationError appends target details for child-kind rejections", () => {
  const message = formatBuilderNodeMutationError({
    operation: "insert",
    code: "CHILD_KIND_NOT_ALLOWED",
    message: "Blocked.",
    details: ['target.parent: Allowed child kinds: heading, paragraph, button.'],
  });

  assert.match(message, /Invalid target/i);
  assert.match(message, /Details:/i);
  assert.match(message, /Allowed child kinds: heading, paragraph, button/i);
});

test("formatBuilderNodeMutationError appends source details for missing-node errors", () => {
  const message = formatBuilderNodeMutationError({
    operation: "remove",
    code: "NODE_NOT_FOUND",
    message: "Not found.",
    details: ['source.nodeId: Missing node id "hero-1". Refresh and retry.'],
  });

  assert.match(message, /no longer exists/i);
  assert.match(message, /Details:/i);
  assert.match(message, /Missing node id "hero-1"/i);
});
