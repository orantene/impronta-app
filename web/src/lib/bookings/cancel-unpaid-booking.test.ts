import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cancelUnpaidBookings } from "./cancel-unpaid-booking";

type Filter = { op: "eq" | "in"; col: string; val: unknown };
type Write = { table: string; payload: Record<string, unknown>; filters: Filter[] };

type AgencyRow = { id: string; source_inquiry_id: string | null };

function fakeAdmin(writes: Write[], agencyRows: AgencyRow[]) {
  return {
    from(table: string) {
      return {
        select() {
          const chain = {
            eq: () => chain,
            in: () => Promise.resolve({ data: agencyRows, error: null }),
          };
          return chain;
        },
        update(payload: Record<string, unknown>) {
          const w: Write = { table, payload, filters: [] };
          writes.push(w);
          const chain = {
            eq(col: string, val: unknown) {
              w.filters.push({ op: "eq", col, val });
              return chain;
            },
            in(col: string, val: unknown) {
              w.filters.push({ op: "in", col, val });
              return Promise.resolve({ error: null });
            },
          };
          return chain;
        },
      };
    },
  } as unknown as SupabaseClient;
}

test("cancels the agency booking guarded on unpaid and the talent calendar row by INQUIRY id", async () => {
  const writes: Write[] = [];
  const res = await cancelUnpaidBookings(fakeAdmin(writes, [{ id: "ab1", source_inquiry_id: "inq1" }]), ["ab1"]);
  assert.equal(res.ok, true);
  const agency = writes.find((w) => w.table === "agency_bookings");
  const talent = writes.find((w) => w.table === "talent_bookings");
  assert.ok(agency && talent);
  assert.deepEqual(agency.filters.find((f) => f.col === "payment_status"), { op: "eq", col: "payment_status", val: "unpaid" });
  // talent_bookings has its own id; the link is inquiry_id (TUL-706 root cause).
  assert.ok(!talent.filters.some((f) => f.col === "id"), "must not key talent_bookings by the agency booking id");
  assert.deepEqual(talent.filters.find((f) => f.col === "inquiry_id"), { op: "in", col: "inquiry_id", val: ["inq1"] });
  assert.equal(talent.payload.status, "cancelled");
});
