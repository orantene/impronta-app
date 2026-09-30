import assert from "node:assert/strict";
import { test } from "node:test";

import { reviewInviteCandidates } from "./review-invite-candidates";

const base = { lastVisit: null as string | null };

test("F45: only clients with a completed booking and an email can be asked", () => {
  const out = reviewInviteCandidates([
    { ...base, id: "a", name: "Ana", email: "ana@x.com", completedCount: 2 },
    { ...base, id: "b", name: "Bea", email: "bea@x.com", completedCount: 0 },
    { ...base, id: "c", name: "Cris", email: null, completedCount: 3 },
  ]);
  assert.deepEqual(out.map((c) => c.id), ["a"]);
});

test("F45: already-asked and duplicate emails drop out; newest visit first", () => {
  const out = reviewInviteCandidates(
    [
      { id: "a", name: "Ana", email: "Ana@x.com", completedCount: 1, lastVisit: "2026-09-01" },
      { id: "a2", name: "Ana dup", email: "ana@x.com", completedCount: 1, lastVisit: "2026-09-02" },
      { id: "d", name: "Dora", email: "dora@x.com", completedCount: 1, lastVisit: "2026-09-20" },
      { id: "e", name: "Eva", email: "eva@x.com", completedCount: 1, lastVisit: "2026-09-10" },
    ],
    new Set(["eva@x.com"]),
  );
  assert.deepEqual(out.map((c) => c.id), ["d", "a"]);
});
