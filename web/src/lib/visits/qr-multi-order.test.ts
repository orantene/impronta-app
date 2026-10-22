import { test } from "node:test";
import assert from "node:assert/strict";
import { loadOpenVisitByToken } from "./qr";

type Row = Record<string, unknown>;

/** Minimal read-only fake. `.maybeSingle()` mimics PostgREST: more than one row is an error (PGRST116). */
function fakeAdmin(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    const preds: Array<(row: Row) => boolean> = [];
    let sortKey: string | null = null;
    const rows = () => {
      const out = (tables[table] ?? []).filter((r) => preds.every((p) => p(r)));
      return sortKey ? [...out].sort((a, b) => String(a[sortKey as string]).localeCompare(String(b[sortKey as string]))) : out;
    };
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (k: string, v: unknown) => (preds.push((r) => r[k] === v), api),
      neq: (k: string, v: unknown) => (preds.push((r) => r[k] !== v), api),
      in: (k: string, vals: unknown[]) => (preds.push((r) => vals.includes(r[k])), api),
      order: (k: string) => ((sortKey = k), api),
      maybeSingle: async () => {
        const r = rows();
        if (r.length > 1) return { data: null, error: { code: "PGRST116", message: "multiple (or no) rows returned" } };
        return { data: r[0] ?? null, error: null };
      },
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve),
    };
    return api;
  };
  return { from } as unknown as Parameters<typeof loadOpenVisitByToken>[0];
}

function seed(orders: Row[], lines: Row[]) {
  return {
    visits: [{ id: "v1", tenant_id: "t1", space_id: "s1", public_token: "tok", status: "open", opened_at: null, party_size: 2 }],
    spaces: [{ id: "s1", tenant_id: "t1", code: "T2", name: "Table 2" }],
    orders,
    order_lines: lines,
  };
}

test("two open orders on one visit load as one check: lines concatenated oldest first, totals summed", async () => {
  const admin = fakeAdmin(
    seed(
      [
        { id: "o2", visit_id: "v1", tenant_id: "t1", currency: "MXN", total_cents: 500, status: "draft", created_at: "2026-01-01T10:05:00Z" },
        { id: "o1", visit_id: "v1", tenant_id: "t1", currency: "MXN", total_cents: 1200, status: "pending_payment", created_at: "2026-01-01T10:00:00Z" },
      ],
      [
        { id: "l2", order_id: "o2", label: "Beer", units: 1, total_cents: 500, sort_order: 0 },
        { id: "l1", order_id: "o1", label: "Tacos", units: 2, total_cents: 1200, sort_order: 0 },
      ],
    ),
  );
  const r = await loadOpenVisitByToken(admin, { tenantId: "t1", publicToken: "tok" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.totalCents, 1700);
  assert.equal(r.currency, "MXN");
  assert.deepEqual(r.lines.map((l) => l.label), ["Tacos", "Beer"]);
});

test("a cancelled order is left out of the check", async () => {
  const admin = fakeAdmin(
    seed(
      [
        { id: "o1", visit_id: "v1", tenant_id: "t1", currency: "USD", total_cents: 900, status: "draft", created_at: "2026-01-01T10:00:00Z" },
        { id: "o2", visit_id: "v1", tenant_id: "t1", currency: "USD", total_cents: 300, status: "cancelled", created_at: "2026-01-01T10:05:00Z" },
      ],
      [
        { id: "l1", order_id: "o1", label: "Soup", units: 1, total_cents: 900, sort_order: 0 },
        { id: "l2", order_id: "o2", label: "Void", units: 1, total_cents: 300, sort_order: 0 },
      ],
    ),
  );
  const r = await loadOpenVisitByToken(admin, { tenantId: "t1", publicToken: "tok" });
  assert.equal(r.ok && r.totalCents, 900);
  assert.equal(r.ok && r.lines.length, 1);
});

test("no orders yet is an empty check, not an error", async () => {
  const r = await loadOpenVisitByToken(fakeAdmin(seed([], [])), { tenantId: "t1", publicToken: "tok" });
  assert.deepEqual(r.ok && [r.lines.length, r.totalCents], [0, 0]);
});
