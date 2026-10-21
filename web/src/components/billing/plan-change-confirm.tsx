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
import { cn } from "@/lib/utils";

/**
 * TUL-831 · confirm step for an in-app plan change, reusable by the upgrade
 * modal (TUL-829) for talent and workspace. The caller passes the bound
 * preview / confirm server actions; this component previews on mount, shows
 * "You pay $X today" or "Your plan changes on <date>", and confirms with the
 * preview's proration date so the charge equals what was shown.
 */
export function usePlanChange(
  preview: () => Promise<PlanChangePreview>,
  confirm: (prorationDate: number) => Promise<PlanChangeConfirmResult>,
) {
  const [state, setState] = React.useState<PlanChangePreview | null>(null);
  const [done, setDone] = React.useState<PlanChangeConfirmResult | null>(null);
  const [pending, startTransition] = React.useTransition();

  const load = React.useCallback(() => {
    setDone(null);
    startTransition(async () => setState(await preview()));
  }, [preview]);

  React.useEffect(() => {
    load();
  }, [load]);

  const submit = React.useCallback(() => {
    if (!state?.ok) return;
    const date = state.prorationDate;
    startTransition(async () => {
      const out = await confirm(date);
      setDone(out);
      // A stale preview gets re-priced instead of a dead end.
      if (!out.ok && out.code === "stale_preview") setState(await preview());
    });
  }, [state, confirm, preview]);

  return { preview: state, result: done, pending, reload: load, submit };
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
}: {
  /** Already translated plan display name. */
  planName: string;
  preview: () => Promise<PlanChangePreview>;
  confirm: (prorationDate: number) => Promise<PlanChangeConfirmResult>;
  onDone: (result: PlanChangeConfirmResult) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const locale = useDashboardLocale();
  const pc = usePlanChange(preview, confirm);
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
      date: p.effectiveAt
        ? new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", year: "numeric" }).format(new Date(p.effectiveAt))
        : "",
    });
  }
  const error = (pc.result && !pc.result.ok ? pc.result.error : null) ?? (p && !p.ok ? p.error : null);

  return (
    <div className="flex flex-col gap-4" data-testid="plan-change-confirm">
      <p className="text-sm text-foreground" aria-live="polite">
        {p === null ? t("dashboard.adminShared.planChange.loading") : sentence}
      </p>
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
