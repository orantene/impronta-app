"use client";

/**
 * Today cards for journey 1 (mz_today / mz_unlocked) — W21 / W22.
 * Incomplete: checklist + ✦ Finish with AI + Write it myself.
 * Unlocked: Activate + suggested address line.
 * Live: renders nothing (W23 — never Unlock).
 */

import { useEffect, useState } from "react";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { useWebsiteEligibility } from "@/components/talent/studio/useWebsiteEligibility";
import { FinishWithAiPanel } from "./FinishWithAiPanel";
import { talentSiteHost } from "@/lib/talent-site/site-public-url";
import { useAdminShell } from "@/components/admin/shell/internal/state";
import { loadTalentSiteActivationStateAction } from "@/lib/talent-site/server/site-activation-state";

/** Client-safe mirror of slugifySiteName for the suggested-address line. */
function suggestSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

const SLICE_LABEL = {
  who: "Your name and what you do",
  photos: "Photos of your work",
  offer: "Things clients can book or ask about",
  intro: "A short intro",
  when: "When you are available",
  where: "Where you work",
} as const;

type Props = {
  onActivate: () => void;
};

export function WebsiteTodayUnlockCard({ onActivate }: Props) {
  const copy = useDashboardText();
  const { bridgeTalentSelfProfile } = useAdminShell();
  const eligibility = useWebsiteEligibility();
  const [aiOpen, setAiOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [siteSlug, setSiteSlug] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    void loadTalentSiteActivationStateAction().then((s) => {
      if (!live) return;
      if (s) {
        setCanManage(s.canManage);
        setIsPublished(s.isPublished);
        setSiteSlug(s.siteSlug);
      }
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!loaded || !canManage || isPublished) return null;
  if (eligibility.percent == null) return null;

  const required = eligibility.slices.filter((s) => s.required);
  const doneCount = required.filter((s) => s.done).length;
  const missing = required.filter((s) => s.done === false);
  const suggested =
    talentSiteHost(siteSlug) ??
    talentSiteHost(suggestSlug(bridgeTalentSelfProfile?.displayName ?? "")) ??
    null;

  if (eligibility.unlocked) {
    return (
      <section
        data-testid="website-unlocked-card"
        className="mb-3.5 rounded-[14px] border border-emerald-900/20 bg-emerald-900/[0.06] px-4 py-3.5 font-admin-body"
      >
        <p className="text-[14px] font-bold text-admin-ink">{copy.t("Your free website is unlocked")}</p>
        {suggested ? (
          <p className="mt-1 text-[12.5px] leading-snug text-admin-ink-muted">
            {copy.t("Suggested address:")} {suggested} · {copy.t("checked when you publish")}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onActivate}
          data-testid="website-unlocked-activate"
          className="mt-3 rounded-[9px] bg-emerald-900 px-4 py-2.5 text-[12.5px] font-bold text-white"
        >
          {copy.t("Activate your free website")}
        </button>
        {toast ? (
          <p className="mt-2 text-[12px] font-semibold text-emerald-900" role="status">
            {toast}
          </p>
        ) : null}
      </section>
    );
  }

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
              {slice.done ? "✓" : "·"} {copy.t(SLICE_LABEL[slice.key])}
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
              onActivate();
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
