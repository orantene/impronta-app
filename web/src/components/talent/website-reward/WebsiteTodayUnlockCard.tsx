"use client";

/**
 * Today cards for journey 1 (mz_today / mz_unlocked) — W21 / W22.
 * Incomplete: checklist + ✦ Finish with AI + Write it myself.
 * Ready / preview: WebsiteTodayHero (one card, same state as the pill).
 * Live: renders nothing (W23 — never Unlock).
 */

import { firstMissingWebsiteSlice, websiteSliceProgressSuffix } from "@/lib/talent/website-eligibility";
import { useOpenWebsiteSlice } from "@/components/talent/website-reward/useOpenWebsiteSlice";
import { useCallback, useState } from "react";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { useWebsiteFlow } from "@/components/talent/website-reward/useWebsiteFlow";
import { FinishWithAiPanel } from "./FinishWithAiPanel";

const SLICE_LABEL = {
  who: "Your name and what you do",
  photos: "Photos of your work",
  offer: "Things clients can book or ask about",
  intro: "A short intro",
  when: "When you are available",
  where: "Where you work",
} as const;

type Props = {
  /** Kept for callers; the next action now comes from useWebsiteFlow. */
  onActivate?: () => void;
};

export function WebsiteTodayUnlockCard(_props: Props = {}) {
  const copy = useDashboardText();
  const flow = useWebsiteFlow();
  const eligibility = flow.eligibility;
  const [aiOpen, setAiOpen] = useState(false);
  const openAi = useCallback(() => setAiOpen(true), []);
  const openSlice = useOpenWebsiteSlice(openAi);
  const [toast, setToast] = useState<string | null>(null);

  if (!flow.activation?.canManage || flow.state === "published") return null;
  if (eligibility.percent == null) return null;

  const required = eligibility.slices.filter((s) => s.required);
  const doneCount = required.filter((s) => s.done).length;
  const missing = required.filter((s) => s.done === false);

  // Ready / preview: WebsiteTodayHero is the one card (same state as the pill).
  if (flow.state !== "notReady") return null;

  const introMissing = missing.some((s) => s.key === "intro");
  const oneLeft = missing.length === 1;
  const leftLabel = missing[0] ? copy.t(SLICE_LABEL[missing[0].key]) : "";

  return (
    <>
      <section
        data-testid="website-finish-card"
        className="mb-3.5 rounded-[14px] border border-admin-border-soft bg-white px-4 py-3.5 font-admin-body"
      >
        <p className="text-[14px] font-bold text-admin-ink">
          {doneCount} {copy.t("of")} {required.length} {copy.t("done")} · {eligibility.percent}%
        </p>
        <p className="mt-1 text-[12.5px] leading-snug text-admin-ink-muted">
          {oneLeft
            ? `${copy.t("One thing left to unlock your free website:")} ${leftLabel.toLowerCase()}.`
            : copy.t("Finish your profile to unlock your free website.")}
        </p>
        <ul className="mt-2 space-y-1 text-[13px] text-admin-ink">
          {required.map((slice) => (
            <li key={slice.key}>
              {slice.done === false ? (
                <button
                  type="button"
                  data-testid={`today-website-slice-${slice.key}`}
                  onClick={() => openSlice(slice.key)}
                  className="text-left underline decoration-black/20 underline-offset-2 hover:decoration-black/60"
                >
                  · {copy.t(SLICE_LABEL[slice.key])}{websiteSliceProgressSuffix(slice)}
                </button>
              ) : (
                <>{slice.done ? "✓" : "·"} {copy.t(SLICE_LABEL[slice.key])}</>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          {introMissing ? (
            <button
              type="button"
              data-testid="finish-with-ai-cta"
              onClick={() => setAiOpen(true)}
              className="rounded-[9px] bg-emerald-900 px-4 py-2.5 text-[12.5px] font-bold text-white"
            >
              ✦ {copy.t("Finish with AI")}
            </button>
          ) : null}
          <button
            type="button"
            data-testid="write-intro-myself"
            onClick={() => {
              if (introMissing) {
                window.location.hash = "#write-intro";
                return;
              }
              openSlice(firstMissingWebsiteSlice(eligibility.slices));
            }}
            className="rounded-[9px] border border-admin-border-soft bg-white px-4 py-2.5 text-[12.5px] font-bold text-admin-ink"
          >
            {introMissing ? copy.t("Write it myself") : copy.t("Continue")}
          </button>
        </div>
        {toast ? (
          <p className="mt-2 text-[12px] font-semibold text-emerald-900" role="status">
            {toast}
          </p>
        ) : null}
      </section>
      <FinishWithAiPanel
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        locale={copy.isSpanish ? "es" : "en"}
        onSaved={() => setToast(copy.t("Intro saved · profile complete"))}
      />
    </>
  );
}
