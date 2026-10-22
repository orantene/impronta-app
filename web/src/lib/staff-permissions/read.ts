/**
 * Tenant-scoped reader for `public.staff_permissions` (TUL-1813).
 *
 * Migration 20261231425800 adds `tenant_id` to the table and multiplies a
 * multi-workspace user's rows (one per membership). This reader is correct
 * under BOTH table shapes so the code can deploy BEFORE the migration:
 *
 *   - column present: filters `.eq("tenant_id", tenantId)`.
 *   - column absent (pre-migration): the tenant-filtered query fails with
 *     "column ... tenant_id does not exist"; we retry once without it. The
 *     caller's `userIds` are already the tenant's active staff, which is the
 *     only tenant scoping the old shape ever had.
 *
 * It never uses maybeSingle()/single(): a (user_id, permission) pair can hold
 * several rows across tenants, and a single-row read would error on them.
 */

export type StaffPermissionRow = { user_id: string; permission: string };

type ErrorLike = { code?: string | null; message?: string | null } | null;

export interface StaffPermissionsQuery extends PromiseLike<{ data: unknown; error: ErrorLike }> {
  eq(column: string, value: string): StaffPermissionsQuery;
  in(column: string, values: string[]): StaffPermissionsQuery;
}

export interface StaffPermissionsClient {
  from(table: string): { select(columns: string): StaffPermissionsQuery };
}

/** True when PostgREST/Postgres says `staff_permissions.tenant_id` does not exist yet. */
export function isMissingTenantColumnError(error: ErrorLike): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  if (!msg.includes("tenant_id")) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "PGRST200" ||
    msg.includes("does not exist") ||
    msg.includes("schema cache")
  );
}

export async function selectStaffPermissions(
  client: StaffPermissionsClient,
  input: { tenantId: string; userIds: string[]; permission?: string },
): Promise<{ rows: StaffPermissionRow[]; error: ErrorLike }> {
  const run = (tenantScoped: boolean) => {
    let q = client.from("staff_permissions").select("user_id, permission");
    if (input.permission) q = q.eq("permission", input.permission);
    q = q.in("user_id", input.userIds);
    if (tenantScoped) q = q.eq("tenant_id", input.tenantId);
    return q;
  };

  let res = await run(true);
  if (res.error && isMissingTenantColumnError(res.error)) {
    res = await run(false);
  }
  if (res.error) return { rows: [], error: res.error };
  return { rows: (res.data ?? []) as StaffPermissionRow[], error: null };
}
