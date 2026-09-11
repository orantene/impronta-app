"use client";

/**
 * BookingPolicyOverridesCard — W24's `Overrides` card, wired (Package 2,
 * D-POS-75): one row per bookable item with its own deposit %, free-cancel
 * hours and no-show fee, over `booking_policy_overrides`. A blank cell means
 * "the workspace default applies"; the deposit and cancel paths read the
 * row first and the offering / workspace default after it.
 *
 * Each cell writes on blur through the engine's `writePolicyOverrideAction`
 * (the whole row, so a cleared cell clears the column). The W58 chip on the
 * card says Saving · Saved HH:MM · Save failed, and a failure keeps what was
 * typed so Retry sends the same change once.
 */

import { useEffect, useState } from "react";

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney, minorUnitDivisor } from "@/lib/orders/money-format";
import { loadPolicyOverridesAction, type PolicyOverrideItem } from "@/lib/server-actions/booking-policy-overrides-settings";
import { writePolicyOverrideAction } from "@/lib/server-actions/scheduling-engine";
import { SCHEDULING_ENGINE_REFUSALS, SCHEDULING_ENGINE_REFUSAL_CODES } from "@/lib/scheduling/engine-refusals";
import { CouldNotLoad, GridHead, GridRow, LoadingLines, Note, SaveStateChip, SettingsCard, type SaveState } from "./settings-ui";

const K = "dashboard.adminWorkspace.bookingPolicies.overrides";
const COLS = "grid-cols-[1.6fr_120px_140px_140px]";

type Draft = { deposit: string; hours: string; fee: string };

function draftOf(item: PolicyOverrideItem): Draft {
  return {
    deposit: item.depositBps === null ? "" : String(item.depositBps / 100),
    hours: item.cancelFreeHours === null ? "" : String(item.cancelFreeHours),
    fee: item.noShowFeeCents === null ? "" : String(item.noShowFeeCents / minorUnitDivisor(item.currency)),
  };
}

function toInt(raw: string, scale: number): number | null | undefined {
  const s = raw.trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * scale);
}

const CELL =
  "h-[32px] w-full min-w-0 rounded-[8px] border border-admin-border bg-admin-card px-[10px] font-admin-body text-admin-13 tabular-nums text-admin-ink disabled:cursor-not-allowed disabled:opacity-60";

export function BookingPolicyOverridesCard() {
  const t = useT();
  const [items, setItems] = useState<PolicyOverrideItem[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loadFailed, setLoadFailed] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [pending, setPending] = useState<{ item: PolicyOverrideItem; draft: Draft } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadFailed(null);
    void loadPolicyOverridesAction().then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setItems(res.items);
        const next: Record<string, Draft> = {};
        for (const it of res.items) next[it.offeringId] = draftOf(it);
        setDrafts(next);
      } else setLoadFailed(t(`${K}.loadFailed`));
    });
    return () => {
      cancelled = true;
    };
  }, [reload, t]);

  const refusal = (reason: string) =>
    t((SCHEDULING_ENGINE_REFUSAL_CODES as readonly string[]).includes(reason) ? `dashboard.scheduling.engine.refusal.${reason}` : SCHEDULING_ENGINE_REFUSALS.unavailable);

  async function commit(item: PolicyOverrideItem, draft: Draft) {
    const depositBps = toInt(draft.deposit, 100);
    const cancelFreeHours = toInt(draft.hours, 1);
    const noShowFeeCents = toInt(draft.fee, minorUnitDivisor(item.currency));
    if (depositBps === undefined || cancelFreeHours === undefined || noShowFeeCents === undefined || (depositBps !== null && depositBps > 10000)) {
      setSave({ kind: "failed", message: t("dashboard.scheduling.engine.refusal.invalid") });
      setPending(null);
      return;
    }
    const unchanged = depositBps === item.depositBps && cancelFreeHours === item.cancelFreeHours && noShowFeeCents === item.noShowFeeCents;
    if (unchanged) return;
    setSave({ kind: "saving" });
    setPending({ item, draft });
    const res = await writePolicyOverrideAction({ offeringId: item.offeringId, depositBps, cancelFreeHours, noShowFeeCents });
    if (!res.ok) {
      setSave({ kind: "failed", message: refusal(res.reason) });
      return;
    }
    setItems((cur) => (cur ? cur.map((it) => (it.offeringId === item.offeringId ? { ...it, depositBps, cancelFreeHours, noShowFeeCents } : it)) : cur));
    setPending(null);
    setSave({ kind: "saved", at: new Date() });
  }

  const setDraft = (id: string, patch: Partial<Draft>) => setDrafts((cur) => ({ ...cur, [id]: { ...cur[id], ...patch } }));

  return (
    <SettingsCard title={t(`${K}.title`)} testId="booking-policies-overrides">
      <div className="mb-[10px] flex items-start justify-between gap-[12px]">
        <p className="m-0 text-[12.5px] text-admin-ink-muted">{t(`${K}.intro`)}</p>
        <SaveStateChip
          testId="booking-policies-overrides-save-state"
          state={save}
          labels={{
            saving: t("dashboard.adminWorkspace.bookingPolicies.saving"),
            saved: t("dashboard.adminWorkspace.bookingPolicies.saved"),
            failed: t("dashboard.adminWorkspace.bookingPolicies.saveFailed"),
            retry: t("dashboard.adminWorkspace.bookingPolicies.retry"),
          }}
          onRetry={pending ? () => void commit(pending.item, pending.draft) : undefined}
        />
      </div>
      {loadFailed ? (
        <CouldNotLoad testId="booking-policies-overrides-load-failed" message={loadFailed} retryLabel={t("dashboard.adminWorkspace.bookingPolicies.retry")} onRetry={() => setReload((n) => n + 1)} />
      ) : items === null ? (
        <LoadingLines label={t("dashboard.adminWorkspace.bookingPolicies.loading")} />
      ) : items.length === 0 ? (
        <Note>{t(`${K}.none`)}</Note>
      ) : (
        <section className="max-h-[420px] overflow-y-auto rounded-[12px] border border-admin-border bg-admin-card">
          <GridHead cols={COLS} columns={[t(`${K}.col.item`), t(`${K}.col.deposit`), t(`${K}.col.freeCancel`), t(`${K}.col.noShow`)]} />
          {items.map((item) => {
            const d = drafts[item.offeringId] ?? draftOf(item);
            const off = save.kind === "saving";
            return (
              <GridRow key={item.offeringId} cols={COLS} testId={`booking-policy-override-${item.offeringId}`}>
                <span className="min-w-0 truncate font-semibold text-admin-ink">
                  {item.title || t("dashboard.catalog.untitled")}
                  <span className="block text-[11px] font-normal text-admin-ink-dim">
                    {item.depositBps === null && item.cancelFreeHours === null && item.noShowFeeCents === null
                      ? t(`${K}.rowDefault`)
                      : interpolate(t(`${K}.rowSet`), { fee: item.noShowFeeCents === null ? t("dashboard.adminWorkspace.bookingPolicies.dash") : formatOrderMoney(item.noShowFeeCents, item.currency) })}
                  </span>
                </span>
                <input
                  aria-label={t(`${K}.col.deposit`)}
                  inputMode="decimal"
                  placeholder={t(`${K}.placeholder`)}
                  value={d.deposit}
                  disabled={off}
                  onChange={(e) => setDraft(item.offeringId, { deposit: e.target.value })}
                  onBlur={() => void commit(item, { ...d })}
                  className={CELL}
                  data-override-deposit
                />
                <input
                  aria-label={t(`${K}.col.freeCancel`)}
                  inputMode="numeric"
                  placeholder={t(`${K}.placeholder`)}
                  value={d.hours}
                  disabled={off}
                  onChange={(e) => setDraft(item.offeringId, { hours: e.target.value })}
                  onBlur={() => void commit(item, { ...d })}
                  className={CELL}
                  data-override-hours
                />
                <input
                  aria-label={t(`${K}.col.noShow`)}
                  inputMode="decimal"
                  placeholder={t(`${K}.placeholder`)}
                  value={d.fee}
                  disabled={off}
                  onChange={(e) => setDraft(item.offeringId, { fee: e.target.value })}
                  onBlur={() => void commit(item, { ...d })}
                  className={CELL}
                  data-override-fee
                />
              </GridRow>
            );
          })}
        </section>
      )}
      <Note>{t(`${K}.note`)}</Note>
    </SettingsCard>
  );
}
