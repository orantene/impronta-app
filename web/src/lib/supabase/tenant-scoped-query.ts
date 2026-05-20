import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Tenant-scope guard (Phase 0 ratchet — helper portion).
 *
 * Multi-tenant rows carry a `tenant_id`. Every read/write must be filtered by
 * it; a missed `.eq("tenant_id", …)` is a silent cross-tenant data leak. RLS is
 * the backstop, but service-role clients (`createServiceRoleClient`) bypass RLS
 * entirely, so the application layer is the only guard there.
 *
 * `tenantScopedQuery` is the single sanctioned entry point: it returns a query
 * builder whose every operation is pre-scoped to one tenant. The returned
 * object exposes ONLY scoped operations — there is no method that hands back an
 * unscoped builder — so a caller cannot silently bypass the tenant filter
 * without abandoning this helper entirely (which the Phase 0 lint rule, owned
 * by a separate workstream, flags).
 *
 *   - select / update / delete  → prefiltered with `.eq("tenant_id", tenantId)`
 *   - insert / upsert           → `tenant_id` forced onto every row
 *
 * The builders returned are the native postgrest builders, so the full fluent
 * API (`.eq`, `.in`, `.ilike`, `.is`, `.order`, `.single`, `.maybeSingle`, …)
 * remains available *after* the scope is applied.
 */

const TENANT_COLUMN = "tenant_id";

/** Native `supabase.from(table)` builder for the loosely-typed client used app-wide. */
type FromBuilder = ReturnType<SupabaseClient["from"]>;

type SelectArgs = Parameters<FromBuilder["select"]>;
type UpdateArgs = Parameters<FromBuilder["update"]>;
type DeleteArgs = Parameters<FromBuilder["delete"]>;
type InsertArgs = Parameters<FromBuilder["insert"]>;
type UpsertArgs = Parameters<FromBuilder["upsert"]>;

type SelectBuilder = ReturnType<FromBuilder["select"]>;
type UpdateBuilder = ReturnType<FromBuilder["update"]>;
type DeleteBuilder = ReturnType<FromBuilder["delete"]>;
type InsertBuilder = ReturnType<FromBuilder["insert"]>;
type UpsertBuilder = ReturnType<FromBuilder["upsert"]>;

/**
 * Write payload — one row or many. The app-wide Supabase clients are still
 * constructed untyped at this helper's boundary; the generated `Database`
 * type lives at `@/lib/supabase/database.types` (T2b/Phase A — 2026-05-19)
 * but is not yet threaded through `createClient(...)` everywhere, so per-
 * callsite migrations (Phase C onward) opt in via direct row-type imports
 * rather than retyping the helper API. A row therefore remains an open
 * record at this boundary. Declared explicitly because
 * `Parameters<…["insert"]>` collapses postgrest's overloads to the array
 * form and would reject a single-object payload at call sites.
 */
type WriteRow = Record<string, unknown>;
type WriteValues = WriteRow | WriteRow[];

/**
 * A query builder permanently bound to one tenant. Every method applies the
 * tenant scope before returning the native builder for further chaining.
 */
export interface TenantScopedQuery {
  /** `.select(…)` pre-filtered with `.eq("tenant_id", tenantId)`. */
  select(...args: SelectArgs): SelectBuilder;
  /** `.update(…)` pre-filtered with `.eq("tenant_id", tenantId)`. */
  update(...args: UpdateArgs): UpdateBuilder;
  /** `.delete(…)` pre-filtered with `.eq("tenant_id", tenantId)`. */
  delete(...args: DeleteArgs): DeleteBuilder;
  /** `.insert(…)` with `tenant_id` forced onto every row. */
  insert(values: WriteValues, options?: InsertArgs[1]): InsertBuilder;
  /** `.upsert(…)` with `tenant_id` forced onto every row. */
  upsert(values: WriteValues, options?: UpsertArgs[1]): UpsertBuilder;
}

/** Force `tenant_id` onto a single row or an array of rows for write paths. */
function withTenant<T>(values: T, tenantId: string): T {
  if (Array.isArray(values)) {
    return values.map((row) => ({
      ...(row as Record<string, unknown>),
      [TENANT_COLUMN]: tenantId,
    })) as unknown as T;
  }
  return {
    ...(values as Record<string, unknown>),
    [TENANT_COLUMN]: tenantId,
  } as unknown as T;
}

/**
 * Build a tenant-scoped query against `table`.
 *
 * @param supabase - any Supabase client (RLS-bound or service-role).
 * @param table    - the table name (must have a `tenant_id` column).
 * @param tenantId - the tenant every row is scoped to. Non-optional by design:
 *                   there is no way to construct an unscoped query through this
 *                   API.
 *
 * @example
 *   const { data } = await tenantScopedQuery(admin, "agency_memberships", tenantId)
 *     .select("status, role")
 *     .eq("profile_id", userId)
 *     .maybeSingle();
 */
export function tenantScopedQuery(
  supabase: SupabaseClient,
  table: string,
  tenantId: string,
): TenantScopedQuery {
  return {
    select(...args: SelectArgs): SelectBuilder {
      const [columns, options] = args;
      return supabase
        .from(table)
        .select(columns as string, options)
        .eq(TENANT_COLUMN, tenantId) as SelectBuilder;
    },
    update(...args: UpdateArgs): UpdateBuilder {
      const [values, options] = args;
      return supabase
        .from(table)
        .update(values, options)
        .eq(TENANT_COLUMN, tenantId) as UpdateBuilder;
    },
    delete(...args: DeleteArgs): DeleteBuilder {
      const [options] = args;
      return supabase
        .from(table)
        .delete(options)
        .eq(TENANT_COLUMN, tenantId) as DeleteBuilder;
    },
    insert(values: WriteValues, options?: InsertArgs[1]): InsertBuilder {
      return supabase
        .from(table)
        .insert(
          withTenant(values, tenantId) as unknown as InsertArgs[0],
          options,
        ) as InsertBuilder;
    },
    upsert(values: WriteValues, options?: UpsertArgs[1]): UpsertBuilder {
      return supabase
        .from(table)
        .upsert(
          withTenant(values, tenantId) as unknown as UpsertArgs[0],
          options,
        ) as UpsertBuilder;
    },
  };
}
