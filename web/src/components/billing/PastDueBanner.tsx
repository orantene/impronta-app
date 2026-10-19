"use client";

/**
 * TUL-835: red "Update your card" banner for a past_due subscription, shown on
 * the talent and workspace billing surfaces. Inside the 7-day grace window it
 * says how long features stay on; after it, it says the plan is paused and
 * offers "Restore plan". Both CTAs open the Stripe billing portal.
 */
import * as React from "react";
import { createTranslator } from "@/i18n/messages";
import { resolveDunningGrace } from "@/lib/billing/dunning-grace";
import { pastDueGraceBody } from "@/lib/billing/past-due-grace-copy";
import { openSubscriptionPortal } from "@/app/(workspace)/[tenantSlug]/admin/account/stripe-billing-actions";
import { openTalentSubscriptionPortal } from "@/app/(workspace)/[tenantSlug]/talent/settings/stripe-talent-actions";

export function PastDueBanner({
  scope,
  tenantSlug,
  status,
  pastDueSince,
  locale = "en",
}: {
  scope: "talent" | "workspace";
  tenantSlug: string;
  status: string | null | undefined;
  pastDueSince: string | null | undefined;
  locale?: string;
}) {
  const t = createTranslator(locale);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const grace = resolveDunningGrace({ status, pastDueSince, now: new Date() });
  if (grace.phase === "none") return null;

  const expired = grace.phase === "expired";
  const body = expired
    ? t("admin.account.billing.pastDueExpiredBody")
    : pastDueGraceBody(locale, grace.daysLeft);

  function open() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result =
        scope === "talent"
          ? await openTalentSubscriptionPortal(tenantSlug)
          : await openSubscriptionPortal(tenantSlug);
      if (result.ok) window.location.href = result.redirectUrl;
      else setError(result.error);
    });
  }

  return (
    <div
      role="alert"
      data-testid="past-due-banner"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        padding: "12px 16px",
        borderRadius: 10,
        background: "rgba(179,38,30,0.08)",
        border: "1px solid rgba(179,38,30,0.35)",
        color: "rgb(140,28,22)",
        fontSize: 13,
      }}
    >
      <span>
        <strong>{t("admin.account.billing.pastDueTitle")}</strong> {body}
        {error ? ` ${error}` : ""}
      </span>
      <button
        type="button"
        onClick={open}
        disabled={pending}
        style={{
          height: 34,
          padding: "0 14px",
          borderRadius: 8,
          border: "none",
          background: "rgb(179,38,30)",
          color: "white",
          fontWeight: 600,
          cursor: pending ? "not-allowed" : "pointer",
          opacity: pending ? 0.6 : 1,
        }}
      >
        {expired ? t("admin.account.billing.restorePlan") : t("admin.account.billing.updateCard")}
      </button>
    </div>
  );
}
