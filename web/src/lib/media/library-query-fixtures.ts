/**
 * library-query-fixtures.ts — the in-memory PostgREST the library tests run on.
 *
 * Extracted from `library-query.test.ts` (2026-08-16) when the per-talent
 * filter's cases took that file past the repo's 800-line cap. Not one line of
 * behaviour moved: this is the same fake, exported.
 *
 * WHY IT IS A FAKE AND NOT A STUB — the property that matters and is easy to
 * lose: it APPLIES the filters the query layer sends, including the keyset
 * `or(...)` cursor and Postgres's NULL semantics for `NOT IN`. A stub that
 * ignored filters would pass every test here while the real query returned the
 * wrong rows, which is exactly the class of bug these tests exist for.
 *
 * It is NOT a `.test.ts` file on purpose: no lane should try to run it as a
 * suite, and `test:media-ownership` names its files explicitly.
 */

export const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
export const TENANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
export const TALENT = "11111111-1111-1111-1111-111111111111";

export type Row = Record<string, unknown>;

type Recorded = {
  table: string;
  filters: Array<[string, string, unknown]>;
  ors: string[];
};

/**
 * Minimal in-memory PostgREST. Supports the operators the query layer uses:
 * eq / neq / is / in / not(in|is) / or(...) / order / limit, plus
 * `{ count: "exact", head: true }`.
 */
export function makeFakeSupabase(tables: Record<string, Row[]>) {
  const recorded: Recorded[] = [];

  function evalOr(row: Row, expression: string): boolean {
    // `or(a,b,and(c,d))` → split on top-level commas.
    const inner = expression.startsWith("or(")
      ? expression.slice(3, -1)
      : expression;
    const parts: string[] = [];
    let depth = 0;
    let current = "";
    for (const ch of inner) {
      if (ch === "(") depth += 1;
      if (ch === ")") depth -= 1;
      if (ch === "," && depth === 0) {
        parts.push(current);
        current = "";
        continue;
      }
      current += ch;
    }
    if (current) parts.push(current);
    return parts.some((part) => evalClause(row, part));
  }

  function evalClause(row: Row, clause: string): boolean {
    if (clause.startsWith("and(")) {
      const inner = clause.slice(4, -1);
      return inner.split(",").every((sub) => evalClause(row, sub));
    }
    if (clause.startsWith("or(")) return evalOr(row, clause);
    const first = clause.indexOf(".");
    const column = clause.slice(0, first);
    const rest = clause.slice(first + 1);
    // `not.in` is the one two-word operator this fake sees.
    const op = rest.startsWith("not.in.")
      ? "not.in"
      : rest.slice(0, rest.indexOf("."));
    const raw = rest.slice(op.length + 1);
    const value = row[column];
    switch (op) {
      case "eq":
        return String(value) === raw;
      case "is":
        return raw === "null" ? value === null || value === undefined : false;
      case "lt":
        return String(value) < raw;
      case "in": {
        const list = raw.replace(/^\(|\)$/g, "").split(",");
        return list.includes(String(value));
      }
      case "not.in": {
        // Postgres semantics on purpose: `NULL NOT IN (…)` is NULL, i.e. NOT
        // TRUE. A fake that returned `true` here would hide the exact bug the
        // brand-asset test below pins.
        if (value === null || value === undefined) return false;
        const list = raw.replace(/^\(|\)$/g, "").split(",");
        return !list.includes(String(value));
      }
      case "ilike": {
        const needle = raw.replace(/\*/g, "").toLowerCase();
        return typeof value === "string" && value.toLowerCase().includes(needle);
      }
      default:
        return false;
    }
  }

  function from(table: string) {
    const rec: Recorded = { table, filters: [], ors: [] };
    recorded.push(rec);
    let head = false;
    let wantCount = false;
    const orders: Array<[string, boolean]> = [];
    let cap = Number.POSITIVE_INFINITY;

    function run() {
      let rows = (tables[table] ?? []).filter((row) =>
        rec.filters.every(([column, op, value]) => {
          const actual = row[column];
          if (op === "eq") return actual === value;
          if (op === "neq") return actual !== value;
          if (op === "is") return value === null ? actual == null : actual === value;
          if (op === "in") return (value as unknown[]).map(String).includes(String(actual));
          if (op === "not-in") {
            const list = String(value).replace(/^\(|\)$/g, "").split(",");
            return actual == null || !list.includes(String(actual));
          }
          if (op === "not-is") return value === null ? actual != null : actual !== value;
          return true;
        }),
      );
      rows = rows.filter((row) => rec.ors.every((expr) => evalOr(row, expr)));
      for (const [column, ascending] of [...orders].reverse()) {
        rows = [...rows].sort((a, b) => {
          const av = String(a[column] ?? "");
          const bv = String(b[column] ?? "");
          return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
        });
      }
      const count = rows.length;
      if (head) return { data: null, error: null, count };
      return {
        data: rows.slice(0, cap),
        error: null,
        count: wantCount ? count : null,
      };
    }

    const builder: Record<string, unknown> = {
      select: (_columns: string, options?: { count?: string; head?: boolean }) => {
        head = options?.head === true;
        wantCount = !!options?.count;
        return builder;
      },
      eq: (c: string, v: unknown) => (rec.filters.push([c, "eq", v]), builder),
      neq: (c: string, v: unknown) => (rec.filters.push([c, "neq", v]), builder),
      is: (c: string, v: unknown) => (rec.filters.push([c, "is", v]), builder),
      in: (c: string, v: unknown) => (rec.filters.push([c, "in", v]), builder),
      not: (c: string, op: string, v: unknown) => (
        rec.filters.push([c, `not-${op}`, v]), builder
      ),
      or: (expression: string) => (rec.ors.push(expression), builder),
      order: (c: string, o: { ascending: boolean }) => (
        orders.push([c, o.ascending]), builder
      ),
      limit: (n: number) => {
        cap = n;
        return builder;
      },
      then: (resolve: (v: unknown) => void) => resolve(run()),
    };
    return builder;
  }

  return {
    supabase: {
      from,
      storage: {
        from: () => ({
          getPublicUrl: (path: string) => ({
            data: { publicUrl: `https://cdn.test/${path}` },
          }),
        }),
      },
    } as never,
    recorded,
  };
}

/** `count` assets, newest first: asset-000 is the newest, asset-N-1 the oldest. */
export function makeAssets(count: number, overrides: (i: number) => Row = () => ({})): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `asset-${String(i).padStart(3, "0")}`,
    tenant_id: TENANT_A,
    owner_talent_profile_id: null,
    bucket_id: "media-public",
    storage_path: `library/photo-${String(i).padStart(3, "0")}.jpg`,
    public_url: `https://cdn.test/photo-${String(i).padStart(3, "0")}.jpg`,
    variant_kind: "original",
    approval_state: "approved",
    purpose: "cms",
    asset_kind: "image",
    watermark_override_json: null,
    sort_order: i,
    width: 800,
    height: 1000,
    file_size: 1000,
    file_size_bytes: 1000,
    byte_size: 1000,
    mime: "image/jpeg",
    mime_type: "image/jpeg",
    original_filename: `photo-${String(i).padStart(3, "0")}.jpg`,
    alt: null,
    tags: [],
    metadata: {},
    source_media_asset_id: null,
    // Descending id order == descending created_at order.
    created_at: `2026-01-01T00:00:${String(99 - i).padStart(2, "0")}.000Z`,
    deleted_at: null,
    ownership_kind: "agency",
    owner_tenant_id: TENANT_A,
    uploaded_by_user_id: null,
    talent_profiles: null,
    ...overrides(i),
  }));
}
