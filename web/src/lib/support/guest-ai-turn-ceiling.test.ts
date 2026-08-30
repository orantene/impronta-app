import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GUEST_AI_TURN_CEILING,
  countGuestAiTurns,
  guestAiTurnCeilingReached,
} from "./guest-ai-turns";

test("the Nth AI turn is refused before an adapter would be invoked", () => {
  const messages = Array.from({ length: GUEST_AI_TURN_CEILING }, (_, i) => ({
    authorKind: i % 2 === 0 ? "ai" : "ai",
  }));
  const count = countGuestAiTurns(messages);
  assert.equal(count, GUEST_AI_TURN_CEILING);
  assert.equal(guestAiTurnCeilingReached(count), true);
  assert.equal(guestAiTurnCeilingReached(GUEST_AI_TURN_CEILING - 1), false);
});

test("counting only authorKind === ai rows", () => {
  const count = countGuestAiTurns([
    { authorKind: "requester" },
    { authorKind: "ai" },
    { authorKind: "system" },
    { authorKind: "ai" },
  ]);
  assert.equal(count, 2);
  assert.equal(guestAiTurnCeilingReached(2), false);
});
