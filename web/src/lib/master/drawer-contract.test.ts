import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SHARED_FORM_KINDS,
  initialDrawerState,
  reduceDrawer,
  planAttach,
} from "./drawer-contract";

test("nine shared form kinds", () => {
  assert.equal(SHARED_FORM_KINDS.length, 9);
});

test("attachment failure retries the saved child instead of creating again", () => {
  let state = reduceDrawer(initialDrawerState(), {
    type: "open",
    parentDraftId: "draft-1",
    focusRestore: "#parent-field",
    scrollRestore: 420,
  });
  state = reduceDrawer(state, { type: "child_saved", childId: "child-9" });
  state = reduceDrawer(state, { type: "attach_failed" });
  const plan = planAttach(state);
  assert.deepEqual(plan, { action: "retry_saved_child", childId: "child-9" });
  assert.equal(state.focusRestore, "#parent-field");
  assert.equal(state.scrollRestore, 420);
});
