/**
 * The in-memory POS store `commands.test.ts` drives, moved out once that file
 * split by concern and both halves needed it.
 *
 * `maybeSingle` returns the PRE-update row for an update, not the post-update
 * one. That is deliberate here (unlike the sibling `pos-store.ts` fixture,
 * whose fakes model a different RPC surface): the conflict tests in
 * `commands-collection.test.ts` read that value to tell "this write landed"
 * from "this write lost a race", and switching it to the after-image would
 * make every conflict look like a success.
 *
 * IT IS A MODEL, NOT THE THING. No indexes, no triggers, no row locks: the
 * refusals that actually stop a double collection are in the database.
 */

import { makeCollectionRpc } from "./collection-reservations";

export type Row = Record<string, unknown>;

export function makeStore() {
  return {
    orders: [] as Row[],
    order_lines: [] as Row[],
    talent_offerings: [] as Row[],
    talent_offering_variants: [] as Row[],
    booking_transactions: [] as Row[],
    agency_bookings: [] as Row[],
    preparation_tickets: [] as Row[],
    preparation_ticket_revisions: [] as Row[],
    visits: [] as Row[],
    spaces: [] as Row[],
    sessions: [] as Row[],
    capacity_allocations: [] as Row[],
    order_collection_reservations: [] as Row[],
    agencies: [] as Row[],
    pos_approvals: [] as Row[],
  };
}

export function fakeAdmin(store: ReturnType<typeof makeStore>) {
  const tables: Record<string, Row[]> = store;
  const from = (table: string) => {
    let mode: "select" | "insert" | "update" | "delete" = "select";
    let inserted: Row[] = [];
    let patch: Row = {};
    const eqs: Array<[string, unknown]> = [];
    const match = () =>
      (tables[table] ?? []).filter((row) =>
        eqs.every(([k, v]) => {
          if (v && typeof v === "object" && v !== null && "__neq" in v) {
            return row[k] !== (v as { __neq: unknown }).__neq;
          }
          if (v && typeof v === "object" && v !== null && "__in" in v) {
            return (v as { __in: unknown[] }).__in.includes(row[k]);
          }
          return row[k] === v;
        }),
      );
    const apply = () => {
      if (mode === "insert") {
        for (const r of inserted) {
          const row = { ...r, id: (r.id as string) ?? crypto.randomUUID() };
          (tables[table] ?? (tables[table] = [])).push(row);
          Object.assign(r, row);
        }
      } else if (mode === "update") {
        for (const row of match()) Object.assign(row, patch);
      } else if (mode === "delete") {
        const keep = (tables[table] ?? []).filter((row) => !eqs.every(([k, v]) => row[k] === v));
        tables[table] = keep;
        if (table in store) (store as Record<string, Row[]>)[table] = keep;
      }
    };
    const result = () => {
      apply();
      if (mode === "insert") return { data: inserted.length === 1 ? inserted[0] : inserted, error: null };
      return { data: match(), error: null };
    };
    const api: Record<string, unknown> = {
      select: () => api,
      insert: (rows: Row | Row[]) => {
        mode = "insert";
        inserted = Array.isArray(rows) ? rows : [rows];
        return api;
      },
      update: (p: Row) => {
        mode = "update";
        patch = p;
        return api;
      },
      delete: () => {
        mode = "delete";
        return api;
      },
      eq: (k: string, v: unknown) => {
        eqs.push([k, v]);
        return api;
      },
      neq: (k: string, v: unknown) => {
        eqs.push([k, { __neq: v }]);
        return api;
      },
      in: (k: string, vals: unknown[]) => {
        eqs.push([k, { __in: vals }]);
        return api;
      },
      not: (k: string, op: string, v: unknown) => {
        if (op === "is" && v === null) eqs.push([k, { __neq: null }]);
        return api;
      },
      order: () => api,
      limit: () => api,
      maybeSingle: async () => {
        const before = match();
        apply();
        if (mode === "update") return { data: before[0] ?? null, error: null };
        const rows = match();
        return { data: rows[0] ?? null, error: null };
      },
      single: async () => {
        apply();
        if (mode === "insert") return { data: inserted[0] ?? null, error: inserted[0] ? null : { message: "none" } };
        const rows = match();
        return { data: rows[0] ?? null, error: rows[0] ? null : { message: "none" } };
      },
      then: (resolve: (v: { data: unknown; error: null }) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve, reject),
    };
    return api;
  };
  return { from };
}

/**
 * The same store, plus the collection RPCs.
 *
 * `startCollection` refuses rather than collect without `pos_reserve_collection`,
 * because outstanding cannot be computed correctly outside the order's row
 * lock. Draft building still goes through `fakeAdmin`: `lib/pos/draft.ts` has
 * its own RPC pair with a PostgREST fallback, and that fallback is what these
 * tests have always exercised.
 */
export function fakeTill(store: ReturnType<typeof makeStore>) {
  return { from: fakeAdmin(store).from, rpc: makeCollectionRpc(store) };
}

export function seedOffering(store: ReturnType<typeof makeStore>, over: Partial<Row> = {}) {
  store.talent_offerings.push({
    id: "off-1",
    tenant_id: "t1",
    title: "Gel manicure",
    amount_cents: 5000,
    currency: "USD",
    talent_profile_id: null,
    status: "published",
    ...over,
  });
}
