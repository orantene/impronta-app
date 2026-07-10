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

// ── W1-L2 — same-session SAVE ADOPTION (conflict classification) ────────────
//
// The save/publish CAS lane reuses the beacon's decision to classify a
// stale-`expectedVersion` write: SAME-SESSION-RELOAD (the editor's own pagehide
// beacon bumped the version during its reload → adopt) vs GENUINE-FOREIGN-
// CHANGE (another tab / co-editor / unstamped writer → hard conflict).

import {
  decideSameSessionSaveAdoption,
  isSameSessionNewerWrite,
} from "./beacon-last-write-wins";

test("adoption: same-session reload (same token, newer seq) is ADOPTED", () => {
  const decision = decideSameSessionSaveAdoption(
    { editSessionId: SESSION_A, draftSeq: 10, storedHasContent: true },
    { editSessionId: SESSION_A, draftSeq: 11, incomingHasContent: true },
  );
  assert.deepEqual(decision, { apply: true });
});

test("adoption: a genuine second tab (different token) stays a HARD conflict", () => {
  const decision = decideSameSessionSaveAdoption(
    { editSessionId: SESSION_B, draftSeq: 10, storedHasContent: true },
    { editSessionId: SESSION_A, draftSeq: 11, incomingHasContent: true },
  );
  assert.deepEqual(decision, { apply: false, reason: "SESSION_MISMATCH" });
});

test("adoption: an unstamped last writer (NULL stored token) stays a HARD conflict", () => {
  // Publish / restore / composer writes clear the stamps; adoption must never
  // ride over them (#310-class draft-integrity guard).
  const decision = decideSameSessionSaveAdoption(
    { editSessionId: null, draftSeq: null, storedHasContent: true },
    { editSessionId: SESSION_A, draftSeq: 11, incomingHasContent: true },
  );
  assert.deepEqual(decision, { apply: false, reason: "SESSION_MISMATCH" });
});

test("adoption: a stale replay (seq not strictly newer) is refused", () => {
  const decision = decideSameSessionSaveAdoption(
    { editSessionId: SESSION_A, draftSeq: 11, storedHasContent: true },
    { editSessionId: SESSION_A, draftSeq: 11, incomingHasContent: true },
  );
  assert.deepEqual(decision, { apply: false, reason: "STALE_SEQ" });
});

test("adoption: an EMPTY incoming tree never adopts over good stored content", () => {
  const decision = decideSameSessionSaveAdoption(
    { editSessionId: SESSION_A, draftSeq: 10, storedHasContent: true },
    { editSessionId: SESSION_A, draftSeq: 11, incomingHasContent: false },
  );
  assert.deepEqual(decision, { apply: false, reason: "EMPTY_OVER_GOOD" });
});

test("adoption: an empty incoming tree over an ALREADY-EMPTY draft may adopt (operator emptied the page on purpose)", () => {
  const decision = decideSameSessionSaveAdoption(
    { editSessionId: SESSION_A, draftSeq: 10, storedHasContent: false },
    { editSessionId: SESSION_A, draftSeq: 11, incomingHasContent: false },
  );
  assert.deepEqual(decision, { apply: true });
});

test("isSameSessionNewerWrite: shared core used by the publish adoption lane", () => {
  assert.equal(
    isSameSessionNewerWrite(
      { editSessionId: SESSION_A, draftSeq: 3 },
      { editSessionId: SESSION_A, draftSeq: 4 },
    ),
    true,
  );
  assert.equal(
    isSameSessionNewerWrite(
      { editSessionId: SESSION_B, draftSeq: 3 },
      { editSessionId: SESSION_A, draftSeq: 4 },
    ),
    false,
  );
  assert.equal(
    isSameSessionNewerWrite(
      { editSessionId: null, draftSeq: null },
      { editSessionId: SESSION_A, draftSeq: 4 },
    ),
    false,
    "NULL stored stamp (unstamped writer) never matches",
  );
  assert.equal(
    isSameSessionNewerWrite(
      { editSessionId: SESSION_A, draftSeq: null },
      { editSessionId: SESSION_A, draftSeq: 1 },
    ),
    true,
    "NULL stored seq is -infinity so the session's first stamped write wins",
  );
});
