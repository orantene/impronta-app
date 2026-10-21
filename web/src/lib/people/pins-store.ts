import "server-only";

/**
 * The only reader of register-PIN holders.
 *
 * TUL-1516: the bcrypt hashes used to live in `agencies.settings.people.pins`, a blob every
 * workspace member could read. They now live in `public.staff_pin_hashes` (RLS on, no
 * policy, service role only). Writes still go through `pos_set_staff_pin`, so the hash is
 * born in SQL. This module never selects a hash from the table: callers only learn WHO
 * holds a PIN.
 *
 * Until the migration (20261231423900) is applied the table does not exist: that read is
 * treated as "no rows" and the legacy settings blob is still honoured, so the screens
 * keep working on either side of the apply.
 */

import { logServerError } from "@/lib/server/safe-error";
import type { Admin } from "@/lib/pos/sale-rows";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The user ids with a hash in the legacy `settings.people.pins` blob. */
export function pinHolderIdsFromSettings(settings: unknown): Set<string> {
  if (!isPlainRecord(settings)) return new Set();
  const people = isPlainRecord(settings.people) ? settings.people : null;
  const pins = people && isPlainRecord(people.pins) ? people.pins : null;
  if (!pins) return new Set();
  return new Set(
    Object.entries(pins)
      .filter(([, hash]) => typeof hash === "string" && hash.length > 0)
      .map(([id]) => id),
  );
}

/** Postgres 42P01 / PostgREST PGRST205: the relation is not there yet (migration pending). */
export function isMissingRelation(error: { code?: string | null; message?: string | null }): boolean {
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? "");
}

/** Who holds a register PIN in this workspace: the protected table plus any legacy blob entry. */
export async function loadPinHolderIds(admin: Admin, tenantId: string): Promise<Set<string>> {
  const [table, agency] = await Promise.all([
    admin.from("staff_pin_hashes").select("user_id").eq("tenant_id", tenantId),
    admin.from("agencies").select("settings").eq("id", tenantId).maybeSingle(),
  ]);
  const holders = new Set<string>();
  if (table.error) {
    if (!isMissingRelation(table.error)) logServerError("people.pins-store.table", table.error);
  } else {
    for (const row of (table.data ?? []) as { user_id: string | null }[]) {
      if (row.user_id) holders.add(row.user_id);
    }
  }
  if (agency.error) {
    logServerError("people.pins-store.settings", agency.error);
  } else {
    for (const id of pinHolderIdsFromSettings((agency.data as { settings?: unknown } | null)?.settings)) {
      holders.add(id);
    }
  }
  return holders;
}

export async function tenantHasPinForUser(admin: Admin, tenantId: string, userId: string): Promise<boolean> {
  return (await loadPinHolderIds(admin, tenantId)).has(userId);
}
