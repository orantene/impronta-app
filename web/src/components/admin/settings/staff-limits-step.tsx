"use client";

/**
 * StaffLimitsStep — TUL-1722. The owner's step in Settings › Roles & limits:
 * what a manager and an admin may refund or discount without asking.
 *
 * A role with no `role_limits` row is CLOSED (TUL-1516, O4), so the step
 * shows only while a manager / admin cell is closed and only to the owner.
 * Save writes through `saveStaffLimitsAction` (owner only, tenant resolved on
 * the server). Skip changes nothing: the cells stay closed and the note says
 * what that means. The full per-role table below remains for later changes.
 */

import { useEffect, useState } from "react";

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { minorUnitDivisor } from "@/lib/orders/money-format";
import { loadRoleLimitsAction } from "@/lib/server-actions/role-limits-settings";
import { saveStaffLimitsAction } from "@/lib/server-actions/owner-staff-limits";
import {
  STAFF_LIMIT_ACTIONS,
  STAFF_LIMIT_ROLES,
  closedStaffCells,
  parseStaffLimit,
  type StaffLimitAction,
  type StaffLimitRole,
} from "@/lib/pos/staff-limit-plan";

const K = "dashboard.adminWorkspace.rolesLimits";

type Phase = "idle" | "saving" | "saved" | "failed" | "invalid" | "skipped";

const FIELD =
  "h-[32px] w-full min-w-0 rounded-[8px] border border-admin-border bg-admin-card px-[10px] font-admin-body text-admin-13 tabular-nums text-admin-ink disabled:cursor-not-allowed disabled:opacity-60";
const BTN =
  "inline-flex h-[30px] cursor-pointer items-center rounded-[9px] border px-[12px] text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-50";

export function StaffLimitsStep({ currency, isOwner }: { currency: string; isOwner: boolean }) {
  const t = useT();
  const divisor = minorUnitDivisor(currency);
  const [closedCount, setClosedCount] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    void loadRoleLimitsAction().then((r) => {
      if (cancelled || !r.ok) return;
      setClosedCount(closedStaffCells(r.limits).length);
      const next: Record<string, string> = {};
      for (const row of r.limits) next[`${row.role}:${row.action}`] = String(row.limitCents / divisor);
      setDrafts(next);
    });
    return () => {
      cancelled = true;
    };
  }, [isOwner, divisor]);

  // Only the owner sees the step, and only while something is closed or was just saved.
  if (!isOwner || closedCount === null || (closedCount === 0 && phase === "idle")) return null;

  async function save() {
    const cells: Record<StaffLimitRole, Record<StaffLimitAction, number | null>> = {
      manager: { refund: null, discount: null },
      admin: { refund: null, discount: null },
    };
    for (const role of STAFF_LIMIT_ROLES) {
      for (const action of STAFF_LIMIT_ACTIONS) {
        const parsed = parseStaffLimit(drafts[`${role}:${action}`] ?? "", divisor);
        if (!parsed.ok) {
          setPhase("invalid");
          return;
        }
        cells[role][action] = parsed.cents;
      }
    }
    setPhase("saving");
    const res = await saveStaffLimitsAction(cells);
    if (!res.ok) {
      setPhase("failed");
      return;
    }
    setClosedCount(STAFF_LIMIT_ROLES.length * STAFF_LIMIT_ACTIONS.length - Object.values(cells).flatMap((c) => Object.values(c)).filter((v) => v !== null).length);
    setPhase("saved");
  }

  return (
    <div className="flex flex-col gap-[10px] rounded-[14px] border border-admin-border bg-admin-card px-[16px] py-[14px]" data-testid="staff-limits-step">
      <div>
        <div className="text-[13px] font-semibold text-admin-ink">{t(`${K}.staffStep.title`)}</div>
        <div className="mt-[2px] text-[11.5px] leading-relaxed text-admin-ink-muted">{t(`${K}.staffStep.intro`)}</div>
      </div>
      <div className="grid grid-cols-1 gap-[10px] sm:grid-cols-2">
        {STAFF_LIMIT_ROLES.map((role) =>
          STAFF_LIMIT_ACTIONS.map((action) => {
            const key = `${role}:${action}`;
            const label = `${t(`${K}.roleNames.${role}`)} · ${t(`${K}.limits.${action}`)}`;
            return (
              <label key={key} className="flex flex-col gap-[4px] text-[12px] font-semibold text-admin-ink">
                {label}
                <input
                  inputMode="decimal"
                  aria-label={label}
                  placeholder={interpolate(t(`${K}.staffStep.amountLabel`), { currency })}
                  value={drafts[key] ?? ""}
                  disabled={phase === "saving"}
                  onChange={(e) => {
                    setDrafts((cur) => ({ ...cur, [key]: e.target.value }));
                    if (phase !== "saving") setPhase("idle");
                  }}
                  className={FIELD}
                  data-staff-limit={key}
                />
              </label>
            );
          }),
        )}
      </div>
      <div className="text-[11.5px] text-admin-ink-muted" data-testid="staff-limits-closed-note">
        {t(`${K}.staffStep.closedNote`)}
      </div>
      <div className="flex flex-wrap items-center gap-[8px]">
        <button
          type="button"
          disabled={phase === "saving"}
          onClick={() => void save()}
          className={`${BTN} border-admin-brand bg-admin-brand text-white hover:bg-admin-brand-deep`}
          data-staff-limits-save
        >
          {phase === "saving" ? t(`${K}.staffStep.saving`) : t(`${K}.staffStep.save`)}
        </button>
        <button
          type="button"
          disabled={phase === "saving"}
          onClick={() => setPhase("skipped")}
          className={`${BTN} border-admin-border bg-admin-card text-admin-ink hover:border-admin-border-strong`}
          data-staff-limits-skip
        >
          {t(`${K}.staffStep.skip`)}
        </button>
        <span role="status" className="text-[12px] text-admin-ink-muted" data-testid="staff-limits-status">
          {phase === "saved" ? t(`${K}.staffStep.saved`) : phase === "skipped" ? t(`${K}.staffStep.skipped`) : phase === "invalid" ? t(`${K}.staffStep.invalid`) : phase === "failed" ? t(`${K}.staffStep.failed`) : ""}
        </span>
      </div>
    </div>
  );
}
