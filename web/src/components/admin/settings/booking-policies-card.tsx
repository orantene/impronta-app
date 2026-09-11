"use client";

/**
 * BookingPoliciesCard — Settings › Booking policies as the W24 board draws
 * it: the policy table per kind of sale, then Holds, Intake forms and
 * Overrides, over the workspace's commercial terms
 * (`agencies.settings.commercialTerms`: default deposit %, refund-policy
 * preset, instant book) and the numbers the engine enforces
 * (`getBookingPolicyFacts`).
 *
 * Replaces `CommercialTermsSettingsCard`, which was English-only and drew its
 * own colours. Same writer (`updateTenantCommercialTerms`), same optimistic
 * update with rollback; the save state is the W58 chip (Saving · Saved HH:MM
 * · Save failed, Retry sends the same change once).
 *
 * WHAT THE TABLE SAYS IS WHAT THE ENGINE DOES. The deposit column is the
 * workspace default for appointments and spaces (a full-price purchase for
 * classes, tickets and counter sales); "free cancel until" is the refund
 * preset's own sentence; no-show and reschedule cutoffs are drawn as what
 * they are (nothing charges a no-show; the booking notice is the only
 * cutoff). Table deposits are set on Reservations › Settings and linked, not
 * duplicated. Per-item overrides are live (`BookingPolicyOverridesCard`,
 * Package 2, D-POS-75); intake forms, versions and the impact preview have
 * no reader or writer and are disabled with their reason (D-POS-58).
 */

import { useCallback, useEffect, useState } from "react";

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { loadTenantCommercialTerms, updateTenantCommercialTerms } from "@/lib/server-actions/commercial-terms-tenant";
import { getBookingPolicyFacts, type BookingPolicyFacts } from "@/lib/server-actions/booking-policy-facts";
import { REFUND_POLICY_LABEL_KEYS, type RefundPolicyKey, type TenantCommercialTerms } from "@/lib/billing/commercial-terms-types";
import {
  ActionButton,
  CouldNotLoad,
  FactRow,
  GridHead,
  GridRow,
  LoadingLines,
  SaveStateChip,
  SelectField,
  SettingsCard,
  SettingsHeader,
  Switch,
  TextField,
  UsedIn,
  type SaveState,
} from "./settings-ui";
import { BookingPolicyOverridesCard } from "./booking-policy-overrides-card";

const K = "dashboard.adminWorkspace.bookingPolicies";

const REFUND_POLICY_OPTIONS: RefundPolicyKey[] = ["tiered", "flexible", "strict", "manual"];

const FALLBACK_TERMS: TenantCommercialTerms = { depositPct: null, refundPolicy: null, instantBookEnabled: false };

const COLS = "grid-cols-[1.2fr_1fr_1fr_1fr_1fr]";

function minutes(n: number, t: (k: string) => string): string {
  if (n % 1440 === 0 && n >= 1440) return interpolate(t(`${K}.units.days`), { n: n / 1440 });
  if (n % 60 === 0 && n >= 60) return interpolate(t(`${K}.units.hours`), { n: n / 60 });
  return interpolate(t(`${K}.units.minutes`), { n });
}

export function BookingPoliciesCard({ tenantSlug, reservationsSettingsHref }: { tenantSlug: string; reservationsSettingsHref: string }) {
  const t = useT();
  const [terms, setTerms] = useState<TenantCommercialTerms | null>(null);
  const [loadFailed, setLoadFailed] = useState<string | null>(null);
  const [facts, setFacts] = useState<BookingPolicyFacts | null>(null);
  const [depositInput, setDepositInput] = useState("");
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [pending, setPending] = useState<TenantCommercialTerms | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadFailed(null);
    void loadTenantCommercialTerms()
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setTerms(res.data);
          setDepositInput(res.data.depositPct === null ? "" : String(res.data.depositPct));
        } else setLoadFailed(res.error);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(t(`${K}.loadFailed`));
      });
    void getBookingPolicyFacts()
      .then((res) => {
        if (!cancelled && res.ok) setFacts(res.facts);
      })
      .catch(() => {
        /* the holds card says it could not read */
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken, t]);

  const commit = useCallback(
    async (next: TenantCommercialTerms, previous: TenantCommercialTerms) => {
      setSave({ kind: "saving" });
      setPending(next);
      setTerms(next);
      try {
        const res = await updateTenantCommercialTerms(tenantSlug, next);
        if (res.ok) {
          setTerms(res.data);
          setDepositInput(res.data.depositPct === null ? "" : String(res.data.depositPct));
          setPending(null);
          setSave({ kind: "saved", at: new Date() });
          return;
        }
        // The input keeps what the person typed; the stored value is what rolled back.
        setTerms(previous);
        setSave({ kind: "failed", message: res.error });
      } catch {
        setTerms(previous);
        setSave({ kind: "failed", message: t(`${K}.saveFailedNetwork`) });
      }
    },
    [tenantSlug, t],
  );

  function commitDeposit() {
    if (!terms) return;
    const trimmed = depositInput.trim();
    let nextPct: number | null;
    if (trimmed === "") nextPct = null;
    else {
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed)) {
        setDepositInput(terms.depositPct === null ? "" : String(terms.depositPct));
        return;
      }
      nextPct = Math.min(100, Math.max(0, Math.round(parsed)));
    }
    if (nextPct === terms.depositPct) {
      setDepositInput(nextPct === null ? "" : String(nextPct));
      return;
    }
    void commit({ ...terms, depositPct: nextPct }, terms);
  }

  const reason = (key: string) => t(`${K}.notWired.${key}`);
  const shown = terms ?? FALLBACK_TERMS;
  const depositWord =
    shown.depositPct === null ? t(`${K}.depositPlatform`) : shown.depositPct === 0 ? t(`${K}.depositNone`) : interpolate(t(`${K}.depositPct`), { pct: shown.depositPct });
  const cancelWord = shown.refundPolicy ? t(`${K}.cancel.${shown.refundPolicy}`) : t(`${K}.cancel.platform`);
  const noticeWord = facts ? (facts.appointmentsEnabled ? interpolate(t(`${K}.noticeCutoff`), { notice: minutes(facts.minNoticeMin, t) }) : t(`${K}.appointmentsOff`)) : "";

  const rows: Array<{ id: string; deposit: string; cancel: string; noShow: string; reschedule: string; href?: string }> = [
    { id: "appointments", deposit: depositWord, cancel: cancelWord, noShow: t(`${K}.noShowNone`), reschedule: noticeWord },
    { id: "classes", deposit: t(`${K}.fullAtBooking`), cancel: cancelWord, noShow: t(`${K}.noShowSeatKept`), reschedule: noticeWord },
    { id: "tables", deposit: t(`${K}.tablesElsewhere`), cancel: t(`${K}.tablesElsewhere`), noShow: t(`${K}.tablesNoShow`), reschedule: t(`${K}.tablesElsewhere`), href: reservationsSettingsHref },
    { id: "spaces", deposit: depositWord, cancel: cancelWord, noShow: t(`${K}.noShowNone`), reschedule: noticeWord },
    { id: "tickets", deposit: t(`${K}.fullAtPurchase`), cancel: t(`${K}.ticketsRefund`), noShow: t(`${K}.ticketsNoShow`), reschedule: t(`${K}.dash`) },
  ];

  return (
    <div data-testid="booking-policies-card" className="flex flex-col gap-[14px]">
      <SettingsHeader
        title={t(`${K}.title`)}
        subtitle={t(`${K}.subtitle`)}
        actions={
          <>
            <SaveStateChip
              testId="booking-policies-save-state"
              state={save}
              labels={{ saving: t(`${K}.saving`), saved: t(`${K}.saved`), failed: t(`${K}.saveFailed`), retry: t(`${K}.retry`) }}
              onRetry={pending && terms ? () => void commit(pending, terms) : undefined}
            />
            <ActionButton reason={reason("previewImpact")} testId="booking-policies-preview">{t(`${K}.previewImpact`)}</ActionButton>
            <ActionButton tone="primary" reason={reason("publish")} testId="booking-policies-publish">{t(`${K}.publish`)}</ActionButton>
          </>
        }
      />
      <UsedIn
        count={7}
        label={t(`${K}.usedIn`)}
        parts={[
          { where: t(`${K}.usedInPos`), what: t(`${K}.usedInPosList`) },
          { where: t(`${K}.usedInWeb`), what: t(`${K}.usedInWebList`) },
        ]}
      />

      {loadFailed ? (
        <CouldNotLoad testId="booking-policies-load-failed" message={loadFailed} retryLabel={t(`${K}.retry`)} onRetry={() => setReloadToken((n) => n + 1)} />
      ) : terms === null ? (
        <SettingsCard>
          <LoadingLines label={t(`${K}.loading`)} />
        </SettingsCard>
      ) : (
        <>
          <section data-testid="booking-policies-table" className="rounded-[14px] border border-admin-border bg-admin-card">
            <GridHead cols={COLS} columns={[t(`${K}.col.appliesTo`), t(`${K}.col.deposit`), t(`${K}.col.freeCancel`), t(`${K}.col.noShow`), t(`${K}.col.reschedule`)]} />
            {rows.map((r) => (
              <GridRow key={r.id} cols={COLS} testId={`booking-policy-${r.id}`}>
                <span className="font-semibold text-admin-ink">
                  {t(`${K}.kind.${r.id}`)}
                  {r.href ? (
                    <>
                      {" "}
                      <a href={r.href} className="text-[12px] font-semibold text-admin-brand underline-offset-2 hover:underline">
                        {t(`${K}.tablesLink`)}
                      </a>
                    </>
                  ) : null}
                </span>
                <span className="text-admin-ink">{r.deposit}</span>
                <span className="text-admin-ink">{r.cancel}</span>
                <span className="text-admin-ink-muted">{r.noShow}</span>
                <span className="text-admin-ink-muted">{r.reschedule}</span>
              </GridRow>
            ))}
          </section>

          <SettingsCard title={t(`${K}.defaultsHeading`)} testId="booking-policies-defaults">
            <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-3">
              <TextField
                label={t(`${K}.defaultDeposit`)}
                ariaLabel={t(`${K}.defaultDeposit`)}
                testId="booking-policies-deposit"
                value={depositInput}
                inputMode="numeric"
                suffix="%"
                disabled={save.kind === "saving"}
                onChange={setDepositInput}
                onBlur={commitDeposit}
                hint={t(`${K}.defaultDepositHint`)}
              />
              <SelectField
                label={t(`${K}.refundPolicy`)}
                testId="booking-policies-refund"
                value={shown.refundPolicy ?? ""}
                disabled={save.kind === "saving"}
                options={[{ id: "", label: t(`${K}.platformDefault`) }, ...REFUND_POLICY_OPTIONS.map((k) => ({ id: k, label: t(REFUND_POLICY_LABEL_KEYS[k]) }))]}
                onChange={(v) => {
                  const next = v === "" ? null : (v as RefundPolicyKey);
                  if (next !== shown.refundPolicy) void commit({ ...shown, refundPolicy: next }, shown);
                }}
              />
              <div className="flex flex-col">
                <span className="mb-[6px] text-[12px] font-semibold text-admin-ink">{t(`${K}.instantBook`)}</span>
                <div className="flex h-[36px] items-center gap-[10px]">
                  <Switch
                    on={shown.instantBookEnabled}
                    disabled={save.kind === "saving"}
                    label={t(`${K}.instantBook`)}
                    testId="booking-policies-instant"
                    onToggle={() => void commit({ ...shown, instantBookEnabled: !shown.instantBookEnabled }, shown)}
                  />
                  <span className="text-admin-12h text-admin-ink-muted">{t(`${K}.instantBookHint`)}</span>
                </div>
              </div>
            </div>
          </SettingsCard>
        </>
      )}

      <div className="grid grid-cols-1 gap-[16px] lg:grid-cols-2">
        <SettingsCard title={t(`${K}.holds.title`)} testId="booking-policies-holds">
          {facts ? (
            <div className="flex flex-col">
              <FactRow label={t(`${K}.holds.pos`)}>{interpolate(t(`${K}.holds.posValue`), { n: Math.round(facts.posHoldSeconds / 60) })}</FactRow>
              <FactRow label={t(`${K}.holds.checkout`)}>{interpolate(t(`${K}.holds.checkoutValue`), { n: Math.round(facts.checkoutHoldSeconds / 60) })}</FactRow>
              <FactRow label={t(`${K}.holds.waitlist`)}>{interpolate(t(`${K}.holds.waitlistValue`), { n: facts.waitlistOfferMinutes })}</FactRow>
              <FactRow label={t(`${K}.holds.expiry`)}>{t(`${K}.holds.expiryValue`)}</FactRow>
            </div>
          ) : (
            <LoadingLines label={t(`${K}.loading`)} />
          )}
        </SettingsCard>
        <SettingsCard title={t(`${K}.intake.title`)} testId="booking-policies-intake">
          <div className="flex flex-col">
            <FactRow label={t(`${K}.intake.history`)} muted>{t(`${K}.intake.none`)}</FactRow>
            <FactRow label={t(`${K}.intake.waiver`)} muted>{t(`${K}.intake.none`)}</FactRow>
            <FactRow label={t(`${K}.intake.whoReads`)} muted>{t(`${K}.intake.none`)}</FactRow>
          </div>
          <ActionButton reason={reason("intake")} testId="booking-policies-manage-forms" className="w-full">
            {t(`${K}.intake.manage`)}
          </ActionButton>
        </SettingsCard>
      </div>
      <BookingPolicyOverridesCard />
    </div>
  );
}
