/**
 * An in-memory PostgREST for the storefront seam tests.
 *
 * Same idea as `lib/pos/__fixtures__/pos-store.ts`, cut down to the verbs the
 * storefront readers use and open to any table name, so a test seeds exactly
 * the rows a widget reads and nothing else. It filters on equality, `in`,
 * `gte`/`lte`, `neq`; it honours `order`, `limit`, `maybeSingle`, `single`;
 * `insert` returns the inserted rows (with an `id` minted when absent) and
 * `update` patches every matching row. `rpc` answers from a handler map.
 *
 * IT IS A MODEL. Joins, `or(...)`, `like`, range filters on dates and the
 * capacity RPCs are NOT modelled; a core that needs one takes it as an
 * injected dependency instead.
 */

export type Row = Record<string, unknown>;

export type FakeStore = Record<string, Row[]>;

type Filter = (row: Row) => boolean;

let seq = 0;
const mintId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

export function fakeAdmin(
  store: FakeStore,
  rpcs: Record<string, (args: Record<string, unknown>) => unknown> = {},
) {
  const calls: Array<{ table?: string; rpc?: string; op: string; args?: unknown }> = [];
  const from = (table: string) => {
    const filters: Filter[] = [];
    let mode: "select" | "insert" | "update" | "delete" = "select";
    let inserted: Row[] = [];
    let patch: Row = {};
    const orderBy: { col: string; asc: boolean }[] = [];
    let limitN: number | null = null;
    let single: "maybe" | "one" | null = null;

    const rows = () => store[table] ?? (store[table] = []);
    const matching = () => rows().filter((r) => filters.every((f) => f(r)));

    const run = () => {
      if (mode === "insert") {
        const out = inserted.map((r) => ({ id: mintId(), ...r }));
        rows().push(...out);
        calls.push({ table, op: "insert", args: out });
        return finish(out);
      }
      if (mode === "update") {
        const hit = matching();
        for (const r of hit) Object.assign(r, patch);
        calls.push({ table, op: "update", args: { patch, count: hit.length } });
        return finish(hit);
      }
      if (mode === "delete") {
        const hit = new Set(matching());
        store[table] = rows().filter((r) => !hit.has(r));
        calls.push({ table, op: "delete", args: { count: hit.size } });
        return finish([...hit]);
      }
      let out = matching();
      for (const { col, asc } of [...orderBy].reverse()) {
        out = [...out].sort((a, b) => {
          const x = String(a[col] ?? "");
          const y = String(b[col] ?? "");
          return asc ? x.localeCompare(y) : y.localeCompare(x);
        });
      }
      if (limitN != null) out = out.slice(0, limitN);
      calls.push({ table, op: "select" });
      return finish(out);
    };
    const finish = (out: Row[]) => {
      if (single === "maybe") {
        if (out.length > 1) return { data: null, error: { code: "PGRST116", message: "more than one row" } };
        return { data: out[0] ?? null, error: null };
      }
      if (single === "one") {
        if (out.length !== 1) return { data: null, error: { code: "PGRST116", message: "expected one row" } };
        return { data: out[0], error: null };
      }
      return { data: out, error: null };
    };

    const api = {
      select: () => api,
      insert: (v: Row | Row[]) => {
        mode = "insert";
        inserted = Array.isArray(v) ? v : [v];
        return api;
      },
      update: (v: Row) => {
        mode = "update";
        patch = v;
        return api;
      },
      delete: () => {
        mode = "delete";
        return api;
      },
      eq: (k: string, v: unknown) => {
        filters.push((r) => r[k] === v);
        return api;
      },
      neq: (k: string, v: unknown) => {
        filters.push((r) => r[k] !== v);
        return api;
      },
      in: (k: string, vs: unknown[]) => {
        filters.push((r) => vs.includes(r[k]));
        return api;
      },
      is: (k: string, v: unknown) => {
        filters.push((r) => r[k] === v || (v === null && r[k] === undefined));
        return api;
      },
      gte: (k: string, v: unknown) => {
        filters.push((r) => String(r[k]) >= String(v));
        return api;
      },
      lte: (k: string, v: unknown) => {
        filters.push((r) => String(r[k]) <= String(v));
        return api;
      },
      gt: (k: string, v: unknown) => {
        filters.push((r) => String(r[k]) > String(v));
        return api;
      },
      lt: (k: string, v: unknown) => {
        filters.push((r) => String(r[k]) < String(v));
        return api;
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        orderBy.push({ col, asc: opts?.ascending !== false });
        return api;
      },
      limit: (n: number) => {
        limitN = n;
        return api;
      },
      maybeSingle: () => {
        single = "maybe";
        return Promise.resolve(run());
      },
      single: () => {
        single = "one";
        return Promise.resolve(run());
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
    };
    return api;
  };

  const rpc = async (name: string, args?: Record<string, unknown>) => {
    calls.push({ rpc: name, op: "rpc", args });
    const handler = rpcs[name];
    if (!handler) return { data: null, error: { code: "42883", message: `rpc ${name} not modelled` } };
    try {
      return { data: await handler(args ?? {}), error: null };
    } catch (error) {
      return { data: null, error: { code: "P0001", message: String(error) } };
    }
  };

  return { admin: { from, rpc }, calls, store };
}

/** Deterministic uuid-shaped ids for fixtures. */
export function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}
