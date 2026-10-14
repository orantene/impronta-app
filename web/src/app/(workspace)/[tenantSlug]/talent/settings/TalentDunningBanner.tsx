"use client";

/**
 * "Payment failed" banner for a talent plan in Stripe's retry window (TUL-835).
 * One action: the billing portal (TUL-834) to update the card and pay.
 */

import * as React from "react";
import { openTalentSubscriptionPortal } from "./stripe-talent-actions";
import { useT } from "@/i18n/use-t";
import type { DunningBanner } from "@/lib/billing/dunning-banner";

export function TalentDunningBanner({
  tenantSlug,
  banner,
}: {
  tenantSlug: string;
  banner: NonNullable<DunningBanner>;
}) {
  const t = useT();
  const [pending, startTransition] = React.useTransition();
  const [failed, setFailed] = React.useState(false);

  function openPortal() {
    if (pending) return;
    setFailed(false);
    startTransition(async () => {
      const result = await openTalentSubscriptionPortal(tenantSlug);
      if (result.ok) window.location.href = result.redirectUrl;
      else setFailed(true);
    });
  }

  const until = banner.accessUntil ? new Date(banner.accessUntil).toLocaleDateString() : null;

  return (
    <div
      role="alert"
      data-testid="talent-dunning-banner"
      className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border px-4 py-3"
      style={{ borderColor: "var(--color-admin-amber)", background: "var(--color-admin-surface-alt)" }}
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] font-semibold" style={{ color: "var(--color-admin-ink)" }}>
          {t("dashboard.talentBilling.dunningTitle")}
        </span>
        <span className="text-[12px]" style={{ color: "var(--color-admin-ink-muted)" }}>
          {until
            ? t("dashboard.talentBilling.dunningBodyUntil").replace("{date}", until)
            : t("dashboard.talentBilling.dunningBody")}
        </span>
        {failed && (
          <span className="text-[11px]" style={{ color: "var(--color-admin-red)" }}>
            {t("dashboard.talentBilling.errorGeneric")}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={openPortal}
        disabled={pending}
        className="inline-flex h-[34px] items-center rounded-lg bg-[var(--color-admin-brand)] px-4 text-[12.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? t("dashboard.talentBilling.opening") : t("dashboard.talentBilling.dunningCta")}
      </button>
    </div>
  );
}
