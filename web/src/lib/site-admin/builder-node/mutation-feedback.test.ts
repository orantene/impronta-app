import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatBuilderNodeMutationError,
  summarizeBuilderNodeIssues,
} from "./mutation-feedback";

test("summarizeBuilderNodeIssues normalizes and limits issue detail rows", () => {
  const details = summarizeBuilderNodeIssues([
    { path: "tree[0].props.layout", message: "Expected grid or stack" },
    { path: "tree[0].children[1]", message: "Missing required child" },
    { path: "", message: "Unknown field" },
    { path: "tree[1]", message: "Should be trimmed out by max length" },
  ]);

  assert.deepEqual(details, [
    "tree[0].props.layout: Expected grid or stack",
    "tree[0].children[1]: Missing required child",
    "Unknown field",
  ]);
});

test("formatBuilderNodeMutationError includes operation-specific invalid target guidance", () => {
  const message = formatBuilderNodeMutationError({
    operation: "move",
    code: "INVALID_MOVE_TARGET",
    message: "Move failed.",
  });

  assert.match(message, /Move blocked/i);
  assert.match(message, /Invalid move target/i);
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
