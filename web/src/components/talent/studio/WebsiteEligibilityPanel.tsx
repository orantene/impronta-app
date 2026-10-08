"use client";

import { websiteSliceProgressSuffix } from "@/lib/talent/website-eligibility";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { useWebsiteFlow } from "@/components/talent/website-reward/useWebsiteFlow";
import type { WebsiteSetupStep } from "@/lib/talent/website-flow";

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
export function WebsiteEligibilityPanel({ onActivate }: { onActivate?: (step: WebsiteSetupStep) => void }) {
  const copy = useDashboardText();
  const flow = useWebsiteFlow();
  const eligibility = flow.eligibility;
  if (flow.state === "ready" || flow.state === "preview") {
    // Same state, title and next action as the top pill and the Today card.
    return (
      <section
        data-testid="website-unlocked"
        data-flow-state={flow.state}
        className="mb-6 rounded-2xl border border-admin-border-soft bg-white p-4 font-admin-body"
      >
        <h2 className="text-[16px] font-semibold text-admin-ink">✓ {flow.text.cardTitle}</h2>
        <p className="mt-1 max-w-[560px] text-[13px] leading-normal text-admin-ink-muted">{flow.text.cardSub}</p>
        {onActivate && flow.text.cta ? (
          <button
            type="button"
            data-testid="website-activate"
            onClick={() => onActivate(flow.step)}
            className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-[var(--tulala-primary-fill)] bg-[var(--tulala-primary-fill)] px-4 text-[13px] font-semibold text-white hover:border-[var(--tulala-primary-fill-deep)] hover:bg-[var(--tulala-primary-fill-deep)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tulala-primary-fill)]"
          >
            {flow.text.cta}
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
