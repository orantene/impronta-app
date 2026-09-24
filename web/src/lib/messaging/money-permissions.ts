import "server-only";


/**
 * S6 (D-MSG-40): the permission keys this lane introduces for the money
 * actions reachable from a thread, plus the two existing read/write actions
 * the brief asked to gate (`messagingCloseLost`, the internal-note read
 * path). There is no pre-existing "messages.request_payment"-style key
 * anywhere in the repo to mirror (grepped `lib/pos`, every migration, and
 * the capability registry at `src/lib/access/capabilities.ts` — nothing
 * matches `messages.*`), so this file defines the vocabulary rather than
 * extending one. See D-MSG-40 in decisions.md for why `staff_permissions`
 * was chosen over the plan/role capability registry.
 */
export const MESSAGING_MONEY_PERMISSIONS = [
  "messages.discount",
  "messages.refund",
  "messages.cancel",
  "messages.close_lost",
  "messages.notes.read",
] as const;

export type MessagingMoneyPermission = (typeof MESSAGING_MONEY_PERMISSIONS)[number];

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

/**
 * Tenant-wide staff ids (active memberships), used both to scope a
 * `staff_permissions` lookup (the table itself carries no `tenant_id`) and to
 * decide whether a tenant has opted into gating a given key at all.
 */
async function activeStaffIds(admin: Admin, tenantId: string): Promise<string[] | null> {
  const { data, error } = await admin
    .from("agency_memberships")
    .select("profile_id")
    .eq("tenant_id", tenantId)
    .eq("status", "active");
  if (error) return null;
  return ((data ?? []) as { profile_id: string | null }[])
    .map((r) => r.profile_id)
    .filter((v): v is string => Boolean(v));
}

/**
 * Whether `userId` may take a gated money action for `tenantId`.
 *
 * OPEN BY DEFAULT, PER TENANT, PER KEY (D-MSG-40): `staff_permissions` has
 * never been seeded anywhere in this codebase (grepped every migration —
 * zero INSERTs) and nothing gates on it today; every tenant's staff can
 * currently do everything this lane is now fencing. Flipping every tenant to
 * closed-by-default the moment this ships would lock every existing agency
 * out of cancelling or refunding from the thread with no onboarding step.
 * So: if NO staff member of this tenant holds ANY row for `permission`, the
 * key is unconfigured and every staff member passes (today's behaviour,
 * unchanged). The moment ANY staff member is granted the key, the tenant has
 * opted in and the gate becomes real: only holders (and `super_admin`) pass.
 * A tenant that wants "only Group can refund" grants `messages.refund` to
 * that one profile; everyone else on that tenant is then refused.
 */
export async function hasMessagingMoneyPermission(
  admin: Admin,
  input: { tenantId: string; userId: string; permission: MessagingMoneyPermission },
): Promise<boolean> {
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("app_role")
    .eq("id", input.userId)
    .maybeSingle();
  if (profileErr) return false;
  if ((profile as { app_role?: string } | null)?.app_role === "super_admin") return true;

  const staffIds = await activeStaffIds(admin, input.tenantId);
  // Defense in depth: `messagingStaff()` already proves the caller is active
  // staff of this tenant before this ever runs, but this function is a
  // standalone gate and should not answer `true` for a caller who isn't on
  // the roster at all just because the tenant hasn't configured the key yet.
  // An unreadable roster is also a deny — never "open because empty" (D-MSG-414).
  if (staffIds == null || staffIds.length === 0 || !staffIds.includes(input.userId)) return false;

  const { data: rows, error: permErr } = await admin
    .from("staff_permissions")
    .select("user_id")
    .eq("permission", input.permission)
    .in("user_id", staffIds);
  if (permErr) return false;
  const grantedIds = new Set(((rows ?? []) as { user_id: string }[]).map((r) => r.user_id));

  if (grantedIds.size === 0) return true; // unconfigured tenant: open
  return grantedIds.has(input.userId);
}
