"use client";

/**
 * TUL-835: the past-due warning on the talent dashboard. Loads the signed-in
 * talent's own subscription state once and renders the shared PastDueBanner
 * only when it is past_due (grace days come from dunning-grace via the
 * banner). Renders nothing otherwise, while loading, or on a read failure.
 */
import { useEffect, useState } from "react";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { loadTalentPastDueState } from "@/lib/server-actions/talent-billing-summary";
import type { TalentPastDueView } from "@/lib/billing/talent-billing-display";
import { PastDueBanner } from "./PastDueBanner";

export function TalentPastDueNotice({ tenantSlug }: { tenantSlug: string }) {
  const copy = useDashboardText();
  const [state, setState] = useState<TalentPastDueView | null>(null);

  useEffect(() => {
    let live = true;
    loadTalentPastDueState()
      .then((s) => {
        if (live) setState(s);
      })
      .catch(() => {
        if (live) setState(null);
      });
    return () => {
      live = false;
    };
  }, []);

  if (!state) return null;
  return (
    <div className="mb-3" data-testid="talent-past-due-notice">
      <PastDueBanner
        scope="talent"
        tenantSlug={tenantSlug}
        status={state.status}
        pastDueSince={state.pastDueSince}
        locale={copy.isSpanish ? "es" : "en"}
      />
    </div>
  );
}
