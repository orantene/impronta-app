/**
 * In-memory stand-in for the service-role client (Phase 4 tests only).
 * Supports the query shapes the update + history modules use:
 * select/eq/in/order/limit/maybeSingle/update, plus the two history RPCs.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;

export interface FakeDb {
  admin: SupabaseClient;
  tables: Tables;
  /** Every select: table + columns (to prove named-column reads). */
  selects: Array<{ table: string; cols: string }>;
  /** Every write: table updates and draft RPCs. */
  writes: Array<{ kind: "update" | "rpc"; target: string; payload: unknown }>;
}

function read(row: Row, col: string): unknown {
  const json = col.match(/^(\w+)->>(\w+)$/);
  if (json) {
    const obj = row[json[1]!] as Row | null | undefined;
    const v = obj?.[json[2]!];
    return v === undefined || v === null ? null : String(v);
  }
  return row[col];
}

let seq = 0;
const newId = () => `00000000-0000-4000-8000-${String((seq += 1)).padStart(12, "0")}`;

export function makeFakeDb(tables: Tables): FakeDb {
  const db: FakeDb = { admin: null as unknown as SupabaseClient, tables, selects: [], writes: [] };

  function from(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let patch: Row | null = null;
    let lim = Infinity;
    const q = {
      select(cols = "*") {
        db.selects.push({ table, cols });
        return q;
      },
      eq(col: string, v: unknown) {
        filters.push((r) => read(r, col) === v);
        return q;
      },
      in(col: string, vs: unknown[]) {
        filters.push((r) => vs.includes(read(r, col)));
        return q;
      },
      gt(col: string, v: number) {
        filters.push((r) => typeof r[col] === "number" && (r[col] as number) > v);
        return q;
      },
      is(col: string, v: unknown) {
        filters.push((r) => (r[col] ?? null) === v);
        return q;
      },
      order() {
        return q;
      },
      limit(n: number) {
        lim = n;
        return q;
      },
      update(p: Row) {
        patch = p;
        return q;
      },
      insert(rows: Row | Row[]) {
        const list = Array.isArray(rows) ? rows : [rows];
        (tables[table] ??= []).push(...list.map((r) => ({ id: newId(), ...r })));
        db.writes.push({ kind: "update", target: table, payload: { inserted: list.length } });
        return Promise.resolve({ data: null, error: null });
      },
      async maybeSingle() {
        const res = run();
        return { data: (res.data as Row[])[0] ?? null, error: null };
      },
      then<T>(ok: (v: { data: unknown; error: null }) => T, bad?: (e: unknown) => T) {
        return Promise.resolve(run()).then(ok, bad);
      },
    };
    function run(): { data: unknown; error: null } {
      const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r))).slice(0, lim);
      if (patch) {
        for (const r of rows) Object.assign(r, patch);
        db.writes.push({ kind: "update", target: table, payload: { patch, rows: rows.length } });
      }
      return { data: rows, error: null };
    }
    return q;
  }

  async function rpc(fn: string, args: Record<string, unknown>) {
    db.writes.push({ kind: "rpc", target: fn, payload: args });
    if (fn !== "talent_site_write_draft") return { data: null, error: null };
    const site = (tables.talent_sites ?? []).find((s) => s.id === args.p_site_id);
    if (!site) return { data: { ok: false, code: "site_not_found" }, error: null };
    const rev = (site.draft_rev as number) ?? 0;
    if (typeof args.p_expected_rev === "number" && args.p_expected_rev !== rev) {
      return { data: { ok: false, code: "conflict", current_rev: rev }, error: null };
    }
    Object.assign(site, args.p_site as Row);
    for (const p of (args.p_pages as Array<{ id: string; patch: Row }>) ?? []) {
      const page = (tables.talent_pages ?? []).find((x) => x.id === p.id);
      if (!page) return { data: null, error: { code: "P0002", message: "page not found" } };
      Object.assign(page, p.patch);
    }
    site.draft_rev = rev + 1;
    let historyId: string | null = null;
    const h = args.p_history as Row | null;
    if (h) {
      historyId = newId();
      (tables.talent_site_history ??= []).push({
        id: historyId,
        site_id: site.id,
        talent_profile_id: site.talent_profile_id,
        at: new Date().toISOString(),
        kind: h.kind,
        actor: h.actor,
        summary_en: h.summary_en,
        summary_es: h.summary_es,
        report: h.report ?? null,
        undoable: h.undoable ?? false,
        snapshot_ref: null,
      });
      if (h.undo_of) {
        const target = tables.talent_site_history!.find((r) => r.id === h.undo_of);
        if (target) target.undoable = false;
      }
    }
    return { data: { ok: true, draft_rev: rev + 1, history_id: historyId, updated_at: "now" }, error: null };
  }

  db.admin = { from, rpc } as unknown as SupabaseClient;
  return db;
}

export const fakeId = newId;
