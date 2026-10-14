"use client";

/**
 * In-app plan switch for an ACTIVE talent subscriber (TUL-831). Swaps the price
 * on the existing subscription with proration; the plan then flows back through
 * the subscription.updated webhook (TUL-836), so after a short wait we reload.
 */

import * as React from "react";
import { changeTalentPlan } from "./stripe-talent-actions";
import { useT } from "@/i18n/use-t";
import type { TalentPlanKey } from "@/lib/stripe/price-ids";

export function TalentPlanChangeButton({
  tenantSlug,
  target,
}: {
  tenantSlug: string;
  target: TalentPlanKey;
}) {
  const t = useT();
  const [pending, startTransition] = React.useTransition();
  const [message, setMessage] = React.useState<{ tone: "ok" | "error"; text: string } | null>(null);

  function handleClick() {
    if (pending) return;
    if (!window.confirm(t("dashboard.talentBilling.switchConfirm"))) return;
    setMessage(null);
    startTransition(async () => {
      const result = await changeTalentPlan(tenantSlug, target);
      if (result.ok) {
        setMessage({ tone: "ok", text: t("dashboard.talentBilling.switchDone") });
        // Give the webhook a moment to write the new plan, then re-read it.
        window.setTimeout(() => window.location.reload(), 4000);
        return;
      }
      const text =
        result.code === "past_due"
          ? t("dashboard.talentBilling.errorPastDue")
          : result.code === "already_ended"
            ? t("dashboard.talentBilling.errorAlreadyEnded")
            : t("dashboard.talentBilling.errorGeneric");
      setMessage({ tone: "error", text });
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        data-testid="talent-plan-switch"
        className="inline-flex h-[34px] items-center rounded-lg bg-[var(--color-admin-brand)] px-4 text-[12.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? t("dashboard.talentBilling.switching") : t("dashboard.talentBilling.switchToPortfolio")}
      </button>
      {message && (
        <span
          className="text-[11px]"
          style={{ color: message.tone === "error" ? "var(--color-admin-red)" : "var(--color-admin-green)" }}
        >
          {message.text}
        </span>
      )}
    </div>
  );
}
