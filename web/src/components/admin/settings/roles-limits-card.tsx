"use client";

/**
 * RolesLimitsCard — Settings › Roles & limits (W22, money.md §2).
 *
 * TWO REAL DATA SOURCES, ONE HONEST GAP:
 *
 *   - Which point-of-sale modes reach each role: `modesForPerson`
 *     (`lib/pos/modes.ts`) — the SAME function `PosFrame` and the mobile nav
 *     already call to decide what a signed-in person actually sees. Not a
 *     restatement; the real gate.
 *   - Who holds each role: the workspace's own team list, passed in as a
 *     prop rather than fetched again — it is already loaded once for the
 *     Team group on this same page.
 *   - Per-person POS action LIMITS (a discount cap, a refund ceiling) are
 *     NOT tracked anywhere in this database today. money.md §3 names this
 *     the same gap as the People slice's Access hat: "Not in the database
 *     yet: the POS-specific role layer... that M31's 'get approval' would
 *     check against." This card says so in the copy rather than drawing a
 *     limits table with nothing behind it.
 *
 * NO SERVER ROUND TRIP. Every input is already on the caller's hands (team
 * members, the workspace's enabled POS modes) or is static product policy
 * (the role ladder, mirrored below — see the note by `ROLE_ORDER`). A card
 * with nothing to fetch has nothing to fail loading.
 *
 * `Role` is mirrored here rather than imported from `shell/internal/state
 * /types.ts`, on purpose: a settings card living under `components/admin
 * /settings/` stays out of the shell's `internal/` tree, the same boundary
 * `lib/pos/modes.ts` itself holds by mirroring `TenantRoleKey` instead of
 * importing it (see that file's header).
 */

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { modesForPerson, POS_MODE_META, type PosMode } from "@/lib/pos/modes";

const ROLE_ORDER = ["viewer", "editor", "manager", "admin", "owner"] as const;
type WorkspaceRole = (typeof ROLE_ORDER)[number];

export type RolesLimitsMember = {
  readonly id: string;
  readonly name: string;
  readonly role: WorkspaceRole;
};

const K = "dashboard.adminWorkspace.rolesLimits";

export function RolesLimitsCard({
  members,
  workspacePosModes,
}: {
  members: readonly RolesLimitsMember[];
  workspacePosModes: readonly PosMode[];
}) {
  const t = useT();

  const membersByRole = new Map<WorkspaceRole, RolesLimitsMember[]>();
  for (const role of ROLE_ORDER) membersByRole.set(role, []);
  for (const member of members) membersByRole.get(member.role)?.push(member);

  return (
    <div data-testid="roles-limits-card" className="mb-2 rounded-admin-lg border border-admin-border-soft bg-admin-card p-4">
      <div className="text-[13px] font-semibold text-admin-ink">{t(`${K}.rolesHeading`)}</div>
      <div className="mt-0.5 text-[12px] text-admin-ink-muted">{t(`${K}.rolesDesc`)}</div>

      <div className="mt-3 flex flex-col gap-2">
        {ROLE_ORDER.map((role) => {
          const roleMembers = membersByRole.get(role) ?? [];
          const reachableModes = modesForPerson({
            role,
            workspaceEnabledModes: workspacePosModes,
          }).filter((mode) => POS_MODE_META[mode].built);

          return (
            <div key={role} className="rounded-admin-md border border-admin-border bg-admin-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[13px] font-semibold text-admin-ink">{t(`${K}.roleNames.${role}`)}</div>
                <span className="shrink-0 text-[11px] text-admin-ink-muted">
                  {interpolate(t(`${K}.memberCount`), { count: roleMembers.length })}
                </span>
              </div>
              <div className="mt-0.5 text-[12px] text-admin-ink-muted">{t(`${K}.roleDescriptions.${role}`)}</div>
              <div className="mt-2 text-[11.5px] text-admin-ink-muted">
                {reachableModes.length > 0
                  ? interpolate(t(`${K}.posReach`), {
                      modes: reachableModes.map((m) => t(`dashboard.adminWorkspace.posModes.modes.${m}.label`)).join(", "),
                    })
                  : t(`${K}.posReachNone`)}
              </div>
              {roleMembers.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {roleMembers.map((m) => (
                    <span key={m.id} className="rounded-full bg-admin-surface-alt px-2 py-0.5 text-[11px] text-admin-ink">
                      {m.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 border-t border-admin-border-soft pt-3">
        <div className="text-[12px] font-semibold text-admin-ink">{t(`${K}.limitsHeading`)}</div>
        <div className="mt-0.5 text-[11.5px] leading-relaxed text-admin-ink-muted">{t(`${K}.limitsGap`)}</div>
      </div>
    </div>
  );
}
