"use client";

import { websiteSliceProgressSuffix } from "@/lib/talent/website-eligibility";
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

/**
 * Before-live unlock state on My website. The checklist shows only while the
 * website is still locked; once unlocked, one line plus "Activate your free
 * website" (opens the design gallery). Never mounted once the site is live.
 */
export function WebsiteEligibilityPanel({ onActivate }: { onActivate?: () => void }) {
  const copy = useDashboardText();
  const eligibility = useWebsiteEligibility();
  if (eligibility.unlocked) {
    return (
      <section
        data-testid="website-unlocked"
        className="mb-6 rounded-2xl border border-admin-border-soft bg-white p-4 font-admin-body"
      >
        <h2 className="text-[16px] font-semibold text-admin-ink">✓ {copy.t("Your free website is unlocked")}</h2>
        <p className="mt-1 max-w-[560px] text-[13px] leading-normal text-admin-ink-muted">
          {copy.t(
            "Pick a design, see it with your own services and photos, then publish when you are happy. Nothing goes live until you publish.",
          )}
        </p>
        {onActivate ? (
          <button
            type="button"
            data-testid="website-activate"
            onClick={onActivate}
            className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-admin-ink px-4 text-[13px] font-semibold text-white"
          >
            {copy.t("Activate your free website")}
          </button>
        ) : null}
      </section>
    );
  }
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
              {slice.done ? "✓" : "·"} {copy.t(SLICE_LABEL[slice.key])}{websiteSliceProgressSuffix(slice)}
              {slice.done == null ? ` · ${copy.t("Not available")}` : ""}
            </li>
          ))}
      </ul>
    </section>
  );
}
