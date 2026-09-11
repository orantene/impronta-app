import "server-only";

/**
 * The only reader of `agencies.settings.people.pins`.
 * Writes go through `pos_set_staff_pin` so the hash is born in SQL.
 */

import { logServerError } from "@/lib/server/safe-error";
import type { Admin } from "@/lib/pos/sale-rows";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function pinHashForUser(settings: unknown, userId: string): string | null {
  if (!isPlainRecord(settings)) return null;
  const people = isPlainRecord(settings.people) ? settings.people : null;
  const pins = people && isPlainRecord(people.pins) ? people.pins : null;
  const raw = pins?.[userId];
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export async function tenantHasPinForUser(
  admin: Admin,
  tenantId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await admin.from("agencies").select("settings").eq("id", tenantId).maybeSingle();
  if (error) {
    logServerError("people.pins-store.read", error);
    return false;
  }
  return pinHashForUser((data as { settings?: unknown } | null)?.settings, userId) !== null;
}
