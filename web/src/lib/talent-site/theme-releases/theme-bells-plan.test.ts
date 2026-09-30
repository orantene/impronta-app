import test from "node:test";
import assert from "node:assert/strict";

import { planBellDedupe, type BellRecord } from "./theme-bells-plan";

const bell = (id: string, release: string, toVersion: number, at: string, user = "u-1", design = "maison-v2"): BellRecord => ({
  id, user_id: user, origin_event_id: release, created_at: at, target_payload: { design, toVersion },
});

test("keeps only the newest unread bell per talent and design; others read (Jorg's 4 bells)", () => {
  const unread = [
    bell("b1", "r15", 15, "2026-09-30T08:00:00Z"),
    bell("b2", "r16", 16, "2026-09-30T11:00:00Z"),
    bell("b3", "r17", 17, "2026-09-30T11:25:00Z"),
    bell("b4", "r18", 18, "2026-09-30T11:58:00Z"),
    bell("other-design", "r9", 3, "2026-09-30T11:00:00Z", "u-1", "folio"),
    bell("other-user", "r18", 18, "2026-09-30T11:58:00Z", "u-2"),
  ];
  const plan = planBellDedupe(unread, []);
  assert.deepEqual(plan.markRead.map((m) => m.id).sort(), ["b1", "b2", "b3"]);
  assert.ok(plan.markRead.every((m) => m.reason === "superseded"));
  assert.deepEqual([...plan.kept].sort(), ["b4", "other-design", "other-user"]);
});

test("a bell whose rows are all closed is marked read, even the newest", () => {
  const unread = [bell("b1", "r17", 17, "2026-09-30T10:00:00Z"), bell("b2", "r18", 18, "2026-09-30T11:00:00Z")];
  const rows = [
    { release_id: "r17", state: "applied", user_id: "u-1" },
    { release_id: "r18", state: "dismissed", user_id: "u-1" },
  ];
  const plan = planBellDedupe(unread, rows);
  assert.deepEqual(plan.markRead.map((m) => [m.id, m.reason]).sort(), [["b1", "rows_closed"], ["b2", "rows_closed"]]);
  assert.deepEqual(plan.kept, []);
});

test("an open row keeps its bell; a mix of open and closed rows is still open", () => {
  const unread = [bell("b1", "r18", 18, "2026-09-30T11:00:00Z")];
  const rows = [
    { release_id: "r18", state: "applied", user_id: "u-1" },
    { release_id: "r18", state: "available", user_id: "u-1" },
  ];
  assert.deepEqual(planBellDedupe(unread, rows).kept, ["b1"]);
});

test("idempotent: planning again over what is left changes nothing", () => {
  const unread = [bell("b1", "r17", 17, "2026-09-30T10:00:00Z"), bell("b2", "r18", 18, "2026-09-30T11:00:00Z")];
  const first = planBellDedupe(unread, []);
  const left = unread.filter((b) => !first.markRead.some((m) => m.id === b.id));
  assert.equal(planBellDedupe(left, []).markRead.length, 0);
});
