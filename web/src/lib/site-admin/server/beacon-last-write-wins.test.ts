import assert from "node:assert/strict";
import { test } from "node:test";

import { decideBeaconLastWriteWins } from "./beacon-last-write-wins";

// WS1-D — the pagehide draft beacon's last-write-wins decision. The beacon may
// bypass the version CAS only when it is the SAME operator session's STRICTLY-
// NEWER edit, and never when it would clobber good content with an empty tree.

const SESSION_A = "11111111-1111-4111-8111-111111111111";
const SESSION_B = "22222222-2222-4222-8222-222222222222";

test("applies when session matches and seq is strictly greater", () => {
  const decision = decideBeaconLastWriteWins(
    { editSessionId: SESSION_A, draftSeq: 5, storedHasContent: true },
    { editSessionId: SESSION_A, draftSeq: 6, incomingHasContent: true },
  );
  assert.deepEqual(decision, { apply: true });
});

test("applies as the first beacon of a session (stored seq still NULL)", () => {
  const decision = decideBeaconLastWriteWins(
    { editSessionId: SESSION_A, draftSeq: null, storedHasContent: true },
    { editSessionId: SESSION_A, draftSeq: 1, incomingHasContent: true },
  );
  assert.deepEqual(decision, { apply: true });
});

test("rejects a stale seq (equal to stored)", () => {
  const decision = decideBeaconLastWriteWins(
    { editSessionId: SESSION_A, draftSeq: 7, storedHasContent: true },
    { editSessionId: SESSION_A, draftSeq: 7, incomingHasContent: true },
  );
  assert.deepEqual(decision, { apply: false, reason: "STALE_SEQ" });
});

test("rejects a stale seq (lower than stored)", () => {
  const decision = decideBeaconLastWriteWins(
    { editSessionId: SESSION_A, draftSeq: 9, storedHasContent: true },
    { editSessionId: SESSION_A, draftSeq: 4, incomingHasContent: true },
  );
  assert.deepEqual(decision, { apply: false, reason: "STALE_SEQ" });
});

test("rejects a different session even with a newer seq (co-editor)", () => {
  const decision = decideBeaconLastWriteWins(
    { editSessionId: SESSION_A, draftSeq: 5, storedHasContent: true },
    { editSessionId: SESSION_B, draftSeq: 99, incomingHasContent: true },
  );
  assert.deepEqual(decision, { apply: false, reason: "SESSION_MISMATCH" });
});

test("rejects when the stored session is NULL (legacy / pre-WS1-D row)", () => {
  const decision = decideBeaconLastWriteWins(
    { editSessionId: null, draftSeq: null, storedHasContent: true },
    { editSessionId: SESSION_A, draftSeq: 1, incomingHasContent: true },
  );
  assert.deepEqual(decision, { apply: false, reason: "SESSION_MISMATCH" });
});

test("refuses an EMPTY beacon over good stored content (empty-over-good guard)", () => {
  // Even with a matching session and a newer seq, an empty tree must NEVER
  // overwrite a non-empty stored draft (homepage draft empty-load incident).
  const decision = decideBeaconLastWriteWins(
    { editSessionId: SESSION_A, draftSeq: 5, storedHasContent: true },
    { editSessionId: SESSION_A, draftSeq: 6, incomingHasContent: false },
  );
  assert.deepEqual(decision, { apply: false, reason: "EMPTY_OVER_GOOD" });
});

test("allows an empty beacon when the stored draft is ALSO empty (new page)", () => {
  // Nothing good to protect, so an empty-over-empty beacon may apply (it is a
  // no-op-ish save of the same empty state, but the LWW gates still hold).
  const decision = decideBeaconLastWriteWins(
    { editSessionId: SESSION_A, draftSeq: 1, storedHasContent: false },
    { editSessionId: SESSION_A, draftSeq: 2, incomingHasContent: false },
  );
  assert.deepEqual(decision, { apply: true });
});

test("empty-over-good guard wins even over a session mismatch", () => {
  // The empty guard is checked first: an empty beacon is refused regardless of
  // whose session it is, so it can never wipe content under any path.
  const decision = decideBeaconLastWriteWins(
    { editSessionId: SESSION_A, draftSeq: 5, storedHasContent: true },
    { editSessionId: SESSION_B, draftSeq: 99, incomingHasContent: false },
  );
  assert.deepEqual(decision, { apply: false, reason: "EMPTY_OVER_GOOD" });
});
