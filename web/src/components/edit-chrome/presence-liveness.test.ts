import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PRESENCE_PEER_TTL_MS,
  dedupeEditorsByUser,
  isPeerAlive,
} from "./presence-liveness";

test("a fresh heartbeat is alive, a stale one expires", () => {
  assert.equal(isPeerAlive(1_000, 1_000 + PRESENCE_PEER_TTL_MS), true);
  assert.equal(isPeerAlive(1_000, 1_000 + PRESENCE_PEER_TTL_MS + 1), false);
});

test("legacy peers with no heartbeat stay alive; future ts is alive", () => {
  assert.equal(isPeerAlive(undefined, 99_999), true);
  assert.equal(isPeerAlive(Number.NaN, 99_999), true);
  assert.equal(isPeerAlive(200_000, 1_000), true);
});

test("two tabs of one user collapse to one avatar, self wins", () => {
  const out = dedupeEditorsByUser([
    { id: "tab-b", userId: "u1" },
    { id: "tab-a", userId: "u1", isSelf: true },
  ]);
  assert.deepEqual(out.map((e) => e.id), ["tab-a"]);
});

test("different users stay separate, self first", () => {
  const out = dedupeEditorsByUser([
    { id: "t2", userId: "u2" },
    { id: "t1", userId: "u1", isSelf: true },
    { id: "t3", userId: "u2" },
  ]);
  assert.deepEqual(out.map((e) => e.id), ["t1", "t2"]);
});

test("tabs with unresolved userId are not merged with each other", () => {
  const out = dedupeEditorsByUser([
    { id: "t1", userId: null, isSelf: true },
    { id: "t2", userId: null },
  ]);
  assert.equal(out.length, 2);
});
