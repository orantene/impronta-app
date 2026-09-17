import assert from "node:assert/strict";
import { test } from "node:test";

import { duplicateHint } from "./duplicates";

const OPEN_MATCH = { customerId: "c-1", hasOpenConversation: true };
const CLOSED_MATCH = { customerId: "c-2", hasOpenConversation: false };
const NEW_MATCH = { customerId: null, hasOpenConversation: true };

test("shows the pill when identity is uncertain (none) and a match has an open conversation", () => {
  assert.equal(duplicateHint({ identityLevel: "none" }, [OPEN_MATCH]), true);
});

test("shows the pill when identity is uncertain (linked, not yet confirmed) too", () => {
  assert.equal(duplicateHint({ identityLevel: "linked" }, [OPEN_MATCH]), true);
});

test("never shows once identity is confirmed or granted, regardless of matches", () => {
  assert.equal(duplicateHint({ identityLevel: "confirmed" }, [OPEN_MATCH]), false);
  assert.equal(duplicateHint({ identityLevel: "granted" }, [OPEN_MATCH]), false);
});

test("no pill with no matches, or matches that are not real customers, or not open", () => {
  assert.equal(duplicateHint({ identityLevel: "none" }, []), false);
  assert.equal(duplicateHint({ identityLevel: "none" }, [NEW_MATCH]), false);
  assert.equal(duplicateHint({ identityLevel: "none" }, [CLOSED_MATCH]), false);
});

test("one open match among several is enough", () => {
  assert.equal(duplicateHint({ identityLevel: "none" }, [CLOSED_MATCH, OPEN_MATCH]), true);
});
