"use client";

/**
 * TUL-835: the past-due warning on the talent dashboard. The past-due fact
 * comes from the talent shell loader (the same talent_subscriptions read that
 * resolves the effective plan), so Today makes no extra request for it. The
 * shared PastDueBanner applies the grace window (dunning-grace) and renders
 * nothing when the subscription is not past_due.
 */
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import type { TalentPastDueFact } from "@/lib/billing/effective-talent-plan";
import { PastDueBanner } from "./PastDueBanner";

export function TalentPastDueNotice({
  tenantSlug,
  pastDue,
}: {
  tenantSlug: string;
  pastDue: TalentPastDueFact;
}) {
  const copy = useDashboardText();
  return (
    <div className="mb-3" data-testid="talent-past-due-notice">
      <PastDueBanner
        scope="talent"
        tenantSlug={tenantSlug}
        status={pastDue.status}
        pastDueSince={pastDue.pastDueSince}
        locale={copy.isSpanish ? "es" : "en"}
      />
    </div>
  );
}
