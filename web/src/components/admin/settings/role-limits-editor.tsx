"use client";

/**
 * RoleLimitsEditor — the bottom of W22's Roles & limits: `Manual discount
 * and refund limits` as a matrix (one row per action, one cell per role),
 * and W56's approval inbox beside it.
 *
 * LIMITS are `role_limits (tenant_id, role, action, limit_cents)`, the rows
 * `assertRoleLimit` consults before a discount or a refund goes through;
 * a blank cell is no limit. Each cell writes on blur through
 * `writeRoleLimitAction` (owner or admin); the W58 chip says what happened.
 *
 * THE INBOX is `approval_requests`: what a cashier asked for above their
 * limit, who asked, why, and whether it was decided. `Approve` / `Deny`
 * are the engine's `decideApprovalAction`, which refuses `not_manager`,
 * `already_decided` and `conflict` as sentences. The board's PIN field is
 * not drawn: the decider is the signed-in owner or manager, which the
 * engine checks by membership.
 */

import { useEffect, useState } from "react";

import { useT } from "@/i18n/use-t";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { interpolate } from "@/i18n/interpolate";
import { minorUnitDivisor } from "@/lib/orders/money-format";
import { decideApprovalAction } from "@/lib/server-actions/scheduling-engine";
import {
  loadApprovalRequestsAction,
  loadRoleLimitsAction,
  writeRoleLimitAction,
  type ApprovalRequestRow,
  type RoleLimitAction,
  type RoleLimitRole,
  type RoleLimitRow,
} from "@/lib/server-actions/role-limits-settings";
import { SCHEDULING_ENGINE_REFUSALS, SCHEDULING_ENGINE_REFUSAL_CODES } from "@/lib/scheduling/engine-refusals";
import { CouldNotLoad, LoadingLines, SaveStateChip, type SaveState } from "./settings-ui";

const K = "dashboard.adminWorkspace.rolesLimits";
const ROLES: readonly RoleLimitRole[] = ["owner", "admin", "manager", "editor", "viewer"];
const ACTIONS: readonly RoleLimitAction[] = ["discount", "refund"];
const ACTION_KEY: Record<RoleLimitAction, string> = { discount: `${K}.limits.discount`, refund: `${K}.limits.refund` };
const KIND_KEY: Record<RoleLimitAction, string> = { discount: `${K}.inbox.kindDiscount`, refund: `${K}.inbox.kindRefund` };

const CELL =
  "h-[32px] w-full min-w-0 rounded-[8px] border border-admin-border bg-admin-card px-[10px] font-admin-body text-admin-13 tabular-nums text-admin-ink disabled:cursor-not-allowed disabled:opacity-60";
const BTN_SHAPE = "inline-flex h-[30px] cursor-pointer items-center rounded-[9px] border px-[12px] text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-50";
const BTN = `${BTN_SHAPE} border-admin-border bg-admin-card text-admin-ink hover:border-admin-border-strong`;
const BTN_PRIMARY = `${BTN_SHAPE} border-admin-brand bg-admin-brand text-white hover:bg-admin-brand-deep`;

function refusalKey(reason: string): string {
  return (SCHEDULING_ENGINE_REFUSAL_CODES as readonly string[]).includes(reason)
    ? `dashboard.scheduling.engine.refusal.${reason}`
    : SCHEDULING_ENGINE_REFUSALS.unavailable;
}

export function RoleLimitsEditor({ currency, canEdit }: { currency: string; canEdit: boolean }) {
  const t = useT();
  const locale = useDashboardLocale();
  const divisor = minorUnitDivisor(currency);
  const [limits, setLimits] = useState<RoleLimitRow[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [requests, setRequests] = useState<ApprovalRequestRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [pending, setPending] = useState<{ role: RoleLimitRole; action: RoleLimitAction; raw: string } | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [note, setNote] = useState<{ id: string; text: string } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadFailed(null);
    void Promise.all([loadRoleLimitsAction(), loadApprovalRequestsAction()]).then(([l, r]) => {
      if (cancelled) return;
      if (!l.ok || !r.ok) {
        setLoadFailed(t(`${K}.limits.loadFailed`));
        return;
      }
      setLimits(l.limits);
      setRequests(r.requests);
      const next: Record<string, string> = {};
      for (const row of l.limits) next[`${row.role}:${row.action}`] = String(row.limitCents / divisor);
      setDrafts(next);
    });
    return () => {
      cancelled = true;
    };
  }, [reload, t, divisor]);

  const current = (role: RoleLimitRole, action: RoleLimitAction) => limits?.find((l) => l.role === role && l.action === action)?.limitCents ?? null;

  async function commit(role: RoleLimitRole, action: RoleLimitAction, raw: string) {
    const trimmed = raw.trim();
    const n = trimmed === "" ? null : Number(trimmed);
    if (n !== null && (!Number.isFinite(n) || n < 0)) {
      setSave({ kind: "failed", message: t("dashboard.scheduling.engine.refusal.invalid") });
      setPending(null);
      return;
    }
    const cents = n === null ? null : Math.round(n * divisor);
    if (cents === current(role, action)) return;
    setSave({ kind: "saving" });
    setPending({ role, action, raw });
    const res = await writeRoleLimitAction({ role, action, limitCents: cents });
    if (!res.ok) {
      setSave({ kind: "failed", message: t(refusalKey(res.reason)) });
      return;
    }
    setLimits((cur) => {
      const rest = (cur ?? []).filter((l) => !(l.role === role && l.action === action));
      return cents === null ? rest : [...rest, { role, action, limitCents: cents }];
    });
    setPending(null);
    setSave({ kind: "saved", at: new Date() });
  }

  function decide(id: string, decision: "approved" | "denied") {
    setDeciding(id);
    setNote(null);
    void decideApprovalAction({ requestId: id, decision, reason: "" }).then((res) => {
      setDeciding(null);
      if (!res.ok) {
        setNote({ id, text: t(refusalKey(res.reason)) });
        return;
      }
      setRequests((cur) => (cur ? cur.map((r) => (r.id === id ? { ...r, decision, decidedAt: new Date().toISOString() } : r)) : cur));
    });
  }

  // Day first, 24h, as the boards print it ("16 Sep 22:36"); the parts are reassembled so no locale adds its own punctuation.
  const when = (iso: string) => {
    const parts = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("day")} ${get("month").replace(/\.$/, "")} ${get("hour")}:${get("minute")}`.replace(/\s+/g, " ").trim();
  };
  const open = (requests ?? []).filter((r) => r.decision === null);
  const decided = (requests ?? []).filter((r) => r.decision !== null).slice(0, 5);

  return (
    <div className="flex flex-col gap-[14px] border-t border-admin-border-soft pt-[10px]" data-testid="role-limits-editor">
      <div className="flex items-start justify-between gap-[12px]">
        <div>
          <div className="text-[12px] font-semibold text-admin-ink">{t(`${K}.limitsHeading`)}</div>
          <div className="mt-[2px] text-[11.5px] leading-relaxed text-admin-ink-muted">{t(`${K}.limits.intro`)}</div>
        </div>
        <SaveStateChip
          testId="role-limits-save-state"
          state={save}
          labels={{ saving: t(`${K}.limits.saving`), saved: t(`${K}.limits.saved`), failed: t(`${K}.limits.saveFailed`), retry: t(`${K}.limits.retry`) }}
          onRetry={pending ? () => void commit(pending.role, pending.action, pending.raw) : undefined}
        />
      </div>
      {loadFailed ? (
        <CouldNotLoad testId="role-limits-load-failed" message={loadFailed} retryLabel={t(`${K}.limits.retry`)} onRetry={() => setReload((n) => n + 1)} />
      ) : limits === null ? (
        <LoadingLines label={t(`${K}.limits.loading`)} />
      ) : (
        <div className="overflow-x-auto rounded-[14px] border border-admin-border bg-admin-card">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                <th scope="col" className="border-b border-admin-border px-[14px] py-[10px] text-left text-admin-11 font-semibold uppercase tracking-[0.05em] text-admin-ink-muted">
                  {t(`${K}.limits.colAction`)}
                </th>
                {ROLES.map((role) => (
                  <th key={role} scope="col" className="border-b border-admin-border px-[14px] py-[10px] text-left text-admin-11 font-semibold uppercase tracking-[0.05em] text-admin-ink-muted">
                    {t(`${K}.roleNames.${role}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ACTIONS.map((action) => (
                <tr key={action} data-testid={`role-limit-row-${action}`}>
                  <td className="whitespace-nowrap border-b border-admin-border-soft px-[14px] py-[9px] font-semibold text-admin-ink">{t(ACTION_KEY[action])}</td>
                  {ROLES.map((role) => {
                    const key = `${role}:${action}`;
                    return (
                      <td key={role} className="border-b border-admin-border-soft px-[14px] py-[6px]">
                        <input
                          aria-label={`${t(ACTION_KEY[action])} · ${t(`${K}.roleNames.${role}`)}`}
                          inputMode="decimal"
                          placeholder={t(`${K}.limits.noLimit`)}
                          value={drafts[key] ?? ""}
                          disabled={!canEdit || save.kind === "saving"}
                          title={canEdit ? undefined : t(`${K}.limits.readOnly`)}
                          onChange={(e) => setDrafts((cur) => ({ ...cur, [key]: e.target.value }))}
                          onBlur={(e) => void commit(role, action, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                          className={CELL}
                          data-role-limit={key}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <div className="text-[12px] font-semibold text-admin-ink">{t(`${K}.inbox.heading`)}</div>
        <div className="mt-[2px] text-[11.5px] leading-relaxed text-admin-ink-muted">{t(`${K}.inbox.intro`)}</div>
      </div>
      {requests === null && !loadFailed ? (
        <LoadingLines label={t(`${K}.limits.loading`)} />
      ) : open.length === 0 && decided.length === 0 ? (
        <div className="rounded-[9px] bg-admin-surface-alt px-[10px] py-[8px] text-[12px] text-admin-ink-muted" data-testid="approval-inbox-empty">
          {t(`${K}.inbox.none`)}
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-[10px] p-0" data-testid="approval-inbox">
          {[...open, ...decided].map((r) => {
            const kind = t(KIND_KEY[r.kind]);
            const who = r.requestedByName ?? r.requestedBy.slice(0, 8);
            const ref = r.subjectId.slice(0, 8);
            return (
              <li key={r.id} data-approval-request={r.id} data-decision={r.decision ?? "open"} className="rounded-[14px] border border-admin-border bg-admin-card">
                {/* The board's request card (W56): the ask as a title, who and when under it, the facts on a hairline card, the decision in the footer. */}
                <div className="px-[16px] pt-[14px]">
                  <div className="flex flex-wrap items-center gap-[8px]">
                    <span className="text-[15px] font-semibold leading-[1.2] text-admin-ink">{interpolate(t(`${K}.inbox.title`), { kind, ref })}</span>
                    <span className="flex-1" />
                    {r.decision !== null ? (
                      <span className="rounded-full bg-admin-surface-alt px-[8px] py-[2px] text-[11px] font-semibold text-admin-ink">
                        {r.decision === "approved" ? t(`${K}.inbox.approved`) : t(`${K}.inbox.denied`)}
                        {r.decidedAt ? ` · ${when(r.decidedAt)}` : ""}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-[3px] text-[12.5px] leading-[1.2] text-admin-ink-muted">{interpolate(t(`${K}.inbox.by`), { who, when: when(r.createdAt) })}</div>
                  <div className="mt-[10px] rounded-[10px] border border-admin-border px-[12px]">
                    <div className="flex items-baseline justify-between gap-[12px] border-b border-admin-border-soft py-[7px] text-[12.5px] leading-[1.2]">
                      <span className="shrink-0 text-admin-ink-muted">{t(`${K}.inbox.factAction`)}</span>
                      <span className="text-right font-medium text-admin-ink">{interpolate(t(`${K}.inbox.factActionValue`), { kind, ref })}</span>
                    </div>
                    {r.reason ? (
                      <div className="flex items-baseline justify-between gap-[12px] border-b border-admin-border-soft py-[7px] text-[12.5px] leading-[1.2]">
                        <span className="shrink-0 text-admin-ink-muted">{t(`${K}.inbox.factReason`)}</span>
                        <span className="text-right font-medium text-admin-ink">{r.reason}</span>
                      </div>
                    ) : null}
                    <div className="flex items-baseline justify-between gap-[12px] py-[7px] text-[12.5px] leading-[1.2]">
                      <span className="shrink-0 text-admin-ink-muted">{t(`${K}.inbox.factScope`)}</span>
                      <span className="text-right font-medium text-admin-ink">{interpolate(t(`${K}.inbox.factScopeValue`), { who })}</span>
                    </div>
                  </div>
                  {note?.id === r.id ? (
                    <div role="alert" className="mt-[8px] text-[12px] text-admin-red">
                      {note.text}
                    </div>
                  ) : null}
                </div>
                {r.decision === null ? (
                  <div className="mt-[12px] flex justify-end gap-[8px] border-t border-admin-border-soft px-[16px] py-[10px]">
                    <button type="button" disabled={deciding === r.id} onClick={() => decide(r.id, "denied")} className={BTN} data-approval-deny>
                      {t(`${K}.inbox.deny`)}
                    </button>
                    <button
                      type="button"
                      disabled={deciding === r.id}
                      onClick={() => decide(r.id, "approved")}
                      className={BTN_PRIMARY}
                      data-approval-approve
                    >
                      {t(`${K}.inbox.approve`)}
                    </button>
                  </div>
                ) : (
                  <div className="h-[14px]" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
