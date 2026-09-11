import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canCreate,
  exactMatch,
  initialPickerState,
  pickerReducer,
  withOrphan,
  type PickerEvent,
  type PickerOption,
  type PickerState,
} from "./machine";

const ADA: PickerOption = { id: "cus_1", label: "Ada Lovelace", detail: "ada@example.com" };
const GRACE: PickerOption = { id: "cus_2", label: "Grace Hopper" };

function run(events: readonly PickerEvent[], from = initialPickerState("key-1")): PickerState {
  return events.reduce(pickerReducer, from);
}

test("a second create while one is in flight is dropped, not queued", () => {
  const state = run([{ type: "query", query: "Ada" }, { type: "create" }, { type: "create" }]);
  assert.equal(state.status, "creating");
  // The proof that matters is the caller's: `canCreate` is false, so the
  // button is disabled and the second tap never becomes a request.
  assert.equal(canCreate(state), false);
});

test("the idempotency key survives a failed create and its retry", () => {
  // This is the guarantee that makes create-once true at the SERVER, which is
  // the only place it can be true. A key regenerated per attempt turns a
  // network retry into a second row.
  const state = run([
    { type: "query", query: "Ada" },
    { type: "create" },
    { type: "create_failed", error: "network" },
    { type: "create" },
  ]);
  assert.equal(state.createKey, "key-1");
  assert.equal(state.status, "creating");
});

test("re-opening the picker mints a new key and forgets the orphan", () => {
  const orphaned = run([
    { type: "query", query: "Ada" },
    { type: "create" },
    { type: "created", option: ADA },
    { type: "attach_failed", error: "network" },
  ]);
  assert.deepEqual(orphaned.orphan, ADA);
  const reopened = pickerReducer(orphaned, { type: "open", createKey: "key-2" });
  assert.equal(reopened.createKey, "key-2");
  assert.equal(reopened.orphan, null, "an orphan is only meaningful inside its own session");
});

test("created is not attached — the created object is never silently selected", () => {
  const state = run([
    { type: "query", query: "Ada" },
    { type: "create" },
    { type: "created", option: ADA },
  ]);
  assert.equal(state.selected, null, "creating must not stand in for attaching");
  assert.equal(state.status, "attaching");
  assert.deepEqual(state.orphan, ADA);
});

test("a created-but-unattached object is found again on the next search", () => {
  // The blueprint clause, literally: create succeeds, attach fails, the server
  // search has not indexed the row yet, and the operator must still see it
  // rather than create a second one.
  const state = run([
    { type: "query", query: "Ada" },
    { type: "create" },
    { type: "created", option: ADA },
    { type: "attach_failed", error: "connection lost" },
    { type: "query", query: "Ada" },
    { type: "results", query: "Ada", results: [GRACE] },
  ]);
  assert.deepEqual(
    state.results.map((option) => option.id),
    ["cus_1", "cus_2"],
    "the orphan comes back first, where the operator is looking",
  );
});

test("the orphan is not duplicated once the search index catches up", () => {
  const state = run([
    { type: "query", query: "Ada" },
    { type: "create" },
    { type: "created", option: ADA },
    { type: "attach_failed", error: "connection lost" },
    { type: "query", query: "Ada" },
    { type: "results", query: "Ada", results: [ADA, GRACE] },
  ]);
  assert.deepEqual(state.results.map((option) => option.id), ["cus_1", "cus_2"]);
});

test("the orphan survives a failed search, which is when it matters most", () => {
  const state = run([
    { type: "query", query: "Ada" },
    { type: "create" },
    { type: "created", option: ADA },
    { type: "attach_failed", error: "connection lost" },
    { type: "query", query: "Ada" },
    { type: "search_failed", query: "Ada", error: "search is down" },
  ]);
  assert.deepEqual(state.results, [ADA]);
  assert.equal(state.error, "search is down");
});

test("attaching clears the orphan, and only attaching does", () => {
  const state = run([
    { type: "query", query: "Ada" },
    { type: "create" },
    { type: "created", option: ADA },
    { type: "attached", option: ADA },
  ]);
  assert.equal(state.orphan, null);
  assert.deepEqual(state.selected, ADA);
  assert.equal(state.status, "ready");
});

test("a stale search result never repaints the list", () => {
  // Type "Ad", type "Adam", then the slow answer to "Ad" arrives.
  const state = run([
    { type: "query", query: "Ad" },
    { type: "query", query: "Adam" },
    { type: "results", query: "Ad", results: [ADA] },
  ]);
  assert.deepEqual(state.results, [], "the answer to a question nobody is asking was dropped");
  assert.equal(state.status, "searching");
});

test("a stale search FAILURE does not surface an error for the current query", () => {
  const state = run([
    { type: "query", query: "Ad" },
    { type: "query", query: "Adam" },
    { type: "search_failed", query: "Ad", error: "timeout" },
  ]);
  assert.equal(state.error, null);
});

test("an attach failure leaves the list usable rather than dropping to an error screen", () => {
  const state = run([
    { type: "query", query: "Ada" },
    { type: "results", query: "Ada", results: [ADA, GRACE] },
    { type: "attach", option: ADA },
    { type: "attach_failed", error: "connection lost" },
  ]);
  assert.equal(state.status, "ready");
  assert.equal(state.error, "connection lost");
  assert.equal(state.results.length, 2, "the operator's next action is the same row again");
});

test("create is refused with an empty query", () => {
  const state = run([{ type: "query", query: "   " }]);
  assert.equal(canCreate(state), false);
});

test("withOrphan is a no-op when there is no orphan", () => {
  assert.deepEqual(withOrphan([ADA], null), [ADA]);
});

test("an exact match is found regardless of case or padding", () => {
  assert.deepEqual(exactMatch([ADA, GRACE], "  ada lovelace "), ADA);
  assert.equal(exactMatch([ADA], "Ada"), null, "a prefix is not an exact match");
  assert.equal(exactMatch([ADA], "   "), null);
});
