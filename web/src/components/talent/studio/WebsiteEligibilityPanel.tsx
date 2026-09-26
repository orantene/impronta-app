"use client";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { useWebsiteEligibility } from "@/components/talent/studio/useWebsiteEligibility";

const SLICE_LABEL = {
  who: "Your name and what you do",
  photos: "Photos of your work",
  offer: "Things clients can book or ask about",
  intro: "A short intro",
  when: "When you are available",
  where: "Where you work",
} as const;

export function WebsiteEligibilityPanel() {
  const copy = useDashboardText();
  const eligibility = useWebsiteEligibility();
  const headline = eligibility.percent == null ? copy.t("Not available") : `${eligibility.percent}%`;
  return (
    <section className="mb-6 rounded-2xl border border-admin-border-soft bg-white p-4 font-admin-body">
      <h2 className="text-[16px] font-semibold text-admin-ink">{copy.t("What unlocks your free website")}</h2>
      <p className="mt-1 text-[13px] text-admin-ink-muted">
        {copy.t("Same score as Today and Where I appear.")} · {headline}
      </p>
      <ul className="mt-3 space-y-1 text-[13px] text-admin-ink">
        {eligibility.slices
          .filter((slice) => slice.required)
          .map((slice) => (
          <li key={slice.key}>
            {slice.done ? "✓" : "·"} {copy.t(SLICE_LABEL[slice.key])}
            {slice.done == null ? ` · ${copy.t("Not available")}` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}
