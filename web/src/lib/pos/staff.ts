import "server-only";

/**
 * The people a till can name: the workspace's active members, with whether
 * each one has a register PIN (`staff_pin_hashes`, written by
 * `pos_set_staff_pin`; the hash itself never leaves SQL).
 *
 * Read by the lock screen (`POSLock`: who can unlock this till), the
 * manager-approval dialog (`POSManagerApproval`: which managers can
 * approve), the change-server sheet (`POSChangeServer`) and the drawer's
 * hand-over card (`POSCashMovements`).
 */

import { loadPinHolderIds, pinHolderIdsFromSettings } from "@/lib/people/pins-store";
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

export { pinHolderIdsFromSettings };

export async function listPosStaff(
  admin: Admin,
  tenantId: string,
): Promise<{ ok: true; staff: PosStaffMember[] } | { ok: false; reason: "unavailable" }> {
  const [members, holders] = await Promise.all([
    admin
      .from("agency_memberships")
      .select("profile_id, role, status, profiles:profile_id(display_name)")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .order("created_at", { ascending: true }),
    loadPinHolderIds(admin, tenantId),
  ]);
  if (members.error) {
    logServerError("pos.staff.members", members.error);
    return { ok: false, reason: "unavailable" };
  }

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
