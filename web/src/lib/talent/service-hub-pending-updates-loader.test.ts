import assert from "node:assert/strict";
import test from "node:test";

import { loadServiceHubChannels } from "./service-hub-channels.server";

function fake(tables: Record<string, unknown[]>) {
  return {
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "not", "gt", "lt", "gte", "lte", "order", "limit", "is", "neq"]) q[m] = () => q;
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(ok);
      return q;
    },
  } as never;
}

test("the loader returns the talent's offered listings as pending updates, and not accepted ones", async () => {
  const res = await loadServiceHubChannels(
    fake({
      workspace_service_listings: [
        { id: "L1", tenant_id: "t1", offering_id: "o1", status: "offered", price_mode: "talent_price", currency: "USD", show_who: "name", client_contact: "workspace", booking_type: "request", talent_lowest_cents: null },
        { id: "L2", tenant_id: "t1", offering_id: "o1", status: "accepted", price_mode: "talent_price", currency: "USD", show_who: "name", client_contact: "workspace", booking_type: "request", talent_lowest_cents: null },
      ],
      talent_offerings: [{ id: "o1", title: "Sunrise paddle", amount_cents: 10000, currency: "USD" }],
      agencies: [{ id: "t1", display_name: "Blue Oar", kind: "agency" }],
    }),
    "tp1",
    "u1",
  );
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.deepEqual(res.pending.map((p) => [p.listingId, p.workspaceName, p.serviceTitle, p.listPriceCents]), [["L1", "Blue Oar", "Sunrise paddle", 10000]]);
});
