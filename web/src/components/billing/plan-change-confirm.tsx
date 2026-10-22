"use client";

import { formatDashboardMoneyCents } from "@/lib/money/dashboard-money-format";
import * as React from "react";

import { useT } from "@/i18n/use-t";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { interpolate } from "@/i18n/interpolate";
import {
  planChangeCopyKey,
  type PlanChangeConfirm as PlanChangeConfirmResult,
  type PlanChangePreview,
} from "@/lib/billing/plan-change-policy";
import { PROMO_ERROR_MESSAGES, type PromoErrorCode } from "@/lib/billing/promo-preview";
import { formatPeriodDate } from "@/lib/billing/period-date";
import { PlanChangeLines } from "./plan-change-lines";
import { PlanChangePromoBox } from "./plan-change-promo-box";
import { cn } from "@/lib/utils";

/**
 * TUL-831 · confirm step for an in-app plan change, reusable by the upgrade
 * modal (TUL-829) for talent and workspace. The caller passes the bound
 * preview / confirm server actions; this component previews on mount, shows
 * "You pay $X today" or "Your plan changes on <date>", and confirms with the
 * preview's proration date so the charge equals what was shown.
 */
export function usePlanChange(
  preview: (code: string | null) => Promise<PlanChangePreview>,
  confirm: (prorationDate: number, code: string | null) => Promise<PlanChangeConfirmResult>,
  /** TUL-833: a code already typed on the page that opened this step (e.g. the upgrade modal's box or ?promo=). */
  initialCode: string | null = null,
) {
  const [state, setState] = React.useState<PlanChangePreview | null>(null);
  const [done, setDone] = React.useState<PlanChangeConfirmResult | null>(null);
  // TUL-833: the code the shown preview was priced with, and why the last attempted one was refused.
  const [code, setCode] = React.useState<string | null>(null);
  const [promoError, setPromoError] = React.useState<PromoErrorCode | null>(null);
  const [pending, startTransition] = React.useTransition();

  const load = React.useCallback(() => {
    setDone(null);
    startTransition(async () => {
      if (initialCode) {
        const first = await preview(initialCode);
        if (first.ok) {
          setState(first);
          setCode(initialCode);
          return;
        }
        // A refused starting code is shown once, then the plain price is used.
        if (first.code === "promo") setPromoError(first.promoError ?? "invalid");
      }
      setState(await preview(null));
    });
  }, [preview, initialCode]);

  React.useEffect(() => {
    load();
  }, [load]);

  /** Re-price with a code. A refused code leaves the last good preview on screen. */
  const applyCode = React.useCallback(
    (next: string | null) => {
      setPromoError(null);
      startTransition(async () => {
        const out = await preview(next);
        if (out.ok) {
          setState(out);
          setCode(next);
        } else if (out.code === "promo") {
          setPromoError(out.promoError ?? "invalid");
        } else {
          setState(out);
        }
      });
    },
    [preview],
  );

  const submit = React.useCallback(() => {
    if (!state?.ok) return;
    const date = state.prorationDate;
    startTransition(async () => {
      const out = await confirm(date, code);
      setDone(out);
      // A stale preview gets re-priced instead of a dead end.
      if (!out.ok && out.code === "stale_preview") setState(await preview(code));
    });
  }, [state, confirm, preview, code]);

  return { preview: state, result: done, pending, reload: load, submit, code, promoError, applyCode };
}

function money(amountMinor: number, currency: string): string {
  return formatDashboardMoneyCents(amountMinor, currency);
}

export function PlanChangeConfirm({
  planName,
  preview,
  confirm,
  onDone,
  onCancel,
  initialCode = null,
}: {
  initialCode?: string | null;
  /** Already translated plan display name. */
  planName: string;
  preview: (code: string | null) => Promise<PlanChangePreview>;
  confirm: (prorationDate: number, code: string | null) => Promise<PlanChangeConfirmResult>;
  onDone: (result: PlanChangeConfirmResult) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const locale = useDashboardLocale();
  const pc = usePlanChange(preview, confirm, initialCode);
  const p = pc.preview;

  React.useEffect(() => {
    if (pc.result?.ok) onDone(pc.result);
  }, [pc.result, onDone]);

  let sentence: string | null = null;
  if (p?.ok) {
    const key = planChangeCopyKey(p);
    sentence = interpolate(t(`dashboard.adminShared.planChange.${key}`), {
      plan: planName,
      amount: money(p.amountDueToday, p.currency),
      price: p.newPrice ? money(p.newPrice.amount, p.newPrice.currency) : "",
      date: formatPeriodDate(p.effectiveAt, locale) ?? "",
    });
  }
  const lang = locale === "es" ? "es" : "en";
  const promoMessage = pc.promoError ? PROMO_ERROR_MESSAGES[pc.promoError][lang] : null;
  // A code only makes sense on a change that bills now.
  const canPromo = !!p?.ok && p.timing === "now" && p.kind !== "noop";
  const error = (pc.result && !pc.result.ok ? pc.result.error : null) ?? (p && !p.ok ? p.error : null);

  return (
    <div className="flex flex-col gap-4" data-testid="plan-change-confirm">
      <p className="text-sm text-foreground" aria-live="polite">
        {p === null ? t("dashboard.adminShared.planChange.loading") : sentence}
      </p>
      {p?.ok && p.breakdown ? (
        <PlanChangeLines breakdown={p.breakdown} currency={p.currency} planName={planName} promo={p.promo ?? null} lang={lang} />
      ) : null}
      {canPromo ? (
        <PlanChangePromoBox
          applied={pc.code}
          error={promoMessage}
          pending={pc.pending}
          onApply={pc.applyCode}
          onClear={() => pc.applyCode(null)}
        />
      ) : null}
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" className="rounded-md px-3 py-2 text-sm" onClick={onCancel} disabled={pc.pending}>
          {t("dashboard.adminShared.planChange.cancel")}
        </button>
        <button
          type="button"
          className={cn("rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground", pc.pending && "opacity-60")}
          onClick={pc.submit}
          disabled={pc.pending || !p?.ok || (p.kind === "noop" && !p.cancelsPendingChange)}
        >
          {t("dashboard.adminShared.planChange.confirm")}
        </button>
      </div>
    </div>
  );
}
