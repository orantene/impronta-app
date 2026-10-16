/**
 * A tiny in-memory Supabase stand-in for the cancel-money tests: tables of
 * rows, `select/update` with `eq/in` filters, `maybeSingle` and thenable reads.
 */
export type Row = Record<string, unknown>;

export function moneyStore(tables: Record<string, Row[]>) {
  const writes: Array<{ table: string; patch: Row; ids: unknown[] }> = [];
  const admin = {
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = [];
      let patch: Row | null = null;
      const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      const run = () => {
        const hit = rows();
        if (patch) {
          for (const r of hit) Object.assign(r, patch);
          writes.push({ table, patch, ids: hit.map((r) => r.id) });
        }
        return hit.map((r) => ({ ...r }));
      };
      const q = {
        select: () => q,
        update: (p: Row) => {
          patch = p;
          return q;
        },
        eq: (col: string, v: unknown) => {
          // PostgREST JSON path filters (`col->>key`) used by refund PI fallback.
          if (col.includes("->>")) {
            const [objCol, jsonKey] = col.split("->>");
            filters.push((r) => {
              const obj = r[objCol!];
              if (obj && typeof obj === "object" && !Array.isArray(obj)) {
                return (obj as Record<string, unknown>)[jsonKey!] === v;
              }
              return r[col] === v;
            });
            return q;
          }
          filters.push((r) => r[col] === v);
          return q;
        },
        in: (col: string, vs: unknown[]) => {
          filters.push((r) => vs.includes(r[col]));
          return q;
        },
        maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
        then: (res: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve(res({ data: run(), error: null })),
      };
      return q;
    },
  };
  return { admin, tables, writes };
}
