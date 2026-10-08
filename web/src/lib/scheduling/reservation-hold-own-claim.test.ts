/**
 * TUL-433: placing a hold on a FREE window must succeed. The post-insert
 * re-check read the busy source, which counts live holds, so it counted the
 * hold it had just inserted, called the window taken and deleted its own hold:
 * every /book request answered "Ese horario ya no esta disponible".
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' node_modules/.bin/tsx --test src/lib/scheduling/reservation-hold-own-claim.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { placeReservationHold } from "./reservation-hold";

type Row = Record<string, unknown>;

function fakeAdmin(preexistingHolds: Row[] = []) {
  const holds: Row[] = [...preexistingHolds];
  let n = 0;
  const from = (table: string) => {
    let neqId: string | null = null;
    let deleteId: string | null = null;
    let inserted: Row | null = null;
    let mode: "select" | "insert" | "delete" = "select";
    const api: Record<string, unknown> = {};
    for (const m of ["select", "lt", "gt", "gte", "lte", "or", "eq", "order", "limit"]) api[m] = (...a: unknown[]) => {
      if (m === "eq" && mode === "delete" && a[0] === "id") deleteId = String(a[1]);
      return api;
    };
    api.neq = (k: string, v: string) => {
      if (k === "id") neqId = v;
      return api;
    };
    api.insert = (row: Row) => {
      mode = "insert";
      inserted = { id: `hold-${++n}`, ...row };
      holds.push(inserted);
      return api;
    };
    api.delete = () => {
      mode = "delete";
      return api;
    };
    api.single = async () => ({ data: inserted ? { id: inserted.id } : null, error: null });
    api.then = (resolve: (v: unknown) => unknown) => {
      if (mode === "delete") {
        const i = holds.findIndex((h) => h.id === deleteId);
        if (i >= 0) holds.splice(i, 1);
        return resolve({ data: null, error: null });
      }
      if (table === "talent_holds") {
        const rows = holds.filter((h) => h.id !== neqId).map((h) => ({ starts_at: h.starts_at, ends_at: h.ends_at, expires_at: h.expires_at ?? null }));
        return resolve({ data: rows, error: null });
      }
      return resolve({ data: [], error: null });
    };
    return api;
  };
  return { admin: { from } as unknown as SupabaseClient, holds };
}

const input = { talentProfileId: "tp1", tenantId: "t1", startsAt: "2026-10-12T21:00:00Z", endsAt: "2026-10-12T22:00:00Z", title: "Reservation" };

test("a free window is held: the hold survives its own re-check", async () => {
  const { admin, holds } = fakeAdmin();
  const r = await placeReservationHold(admin, input);
  assert.equal(r.ok, true);
  assert.equal(holds.length, 1, "the hold is kept, not deleted by its own re-check");
});

test("a window another live hold already covers is still refused, and no second hold is left", async () => {
  const other = { id: "other", starts_at: "2026-10-12T20:30:00Z", ends_at: "2026-10-12T21:30:00Z", expires_at: new Date(Date.now() + 3600_000).toISOString() };
  const { admin, holds } = fakeAdmin([other]);
  const r = await placeReservationHold(admin, input);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.code, "slot_taken");
  assert.deepEqual(holds.map((h) => h.id), ["other"]);
});
