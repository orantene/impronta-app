/**
 * In-memory stand-in for the parts of supabase-js the foundation seeder uses:
 * table queries (select / insert / update / upsert / delete with the filters
 * the seeder calls), auth.admin, rpc("replace_talent_languages") and storage
 * remove. Every mutation is recorded in `db.ops` so tests can assert what was,
 * and was not, written. Test support only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

export type Row = Record<string, unknown>;
export type Op = { table: string; op: "insert" | "update" | "upsert" | "delete"; rows?: Row[]; patch?: Row; where?: string };
export type AuthUser = {
  id: string;
  email: string;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  [k: string]: unknown;
};

export class FakeDb {
  tables: Record<string, Row[]> = {};
  ops: Op[] = [];
  users: AuthUser[] = [];
  authCalls: { method: string; args: unknown }[] = [];
  rpcCalls: { name: string; args: unknown }[] = [];
  table(name: string): Row[] {
    return (this.tables[name] ??= []);
  }
  writesTo(table: string): Op[] {
    return this.ops.filter((o) => o.table === table);
  }
}

type Filter = (r: Row) => boolean;

class Query implements PromiseLike<{ data: unknown; error: null }> {
  private filters: Filter[] = [];
  private mode: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private onConflict: string[] = [];
  private returning = false;
  private shape: "many" | "maybe" | "single" = "many";
  private orderBy: string | null = null;
  private desc = false;
  private lo = 0;
  private hi = Infinity;

  constructor(private db: FakeDb, private table: string) {}

  select(_cols?: string, _opts?: unknown) {
    if (this.mode !== "select") this.returning = true;
    return this;
  }
  insert(rows: Row | Row[]) { this.mode = "insert"; this.payload = rows; return this; }
  update(patch: Row) { this.mode = "update"; this.payload = patch; return this; }
  upsert(rows: Row | Row[], opts?: { onConflict?: string }) {
    this.mode = "upsert";
    this.payload = rows;
    this.onConflict = (opts?.onConflict ?? "id").split(",");
    return this;
  }
  delete() { this.mode = "delete"; return this; }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: unknown) { this.filters.push((r) => r[c] !== v); return this; }
  in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
  is(c: string, v: unknown) { this.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return this; }
  not(c: string, op: string, v: unknown) {
    if (op === "is") this.filters.push((r) => (v === null ? r[c] != null : r[c] !== v));
    return this;
  }
  gt(c: string, v: unknown) { this.filters.push((r) => String(r[c]) > String(v)); return this; }
  order(c: string, o?: { ascending?: boolean }) { this.orderBy = c; this.desc = o?.ascending === false; return this; }
  limit(_n: number) { return this; }
  range(a: number, b: number) { this.lo = a; this.hi = b; return this; }
  maybeSingle() { this.shape = "maybe"; return this; }
  single() { this.shape = "single"; return this; }

  private match(): Row[] {
    return this.db.table(this.table).filter((r) => this.filters.every((f) => f(r)));
  }

  private run(): { data: unknown; error: { message: string } | null } {
    const t = this.db.table(this.table);
    if (this.mode === "select") {
      let rows = this.match();
      if (this.orderBy) {
        const k = this.orderBy;
        rows = [...rows].sort((a, b) => (String(a[k]) < String(b[k]) ? -1 : 1) * (this.desc ? -1 : 1));
      }
      rows = rows.slice(this.lo, Number.isFinite(this.hi) ? this.hi + 1 : undefined).map((r) => ({ ...r }));
      return this.shaped(rows);
    }
    if (this.mode === "insert" || this.mode === "upsert") {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((r) => ({ ...r }));
      const out: Row[] = [];
      for (const r of list) {
        if (this.mode === "upsert") {
          const hit = t.find((x) => this.onConflict.every((c) => x[c] === r[c]));
          if (hit) { Object.assign(hit, r); out.push({ ...hit }); continue; }
        }
        if (r.id === undefined) r.id = randomUUID();
        t.push(r);
        out.push({ ...r });
      }
      this.db.ops.push({ table: this.table, op: this.mode, rows: list });
      return this.shaped(this.returning ? out : []);
    }
    if (this.mode === "update") {
      const rows = this.match();
      for (const r of rows) Object.assign(r, this.payload);
      this.db.ops.push({ table: this.table, op: "update", patch: { ...(this.payload as Row) } });
      return this.shaped(this.returning ? rows.map((r) => ({ ...r })) : []);
    }
    const doomed = new Set(this.match());
    this.db.tables[this.table] = t.filter((r) => !doomed.has(r));
    this.db.ops.push({ table: this.table, op: "delete" });
    return { data: null, error: null };
  }

  private shaped(rows: Row[]) {
    if (this.shape === "many") return { data: rows, error: null };
    if (this.shape === "maybe") return { data: rows[0] ?? null, error: null };
    return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: "no rows" } };
  }

  then<R1 = { data: unknown; error: null }, R2 = never>(
    onfulfilled?: ((v: { data: unknown; error: null }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((e: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    try {
      return Promise.resolve(this.run() as { data: unknown; error: null }).then(onfulfilled, onrejected);
    } catch (e) {
      return Promise.reject(e).then(onfulfilled, onrejected);
    }
  }
}

export function fakeClient(db: FakeDb): SupabaseClient {
  const admin = {
    async listUsers({ page, perPage }: { page: number; perPage: number }) {
      db.authCalls.push({ method: "listUsers", args: { page } });
      const start = (page - 1) * perPage;
      return { data: { users: db.users.slice(start, start + perPage) }, error: null };
    },
    async getUserById(id: string) {
      return { data: { user: db.users.find((u) => u.id === id) ?? null }, error: null };
    },
    async createUser(attrs: { email: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> }) {
      db.authCalls.push({ method: "createUser", args: attrs });
      const u: AuthUser = { id: randomUUID(), email: attrs.email, app_metadata: attrs.app_metadata ?? {}, user_metadata: attrs.user_metadata ?? {} };
      db.users.push(u);
      db.table("profiles").push({ id: u.id });
      return { data: { user: u }, error: null };
    },
    async updateUserById(id: string, attrs: Record<string, unknown>) {
      db.authCalls.push({ method: "updateUserById", args: { id, ...attrs } });
      const u = db.users.find((x) => x.id === id);
      if (u && attrs.app_metadata) u.app_metadata = attrs.app_metadata as Record<string, unknown>;
      return { data: { user: u }, error: null };
    },
    async generateLink(attrs: { type: string; email: string }) {
      db.authCalls.push({ method: "generateLink", args: attrs });
      const u = db.users.find((x) => x.email === attrs.email);
      if (!u) return { data: { properties: null, user: null }, error: { message: "not found" } };
      return { data: { properties: { action_link: `https://example.test/verify?token=tok-${u.id}&type=${attrs.type}` }, user: u }, error: null };
    },
    async deleteUser(id: string) {
      db.authCalls.push({ method: "deleteUser", args: { id } });
      db.users = db.users.filter((u) => u.id !== id);
      return { data: null, error: null };
    },
  };
  return {
    from: (t: string) => new Query(db, t),
    rpc: async (name: string, args: Record<string, unknown>) => {
      db.rpcCalls.push({ name, args });
      if (name === "replace_talent_languages") {
        const id = args.p_talent_profile_id;
        db.tables.talent_languages = db.table("talent_languages").filter((r) => r.talent_profile_id !== id);
        for (const r of args.p_rows as Row[]) db.table("talent_languages").push({ ...r, talent_profile_id: id });
      }
      return { data: null, error: null };
    },
    auth: { admin },
    storage: { from: () => ({ remove: async () => ({ data: null, error: null }) }) },
  } as unknown as SupabaseClient;
}
