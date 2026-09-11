import { test } from "node:test";
import assert from "node:assert/strict";
import { agreeQuoteChange, listQuoteVersions } from "./quote-versions";

type Row = Record<string, unknown>;

function fake(store: { inquiry_offers: Row[] }) {
  const from = (table: string) => {
    let mode: "select" | "insert" = "select";
    let inserted: Row[] = [];
    const eqs: Array<[string, unknown]> = [];
    const match = () => (store[table as keyof typeof store] ?? []).filter((row) => eqs.every(([k, v]) => row[k] === v));
    const api: Record<string, unknown> = {
      select: () => api,
      insert: (rows: Row | Row[]) => {
        mode = "insert";
        inserted = Array.isArray(rows) ? rows : [rows];
        return api;
      },
      eq: (k: string, v: unknown) => {
        eqs.push([k, v]);
        return api;
      },
      order: () => api,
      maybeSingle: async () => ({ data: match()[0] ?? null, error: null }),
      single: async () => {
        if (mode === "insert") {
          const row = { ...inserted[0], id: (inserted[0]?.id as string) ?? crypto.randomUUID() };
          store.inquiry_offers.push(row);
          return { data: row, error: null };
        }
        return { data: match()[0] ?? null, error: null };
      },
      then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data: match(), error: null }).then(resolve),
    };
    return api;
  };
  return { from };
}

test("an agreed change is a new version; the accepted quote is not rewritten", async () => {
  const accepted = {
    id: "off-1",
    inquiry_id: "inq-1",
    tenant_id: "t1",
    version: 2,
    status: "accepted",
    total_client_price: 12000,
    notes: "Original menu",
    accepted_at: "2026-09-01T12:00:00.000Z",
  };
  const store = { inquiry_offers: [{ ...accepted }] };
  const r = await agreeQuoteChange(fake(store), {
    tenantId: "t1",
    inquiryId: "inq-1",
    fromOfferId: "off-1",
    totalClientPrice: 14500,
    notes: "Plus dessert",
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.previous.version, 2);
  assert.equal(r.previous.totalClientPrice, 12000);
  assert.equal(r.previous.acceptedAt, "2026-09-01T12:00:00.000Z");
  assert.equal(r.next.version, 3);
  assert.equal(r.next.totalClientPrice, 14500);
  assert.equal(r.next.acceptedAt, null);
  const original = store.inquiry_offers.find((o) => o.id === "off-1");
  assert.equal(original?.total_client_price, 12000);
  assert.equal(original?.accepted_at, "2026-09-01T12:00:00.000Z");
  assert.equal(store.inquiry_offers.length, 2);
});

test("listQuoteVersions keeps every version, including the accepted one", async () => {
  const store = {
    inquiry_offers: [
      {
        id: "off-1",
        inquiry_id: "inq-1",
        tenant_id: "t1",
        version: 1,
        status: "superseded",
        total_client_price: 10000,
        notes: null,
        accepted_at: null,
      },
      {
        id: "off-2",
        inquiry_id: "inq-1",
        tenant_id: "t1",
        version: 2,
        status: "accepted",
        total_client_price: 12000,
        notes: null,
        accepted_at: "2026-09-01T12:00:00.000Z",
      },
    ],
  };
  const r = await listQuoteVersions(fake(store), { tenantId: "t1", inquiryId: "inq-1" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.quotes.length, 2);
  assert.equal(r.quotes[1]?.status, "accepted");
});
