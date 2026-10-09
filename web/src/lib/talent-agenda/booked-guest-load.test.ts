/**
 * TUL-450 through the REAL loader: an instant-booked guest booking (talent_bookings
 * confirmed, inquiry_id set, client_label null, no contact on the agency row) must
 * come out as a booking that blocks time and carries the guest's name from the
 * inquiry, and the thread inquiry must not ALSO appear as a request.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { loadTalentAgenda } from "./load";
import { blocksTime } from "./derive";
import { weekChipKind } from "@/components/admin/shell/internal/talent/agenda/present";

const TALENT = "talent-1";
const OWNER = "user-1";
const INQ = "inq-1";
const BK = "bk-1";

function fakeDb(tables: Record<string, unknown[]>) {
  const make = (table: string) => {
    const q: Record<string, unknown> = {};
    const chain = ["select", "eq", "neq", "in", "is", "gte", "gt", "lte", "lt", "order", "limit", "not", "or", "contains"];
    for (const m of chain) q[m] = () => q;
    q.maybeSingle = () => Promise.resolve({ data: (tables[table] ?? [])[0] ?? null, error: null });
    q.single = q.maybeSingle;
    q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(resolve);
    return q;
  };
  return { from: (t: string) => make(t), rpc: async () => ({ data: null, error: null }) } as never;
}

const range = { from: new Date("2026-10-12T00:00:00Z"), to: new Date("2026-10-19T00:00:00Z") };

const tables = {
  talent_profiles: [{ user_id: OWNER }],
  talent_bookings: [{ id: BK, title: "Limpieza profunda", client_label: null, starts_at: "2026-10-12T17:00:00Z", ends_at: "2026-10-12T18:30:00Z", all_day: false, status: "confirmed", inquiry_id: INQ, tenant_id: "ws", location_text: null, travel_before_min: null, travel_after_min: null }],
  agency_bookings: [{ id: BK, status: "confirmed", payment_status: "unpaid", total_client_revenue: 850, deposit_amount_cents: null, currency_code: "MXN", timezone: null, client_timezone: null, balance_due_at: null, source_type_snapshot: null, contact_name: null, contact_email: null, contact_phone: null, venue_name: null, venue_location_text: null, travel_before_min: null, travel_after_min: null, intake_status: null, intake_sent_at: null, order_id: null, tenant_id: "ws", payment_method: null, payment_notes: null }],
  // the same inquiry is both the thread of the booking and an "open inquiry" owned by the talent
  inquiries: [{ id: INQ, contact_name: "Live QA Tester", contact_email: "q@x.test", contact_phone: "+52 55", event_date: "2026-10-12", event_timezone: "America/Mexico_City", source_type: "talent_site", message: null, created_at: "2026-10-09T00:00:00Z", booked_at: null }],
};

test("an instant-booked guest booking blocks time, is named, and is not also a request", async () => {
  const db = fakeDb(tables);
  const res = await loadTalentAgenda(TALENT, range, { supabase: db, moneyDb: db });
  const mine = res.items.filter((i) => i.id === BK || (i.ref && "id" in i.ref && i.ref.id === BK));
  assert.equal(mine.length, 1, "the booking is loaded once");
  const item = mine[0];
  assert.equal(item.kind, "booking");
  assert.equal(item.blocksTime, true);
  assert.equal(blocksTime(item), true);
  assert.equal(weekChipKind(item), "booking");
  assert.equal(item.client?.name, "Live QA Tester");
  assert.equal(res.items.filter((i) => i.kind === "request").length, 0, "the thread inquiry is not a second, dashed request card");
});

test("a pure inquiry with no booking still shows as a request that does not block", async () => {
  const db = fakeDb({ ...tables, talent_bookings: [], agency_bookings: [] });
  const res = await loadTalentAgenda(TALENT, range, { supabase: db, moneyDb: db });
  const requests = res.items.filter((i) => i.kind === "request");
  assert.equal(requests.length, 1);
  assert.equal(blocksTime(requests[0]), false);
});
