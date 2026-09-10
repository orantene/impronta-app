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
 * AN INVITATION IS NOT A MEMBER. `TeamMember.status` distinguishes an
 * accepted member from one still on `pending_acceptance`, and somebody who
 * has not accepted cannot sign in, so they hold no role and reach no selling
 * mode. The member count counts the accepted people; the pending ones get
 * their own line. Counting them together would be a correct count over the
 * wrong rows.
 *
 * NO SERVER ROUND TRIP. Every input is already on the caller's hands (team
 * members, the workspace's enabled POS modes) or is static product policy
 * (the role ladder, in `lib/settings/role-members.ts`). A card with nothing
 * to fetch has nothing to fail loading.
 *
 * The role ladder is mirrored in `lib/settings/role-members.ts` rather than
 * imported from `shell/internal/state/types.ts`, on purpose: a settings card
 * living under `components/admin/settings/` stays out of the shell's
 * `internal/` tree, the same boundary `lib/pos/modes.ts` itself holds by
 * mirroring `TenantRoleKey` instead of importing it (see that file's header).
 */

import { useT, useTPlural } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { modesForPerson, POS_MODE_META, type PosMode } from "@/lib/pos/modes";
import {
  groupMembersByRole,
  SETTINGS_ROLE_ORDER,
  type RoleMember,
} from "@/lib/settings/role-members";

export type RolesLimitsMember = RoleMember;

const K = "dashboard.adminWorkspace.rolesLimits";

export function RolesLimitsCard({
  members,
  workspacePosModes,
}: {
  members: readonly RolesLimitsMember[];
  workspacePosModes: readonly PosMode[];
}) {
  const t = useT();
  // The member count is a counted noun: "1 member" / "3 members", and in
  // French "0 membre". `useTPlural` reads memberCount.one / .other under the
  // reader's own plural rule; a single `{count} member` string rendered
  // "0 member" and "3 miembro" on this card.
  const tPlural = useTPlural();

  // An invitation nobody accepted is not a member: it counts separately, on
  // its own line, rather than inflating "3 members" with people who cannot
  // sign in yet. See `lib/settings/role-members.ts`.
  const membersByRole = groupMembersByRole(members);

  return (
    <div data-testid="roles-limits-card" className="mb-2 rounded-admin-lg border border-admin-border-soft bg-admin-card p-4">
      <div className="text-[13px] font-semibold text-admin-ink">{t(`${K}.rolesHeading`)}</div>
      <div className="mt-0.5 text-[12px] text-admin-ink-muted">{t(`${K}.rolesDesc`)}</div>

      {workspacePosModes.length === 0 && (
        <div data-testid="roles-limits-pos-off" className="mt-2 text-[11.5px] leading-relaxed text-admin-ink-muted">
          {t(`${K}.posOffNotice`)}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {SETTINGS_ROLE_ORDER.map((role) => {
          const roleMembers = membersByRole.get(role)?.active ?? [];
          const invitedMembers = membersByRole.get(role)?.invited ?? [];
          const reachableModes = modesForPerson({
            role,
            workspaceEnabledModes: workspacePosModes,
          }).filter((mode) => POS_MODE_META[mode].built);

          return (
            <div key={role} className="rounded-admin-md border border-admin-border bg-admin-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[13px] font-semibold text-admin-ink">{t(`${K}.roleNames.${role}`)}</div>
                <span className="shrink-0 text-[11px] text-admin-ink-muted">
                  {tPlural(`${K}.memberCount`, roleMembers.length)}
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
              {invitedMembers.length > 0 && (
                <div data-testid={`roles-limits-invited-${role}`} className="mt-2">
                  <div className="text-[11px] text-admin-ink-muted">
                    {tPlural(`${K}.invitedCount`, invitedMembers.length)}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {invitedMembers.map((m) => (
                      <span
                        key={m.id}
                        className="rounded-full border border-dashed border-admin-border px-2 py-0.5 text-[11px] text-admin-ink-muted"
                      >
                        {m.name}
                      </span>
                    ))}
                  </div>
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
