/**
 * A scripted PostgREST fake for the schedule tests, in the family of the one
 * in `ticket-delivery.test.ts`, grown to WRITE: `insert` appends (minting an
 * id), `update` mutates the filtered rows, `delete` removes them, and every
 * call is recorded with its filters and payload so a test can assert the
 * tenant predicate on a write. A table listed in `missing` answers every read
 * with a PostgREST "relation does not exist" error, which is how the
 * absent-table tolerance is exercised.
 *
 * Not a test file (no `.test.ts` suffix): it runs only when imported.
 */

export type Row = Record<string, unknown>;
export type Call = { table: string; op: "select" | "insert" | "update" | "delete"; payload?: unknown; filters: Array<[string, string, unknown]>; columns?: string };

export type FakeDb = {
  rows: Record<string, Row[]>;
  calls: Call[];
  admin: { from(table: string): unknown };
};

let seq = 0;
const mintId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

function matches(row: Row, filters: Array<[string, string, unknown]>): boolean {
  for (const [col, op, val] of filters) {
    const v = row[col];
    if (op === "eq" && v !== val) return false;
    if (op === "neq" && v === val) return false;
    if (op === "in" && !(val as unknown[]).includes(v)) return false;
    if (op === "is" && val === null && v != null) return false;
    if (op === "not.is" && val === null && v == null) return false;
    if (op === "gte" && !(typeof v === "string" && v >= (val as string))) return false;
    if (op === "lte" && !(typeof v === "string" && v <= (val as string))) return false;
    if (op === "ilike") {
      const needle = String(val).replace(/^%|%$/g, "").replace(/\\([\\%_])/g, "$1").toLowerCase();
      if (typeof v !== "string" || !v.toLowerCase().includes(needle)) return false;
    }
  }
  return true;
}

export function fakeDb(initial: Record<string, Row[]>, options: { missing?: string[] } = {}): FakeDb {
  const rows: Record<string, Row[]> = {};
  for (const [t, list] of Object.entries(initial)) rows[t] = list.map((r) => ({ ...r }));
  const calls: Call[] = [];
  const missing = new Set(options.missing ?? []);

  const admin = {
    from(table: string) {
      const call: Call = { table, op: "select", filters: [] };
      calls.push(call);
      const orderBy: Array<{ col: string; asc: boolean }> = [];
      let limitN: number | null = null;
      let returning = true;

      const run = (): { data: unknown; error: unknown } => {
        if (missing.has(table)) return { data: null, error: { code: "42P01", message: `relation "public.${table}" does not exist` } };
        const list = (rows[table] ??= []);
        if (call.op === "insert") {
          const payloads = Array.isArray(call.payload) ? (call.payload as Row[]) : [call.payload as Row];
          const inserted = payloads.map((p) => ({ id: mintId(), created_at: new Date().toISOString(), ...p }));
          list.push(...inserted);
          return { data: returning ? inserted : null, error: null };
        }
        let hit = list.filter((r) => matches(r, call.filters));
        if (call.op === "update") {
          for (const r of hit) Object.assign(r, call.payload as Row);
          return { data: returning ? hit : null, error: null };
        }
        if (call.op === "delete") {
          rows[table] = list.filter((r) => !hit.includes(r));
          return { data: returning ? hit : null, error: null };
        }
        for (const o of [...orderBy].reverse()) {
          hit = [...hit].sort((a, b) => {
            const x = a[o.col] as string | number | null; const y = b[o.col] as string | number | null;
            if (x === y) return 0;
            if (x == null) return 1; if (y == null) return -1;
            return (x < y ? -1 : 1) * (o.asc ? 1 : -1);
          });
        }
        if (limitN !== null) hit = hit.slice(0, limitN);
        return { data: hit, error: null };
      };

      const chain: Record<string, unknown> = {};
      const filter = (op: string) => (col: string, val: unknown) => { call.filters.push([col, op, val]); return chain; };
      Object.assign(chain, {
        select: (cols?: string) => { call.columns = cols; if (call.op !== "select") returning = true; return chain; },
        insert: (payload: unknown) => { call.op = "insert"; call.payload = payload; returning = false; return chain; },
        update: (payload: unknown) => { call.op = "update"; call.payload = payload; returning = false; return chain; },
        delete: () => { call.op = "delete"; returning = false; return chain; },
        eq: filter("eq"), neq: filter("neq"), in: filter("in"), is: filter("is"), gte: filter("gte"), lte: filter("lte"), ilike: filter("ilike"),
        not: (col: string, op: string, val: unknown) => { call.filters.push([col, `not.${op}`, val]); return chain; },
        order: (col: string, opts?: { ascending?: boolean }) => { orderBy.push({ col, asc: opts?.ascending !== false }); return chain; },
        limit: (n: number) => { limitN = n; return chain; },
        maybeSingle: async () => { const r = run(); return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error }; },
        then: (res: (v: { data: unknown; error: unknown }) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
      });
      return chain;
    },
  };
  return { rows, calls, admin };
}
