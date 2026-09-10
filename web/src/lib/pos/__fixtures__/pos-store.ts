/**
 * The in-memory POS store the collection tests drive.
 *
 * WHY IT IS A FIXTURE AND NOT A LOCAL HELPER. It grew to 120 lines of fake
 * PostgREST inside a test file that then passed its own 800 line budget, and
 * the honest answer to a budget is to move what does not belong rather than to
 * raise the number. It sits next to `collection-reservations.ts`, which models
 * the RPC half of the same fake admin, so the two halves of one seam live
 * together.
 *
 * IT IS A MODEL, NOT THE THING. No indexes, no triggers, no row locks: the
 * refusals that actually stop a double collection are in the database, and
 * `scripts/prove-collection-double-take.mjs` is what demonstrates those.
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
    capacity_allocations: [] as Row[],
    pos_shifts: [] as Row[],
    ticket_refund_intents: [] as Row[],
    order_collection_reservations: [] as Row[],
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
      order: () => api,
      limit: () => api,
      maybeSingle: async () => {
        apply();
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
  // The reservation RPCs are no longer optional: `startCollection` refuses
  // rather than collect without the order lock, so the fake has to model them
  // over the same store.
  return { from, rpc: makeCollectionRpc(store) };
}

/**
 * The same store with NO rpc, used only to build the fixture draft.
 *
 * `lib/pos/draft.ts` has its own RPC pair (`pos_mutate_draft_line`,
 * `pos_apply_draft_totals`) and a PostgREST fallback for when they are absent.
 * These tests have always exercised the fallback, and `makeCollectionRpc`
 * deliberately models only the collection RPCs — inventing a second model of
 * the draft ones here would be a model of a model. So the draft is built
 * through the fallback and collection is driven through the till.
 */
export function fakeDraftAdmin(store: ReturnType<typeof makeStore>) {
  const { from } = fakeAdmin(store);
  return { from };
}
