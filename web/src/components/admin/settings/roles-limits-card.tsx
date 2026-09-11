"use client";

/**
 * RolesLimitsCard — Settings › Roles & limits (W22, money.md §2).
 *
 * THE BOARD IS A MATRIX: one row per action, one column per role, and the
 * cell is what the server enforces. Two real data sources fill it:
 *
 *   - Which point-of-sale modes reach each role: `modesForPerson`
 *     (`lib/pos/modes.ts`), the SAME function `PosFrame` and the mobile nav
 *     call to decide what a signed-in person actually sees.
 *   - Which actions each role may take: `roleGrantsCapability`
 *     (`lib/access/roles.ts`), the SAME table `userHasCapability` checks on
 *     every server action. A row here is a capability key with a plain label,
 *     so the matrix can never disagree with a refusal.
 *
 * The board's rows the engine has no gate for (comp / void, a manual
 * discount cap, a drawer, voiding a sent item, moving tables, collecting
 * another way, per-role customer fields, a re-authorising switch) are drawn
 * as "not tracked" rows so an operator sees the gap where the board draws
 * the rule; money.md §3 names this the same gap as the People slice's Access
 * hat. Save is disabled with that sentence: there is nothing to save yet.
 *
 * Who holds each role is the workspace's own team list, passed in as a prop
 * rather than fetched again. An invitation is not a member: `status`
 * separates accepted people from `pending_acceptance`, who hold no role.
 *
 * The role ladder is mirrored in `lib/settings/role-members.ts` rather than
 * imported from `shell/internal/state/types.ts`, on purpose: a settings card
 * living under `components/admin/settings/` stays out of the shell's
 * `internal/` tree.
 */

import { useT, useTPlural } from "@/i18n/use-t";
import { roleGrantsCapability, type TenantRoleKey } from "@/lib/access/roles";
import type { CapabilityKey } from "@/lib/access/capabilities";
import { modesForPerson, POS_MODE_META, type PosMode } from "@/lib/pos/modes";
import { groupMembersByRole, SETTINGS_ROLE_ORDER, type RoleMember } from "@/lib/settings/role-members";
import { CustomAmountLimit } from "./custom-amount-limit";

export type RolesLimitsMember = RoleMember;

const K = "dashboard.adminWorkspace.rolesLimits";

/** Owner first, as the board reads left to right. */
const COLUMNS: readonly TenantRoleKey[] = [...SETTINGS_ROLE_ORDER].reverse();

type ActionRow =
  | { id: string; kind: "modes" }
  | { id: string; kind: "capability"; capability: CapabilityKey }
  | { id: string; kind: "notTracked" };

/** The board's rows, each on the gate that enforces it, or said to be untracked. */
const ROWS: readonly ActionRow[] = [
  { id: "openPosModes", kind: "modes" },
  { id: "requestPayment", kind: "capability", capability: "booking.payment.request" },
  { id: "markReceived", kind: "capability", capability: "booking.payment.mark_received" },
  { id: "refund", kind: "capability", capability: "booking.payment.refund" },
  { id: "compVoid", kind: "notTracked" },
  { id: "manualDiscount", kind: "notTracked" },
  { id: "drawer", kind: "notTracked" },
  { id: "voidSentItem", kind: "notTracked" },
  { id: "moveTables", kind: "notTracked" },
  { id: "exceptionCollect", kind: "notTracked" },
  { id: "customerFields", kind: "capability", capability: "view_private_client_data" },
  { id: "inviteRemove", kind: "capability", capability: "manage_memberships" },
  { id: "billing", kind: "capability", capability: "manage_billing" },
  { id: "switchRole", kind: "notTracked" },
];

export function RolesLimitsCard({
  members,
  workspacePosModes,
  onInvite,
}: {
  members: readonly RolesLimitsMember[];
  workspacePosModes: readonly PosMode[];
  /** Opens the invitation the Team drawer sends; absent when the caller has no drawer. */
  onInvite?: () => void;
}) {
  const t = useT();
  const tPlural = useTPlural();
  const membersByRole = groupMembersByRole(members);

  const modesFor = (role: TenantRoleKey) =>
    modesForPerson({ role, workspaceEnabledModes: workspacePosModes })
      .filter((mode) => POS_MODE_META[mode].built)
      .map((m) => t(`dashboard.adminWorkspace.posModes.modes.${m}.label`));

  return (
    <div data-testid="roles-limits-card" className="mb-2 flex flex-col gap-[14px] font-admin-body">
      <div className="flex items-start justify-between gap-[12px]">
        <div>
          <div className="text-[18px] font-semibold tracking-[-0.02em] text-admin-ink">{t(`${K}.rolesHeading`)}</div>
          <div className="mt-[2px] text-[12.5px] text-admin-ink-muted">{t(`${K}.rolesDesc`)}</div>
        </div>
        <div className="flex shrink-0 items-center gap-[8px]">
          {onInvite ? (
            <button
              type="button"
              data-testid="roles-limits-invite"
              className="inline-flex h-[34px] cursor-pointer items-center rounded-[9px] border border-admin-border bg-admin-card px-[14px] text-admin-13 font-semibold text-admin-ink hover:border-admin-border-strong"
              onClick={onInvite}
            >
              {t(`${K}.invite`)}
            </button>
          ) : null}
          <button
            type="button"
            disabled
            title={t(`${K}.limitsGap`)}
            data-not-wired="true"
            data-testid="roles-limits-save"
            className="inline-flex h-[34px] cursor-not-allowed items-center rounded-[9px] border border-admin-brand bg-admin-brand px-[14px] text-admin-13 font-semibold text-white opacity-50"
          >
            {t(`${K}.save`)}
          </button>
        </div>
      </div>

      {workspacePosModes.length === 0 && (
        <div data-testid="roles-limits-pos-off" className="rounded-[9px] bg-admin-surface-alt px-[10px] py-[8px] text-[12px] leading-relaxed text-admin-ink-muted">
          {t(`${K}.posOffNotice`)}
        </div>
      )}

      <div className="overflow-x-auto rounded-[14px] border border-admin-border bg-admin-card">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th scope="col" className="border-b border-admin-border px-[14px] py-[10px] text-left text-admin-11 font-semibold uppercase tracking-[0.05em] text-admin-ink-muted">
                {t(`${K}.col.action`)}
              </th>
              {COLUMNS.map((role) => (
                <th key={role} scope="col" className="border-b border-admin-border px-[14px] py-[10px] text-left text-admin-11 font-semibold uppercase tracking-[0.05em] text-admin-ink-muted">
                  {t(`${K}.roleNames.${role}`)}
                  <span className="block font-medium normal-case tracking-normal text-admin-ink-dim">
                    {tPlural(`${K}.memberCount`, membersByRole.get(role)?.active.length ?? 0)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.id} data-testid={`roles-limits-row-${row.id}`} data-not-wired={row.kind === "notTracked" ? "true" : undefined}>
                <td className="whitespace-nowrap border-b border-admin-border-soft px-[14px] py-[9px] font-semibold text-admin-ink">
                  {t(`${K}.actions.${row.id}`)}
                  {row.kind === "notTracked" ? <span className="block text-[11px] font-normal text-admin-ink-dim">{t(`${K}.notTracked`)}</span> : null}
                </td>
                {COLUMNS.map((role) => (
                  <td key={role} className="border-b border-admin-border-soft px-[14px] py-[9px]">
                    <Cell row={row} role={role} modesFor={modesFor} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-[16px]">
        <div className="rounded-[14px] border border-admin-border bg-admin-card px-[16px] py-[6px]">
          <Fact label={t(`${K}.facts.locationScope`)} value={t(`${K}.facts.locationScopeValue`)} />
          <Fact label={t(`${K}.facts.pin`)} value={t(`${K}.facts.pinValue`)} />
          <Fact label={t(`${K}.facts.drawerOwnership`)} value={t(`${K}.facts.drawerOwnershipValue`)} />
        </div>
        <div className="rounded-[14px] border border-admin-border bg-admin-card px-[16px] py-[6px]">
          <Fact label={t(`${K}.facts.talent`)} value={t(`${K}.facts.talentValue`)} />
          <Fact label={t(`${K}.facts.crossBusiness`)} value={t(`${K}.facts.crossBusinessValue`)} />
          <Fact label={t(`${K}.facts.audit`)} value={t(`${K}.facts.auditValue`)} />
        </div>
      </div>

      {/* Who holds each role, and who is still only invited */}
      <div className="grid grid-cols-5 gap-[8px]">
        {COLUMNS.map((role) => {
          const active = membersByRole.get(role)?.active ?? [];
          const invited = membersByRole.get(role)?.invited ?? [];
          return (
            <div key={role} className="rounded-[10px] border border-admin-border-soft bg-admin-surface px-[10px] py-[8px]">
              <div className="text-[12px] font-semibold text-admin-ink">{t(`${K}.roleNames.${role}`)}</div>
              <div className="mt-[2px] text-[11px] leading-[1.4] text-admin-ink-muted">{t(`${K}.roleDescriptions.${role}`)}</div>
              {active.length > 0 && (
                <div className="mt-[6px] flex flex-wrap gap-[4px]">
                  {active.map((m) => (
                    <span key={m.id} className="rounded-full bg-admin-surface-alt px-[8px] py-[2px] text-[11px] text-admin-ink">
                      {m.name}
                    </span>
                  ))}
                </div>
              )}
              {invited.length > 0 && (
                <div data-testid={`roles-limits-invited-${role}`} className="mt-[6px]">
                  <div className="text-[11px] text-admin-ink-muted">{tPlural(`${K}.invitedCount`, invited.length)}</div>
                  <div className="mt-[4px] flex flex-wrap gap-[4px]">
                    {invited.map((m) => (
                      <span key={m.id} className="rounded-full border border-dashed border-admin-border px-[8px] py-[2px] text-[11px] text-admin-ink-muted">
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

      <div className="border-t border-admin-border-soft pt-[10px]">
        <div className="text-[12px] font-semibold text-admin-ink">{t(`${K}.limitsHeading`)}</div>
        <div className="mt-[2px] text-[11.5px] leading-relaxed text-admin-ink-muted">{t(`${K}.limitsGap`)}</div>
      </div>
      <CustomAmountLimit />
    </div>
  );
}

function Cell({ row, role, modesFor }: { row: ActionRow; role: TenantRoleKey; modesFor: (role: TenantRoleKey) => string[] }) {
  const t = useT();
  if (row.kind === "modes") {
    const modes = modesFor(role);
    return modes.length > 0 ? <span className="text-admin-ink">{modes.join(" · ")}</span> : <span className="text-admin-ink-dim">{t(`${K}.cell.none`)}</span>;
  }
  if (row.kind === "capability") {
    return roleGrantsCapability(role, row.capability) ? (
      <span className="font-medium text-admin-ink">{t(`${K}.cell.yes`)}</span>
    ) : (
      <span className="text-admin-ink-dim">{t(`${K}.cell.no`)}</span>
    );
  }
  return (
    <span className="text-admin-ink-dim" title={t(`${K}.limitsGap`)}>
      {t(`${K}.cell.untracked`)}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-[12px] border-b border-admin-border-soft py-[6px] text-admin-13 last:border-b-0">
      <span className="shrink-0 text-admin-ink-muted">{label}</span>
      <span className="text-right font-medium text-admin-ink">{value}</span>
    </div>
  );
}
