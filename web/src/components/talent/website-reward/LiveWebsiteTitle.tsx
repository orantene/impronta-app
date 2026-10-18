"use client";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import type { LiveBadgeState } from "@/lib/onboarding/live-badge";

/** TUL-818: the "your website is live" line, or "checking" until the address answered (same state as the top pill). */
export function LiveWebsiteTitle({ badge }: { badge: LiveBadgeState }) {
  const copy = useDashboardText();
  const checking = badge === "checking";
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${checking ? "animate-pulse bg-admin-ink-dim" : "bg-[var(--tc-ok)]"}`} aria-hidden />
      <span
        data-testid="today-live-title"
        data-live-badge={badge}
        className={`text-[13.5px] font-semibold ${checking ? "text-admin-ink-muted" : "text-[var(--tc-ok)]"}`}
      >
        {checking ? copy.t("Checking your website") : copy.t("Your website is live")}
      </span>
    </div>
  );
}
