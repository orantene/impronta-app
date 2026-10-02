/**
 * A tiny in-memory PostgREST for the policy tests: exactly the verbs the
 * policy store and the cancel-policy loader use (select, eq, in, not, order,
 * limit, maybeSingle, insert, upsert) and one unique key, so a publish race can
 * be simulated. A model, not a database.
 */

export type Row = Record<string, unknown>;
export type Store = Record<string, Row[]>;

const UNIQUE: Record<string, string[]> = {
  talent_policy_versions: ["talent_profile_id", "version"],
};

export function policyFakeAdmin(store: Store, opts: { failInsertOnce?: boolean } = {}) {
  let failInsertOnce = opts.failInsertOnce === true;
  const inserts: Array<{ table: string; row: Row }> = [];

  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    const order: Array<{ col: string; asc: boolean }> = [];
    let limitN: number | null = null;
    let mode: "select" | "insert" | "upsert" = "select";
    let payload: Row = {};
    let conflictKey = "";
    let one = false;
    const rows = () => store[table] ?? (store[table] = []);

    const run = (): { data: unknown; error: unknown } => {
      if (mode === "insert" || mode === "upsert") {
        const key = UNIQUE[table];
        if (mode === "insert" && failInsertOnce && table === "talent_policy_versions") {
          failInsertOnce = false;
          // Simulate another publish taking this version first.
          rows().push({ ...payload, content_hash: "someone-elses-hash" });
          return { data: null, error: { code: "23505", message: "duplicate key" } };
        }
        if (mode === "insert" && key && rows().some((r) => key.every((k) => r[k] === payload[k]))) {
          return { data: null, error: { code: "23505", message: "duplicate key" } };
        }
        if (mode === "upsert") {
          const existing = rows().find((r) => r[conflictKey] === payload[conflictKey]);
          if (existing) Object.assign(existing, payload);
          else rows().push({ ...payload });
          return { data: null, error: null };
        }
        rows().push({ ...payload });
        inserts.push({ table, row: { ...payload } });
        return { data: null, error: null };
      }
      let out = rows().filter((r) => filters.every((f) => f(r)));
      for (const { col, asc } of [...order].reverse()) {
        out = [...out].sort((a, b) => {
          const x = a[col];
          const y = b[col];
          const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
          return asc ? cmp : -cmp;
        });
      }
      if (limitN != null) out = out.slice(0, limitN);
      return { data: one ? (out[0] ?? null) : out, error: null };
    };

    const api = {
      select: () => api,
      eq: (k: string, v: unknown) => {
        filters.push((r) => r[k] === v);
        return api;
      },
      in: (k: string, vs: unknown[]) => {
        filters.push((r) => vs.includes(r[k]));
        return api;
      },
      not: (k: string, _op: string, v: unknown) => {
        filters.push((r) => !(r[k] === v || (v === null && (r[k] === undefined || r[k] === null))));
        return api;
      },
      order: (col: string, o?: { ascending?: boolean }) => {
        order.push({ col, asc: o?.ascending !== false });
        return api;
      },
      limit: (n: number) => {
        limitN = n;
        return api;
      },
      insert: (v: Row) => {
        mode = "insert";
        payload = v;
        return Promise.resolve(run());
      },
      upsert: (v: Row, o?: { onConflict?: string }) => {
        mode = "upsert";
        payload = v;
        conflictKey = o?.onConflict ?? "id";
        return Promise.resolve(run());
      },
      maybeSingle: () => {
        one = true;
        return Promise.resolve(run());
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
    };
    return api;
  };

  return { admin: { from }, store, inserts };
}
