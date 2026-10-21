/**
 * Typed fake of `public.staff_permissions` in BOTH shapes (TUL-1813).
 *
 *   - "legacy": no tenant_id column. Any query that references tenant_id
 *     answers PostgREST's 42703 "column staff_permissions.tenant_id does not
 *     exist", like the real table before migration 425800.
 *   - "scoped": tenant_id present; eq/in filter on it.
 *
 * Both shapes reject maybeSingle()/single() when more than one row matches,
 * the way PostgREST does, so a reader that still uses it fails the test.
 */

export type PermissionRow = { user_id: string; permission: string; tenant_id?: string };

type Result = { data: unknown; error: { code?: string; message?: string } | null };

export function permissionsTable(shape: "legacy" | "scoped", rows: PermissionRow[]) {
  const queries: string[] = [];
  const from = (_table: string) => {
    const filters: Array<[string, (v: unknown) => boolean]> = [];
    let touchesTenant = false;
    const q = {
      select: (_cols: string) => q,
      eq: (col: string, val: string) => {
        if (col === "tenant_id") touchesTenant = true;
        filters.push([col, (v) => v === val]);
        return q;
      },
      in: (col: string, vals: string[]) => {
        filters.push([col, (v) => vals.includes(v as string)]);
        return q;
      },
      maybeSingle: () => {
        const r = run();
        const list = (r.data ?? []) as unknown[];
        if (list.length > 1) {
          return Promise.resolve<Result>({ data: null, error: { code: "PGRST116", message: "more than one row" } });
        }
        return Promise.resolve<Result>({ data: list[0] ?? null, error: r.error });
      },
      then: <T>(resolve: (v: Result) => T, reject?: (e: unknown) => T) =>
        Promise.resolve(run()).then(resolve, reject),
    };
    const run = (): Result => {
      queries.push(touchesTenant ? "tenant" : "plain");
      if (shape === "legacy" && touchesTenant) {
        return {
          data: null,
          error: { code: "42703", message: "column staff_permissions.tenant_id does not exist" },
        };
      }
      const data = rows.filter((r) => filters.every(([c, f]) => f((r as Record<string, unknown>)[c])));
      return { data, error: null };
    };
    return q;
  };
  return { table: { from }, queries };
}
