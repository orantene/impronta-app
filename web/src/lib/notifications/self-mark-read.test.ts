/**
 * TUL-389 — mark-read contract for self.ts.
 *
 * `markNotificationsRead` writes `read_at`; `countUnreadNotifications` only
 * counts rows where `read_at IS NULL`. This file pins the pure rollup that
 * the server path uses after a mark, without hitting Supabase.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  aggregateUnreadByKind,
  isNotificationKind,
  kindsForUiCategory,
  uiCategoryForKind,
} from "./categories-ui";

/** Simulate the post-mark unread set: drop ids that were marked. */
function unreadKindsAfterMark(
  rows: Array<{ id: string; kind: string; read_at: string | null }>,
  markIds: string[] | "all",
): string[] {
  const now = "2026-10-08T20:00:00.000Z";
  return rows
    .map((r) => {
      if (r.read_at) return r;
      if (markIds === "all") return { ...r, read_at: now };
      if (markIds.includes(r.id)) return { ...r, read_at: now };
      return r;
    })
    .filter((r) => r.read_at === null)
    .map((r) => r.kind);
}

test("mark-read clears unread for selected ids; countUnread rollup drops them", () => {
  const rows = [
    { id: "a", kind: "message", read_at: null },
    { id: "b", kind: "payment", read_at: null },
    { id: "c", kind: "approval", read_at: null },
    { id: "d", kind: "system", read_at: "2026-10-01T00:00:00.000Z" },
  ];

  const before = aggregateUnreadByKind(unreadKindsAfterMark(rows, []));
  assert.deepEqual(before, { total: 3, messages: 1, money: 1, attention: 1, updates: 0 });

  const afterOne = aggregateUnreadByKind(unreadKindsAfterMark(rows, ["a"]));
  assert.deepEqual(afterOne, { total: 2, messages: 0, money: 1, attention: 1, updates: 0 });

  const afterAll = aggregateUnreadByKind(unreadKindsAfterMark(rows, "all"));
  assert.deepEqual(afterAll, { total: 0, messages: 0, money: 0, attention: 0, updates: 0 });
});

test("category filter used by countUnreadNotifications matches kindsForUiCategory", () => {
  const kinds = ["message", "payment", "offer", "system"];
  const moneyKinds = new Set(kindsForUiCategory("money"));
  const moneyOnly = kinds.filter((k) => isNotificationKind(k) && moneyKinds.has(k));
  assert.deepEqual(moneyOnly, ["payment"]);
  assert.equal(uiCategoryForKind("offer"), "attention");
});
