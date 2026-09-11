import "server-only";

/**
 * The people a till can name: the workspace's active members, with whether
 * each one has a register PIN (`agencies.settings.people.pins[userId]`, the
 * hash written by `pos_set_staff_pin`; the hash itself never leaves here).
 *
 * Read by the lock screen (`POSLock`: who can unlock this till), the
 * manager-approval dialog (`POSManagerApproval`: which managers can
 * approve), the change-server sheet (`POSChangeServer`) and the drawer's
 * hand-over card (`POSCashMovements`).
 */

import { logServerError } from "@/lib/server/safe-error";
import type { Admin } from "./sale-rows";

export type PosStaffMember = {
  readonly userId: string;
  readonly name: string;
  readonly role: string;
  readonly manager: boolean;
  readonly hasPin: boolean;
};

const MANAGER_ROLES = new Set(["owner", "admin", "manager"]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The user ids that hold a register PIN, from the settings blob. */
export function pinHolderIdsFromSettings(settings: unknown): Set<string> {
  if (!isPlainRecord(settings)) return new Set();
  const people = isPlainRecord(settings.people) ? settings.people : null;
  const pins = people && isPlainRecord(people.pins) ? people.pins : null;
  if (!pins) return new Set();
  return new Set(Object.entries(pins).filter(([, hash]) => typeof hash === "string" && hash.length > 0).map(([id]) => id));
}

export async function listPosStaff(
  admin: Admin,
  tenantId: string,
): Promise<{ ok: true; staff: PosStaffMember[] } | { ok: false; reason: "unavailable" }> {
  const [members, agency] = await Promise.all([
    admin
      .from("agency_memberships")
      .select("profile_id, role, status, profiles:profile_id(display_name)")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .order("created_at", { ascending: true }),
    admin.from("agencies").select("settings").eq("id", tenantId).maybeSingle(),
  ]);
  if (members.error) {
    logServerError("pos.staff.members", members.error);
    return { ok: false, reason: "unavailable" };
  }
  if (agency.error) logServerError("pos.staff.settings", agency.error);
  const holders = pinHolderIdsFromSettings((agency.data as { settings?: unknown } | null)?.settings);

  type Row = {
    profile_id: string;
    role: string | null;
    profiles: { display_name: string | null } | { display_name: string | null }[] | null;
  };
  const staff: PosStaffMember[] = ((members.data ?? []) as Row[]).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const role = (row.role ?? "viewer").toLowerCase();
    return {
      userId: row.profile_id,
      name: profile?.display_name?.trim() || "",
      role,
      manager: MANAGER_ROLES.has(role),
      hasPin: holders.has(row.profile_id),
    };
  });
  return { ok: true, staff };
}
