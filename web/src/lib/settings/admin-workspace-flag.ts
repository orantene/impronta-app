import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * Settings keys read by this module. Both rows are seeded by migration
 * 20260430000000_ff_admin_workspace_v3_flag.sql.
 */
const KEYS = [
  "ff_admin_workspace_v3",
  "ff_admin_workspace_v3_allowlist",
] as const;

/**
 * Coerce a jsonb value into a boolean flag. Accepts:
 *   - raw boolean (`true` / `false`)
 *   - object shaped `{ enabled: boolean }` (matches existing `asFlag` convention
 *     in ai-feature-flags.ts so an admin UI could later reuse the same payload shape)
 * Anything else → `false` (safe-by-default).
 */
export function asFlag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (value && typeof value === "object" && "enabled" in (value as object)) {
    return Boolean((value as { enabled?: boolean }).enabled);
  }
  return false;
}

/**
 * Coerce a jsonb value into a Set of user ids. Accepts:
 *   - JSON array of strings (non-empty, trimmed).
 *   - Anything else → empty set.
 */
export function asAllowlist(value: unknown): ReadonlySet<string> {
  if (!Array.isArray(value)) return new Set();
  const ids = new Set<string>();
  for (const entry of value) {
    if (typeof entry === "string" && entry.trim().length > 0) {
      ids.add(entry.trim());
    }
  }
  return ids;
}

/**
 * Pure resolver — kept separate from DB I/O so tests can exercise every branch
 * without mocking the Supabase client.
 *
 * Resolution order:
 *   1. Global flag `true` → enabled for everyone.
 *   2. Global flag `false` + userId present in allowlist → enabled.
 *   3. Otherwise → disabled (old workspace renders).
 */
export function resolveWorkspaceV3Enabled(
  rawSettings: { globalEnabled: unknown; allowlist: unknown },
  userId: string | null | undefined,
): boolean {
  if (asFlag(rawSettings.globalEnabled)) return true;
  if (!userId) return false;
  return asAllowlist(rawSettings.allowlist).has(userId);
}

/**
 * Reads `ff_admin_workspace_v3` + `ff_admin_workspace_v3_allowlist` from
 * `public.settings` via the service role client (those keys are not on the
 * public RLS allowlist) and resolves whether the V3 workspace should render
 * for the given user.
 *
 * Safe-by-default: any failure (missing service role key, query error, missing
 * rows) returns `false`, which keeps the old workspace rendering. This matches
 * the same defensive pattern as `getAiFeatureFlags`.
 *
 * Called from server components and server actions — the helper cannot run in
 * the browser (the service role client is a no-op there). Client components
 * receive the resolved boolean as a prop from a server component ancestor.
 */
export async function isWorkspaceV3Enabled(
  userId: string | null | undefined,
): Promise<boolean> {
  const supabase = createServiceRoleClient();
  if (!supabase) return false;

  const { data, error } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", [...KEYS]);

  if (error || !data) return false;

  const map = new Map<string, unknown>();
  for (const row of data) {
    map.set(row.key, row.value);
  }

  return resolveWorkspaceV3Enabled(
    {
      globalEnabled: map.get("ff_admin_workspace_v3"),
      allowlist: map.get("ff_admin_workspace_v3_allowlist"),
    },
    userId,
  );
}
