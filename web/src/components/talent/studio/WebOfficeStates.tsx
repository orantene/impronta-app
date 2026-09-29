"use client";

import { useSearchParams } from "next/navigation";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { useAdminShell } from "@/components/admin/shell/internal/state";
import { useTalentStudioV2 } from "@/components/talent/studio/flag";

export function WebOfficeReturnBanner() {
  const studio = useTalentStudioV2();
  const copy = useDashboardText();
  const params = useSearchParams();
  const { bridgeTalentPlanTrial } = useAdminShell();
  if (!studio) return null;
  const checkout = params.get("checkout");
  const trial = bridgeTalentPlanTrial;
  // No stray spacer: render only when there is a note to show.
  if (!checkout && !trial) return null;

  return (
    <div className="mb-4 space-y-3 font-admin-body text-[13px]">
      {checkout === "review" && <Note>{copy.t("Review your Web Office plan, then continue to card payment.")}</Note>}
      {checkout === "pending" && <Note>{copy.t("Payment is still processing.")}</Note>}
      {checkout === "failed" && <Note>{copy.t("The card was declined. Try again. One retry replaces the old link.")}</Note>}
      {checkout === "done" && <Note>{copy.t("Web Office is on.")}</Note>}
      {trial?.active && <Note>{copy.t("Trial is active. No custom domain during the trial.")}</Note>}
      {trial && !trial.active && <Note>{copy.t("The trial has ended.")}</Note>}
    </div>
  );
}

function Note({ children }: { children: string }) {
  return <p className="rounded-xl border border-admin-border-soft bg-white px-4 py-3 text-admin-ink">{children}</p>;
}
