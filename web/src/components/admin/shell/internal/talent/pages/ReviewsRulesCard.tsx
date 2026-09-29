"use client";

/** Reviews page tabs + the "what you can and cannot do" card (mockup "Reviews"). */

import { useT } from "@/i18n/use-t";
import type { ReviewTab } from "@/lib/talent/profile-editor-sections";

export const REVIEW_TABS: { tab: ReviewTab; key: string }[] = [
  { tab: "all", key: "dashboard.talentReviews.tabAll" },
  { tab: "needReply", key: "dashboard.talentReviews.tabNeedReply" },
  { tab: "replied", key: "dashboard.talentReviews.tabReplied" },
  { tab: "flagged", key: "dashboard.talentReviews.tabFlagged" },
];

const REVIEW_RULES: { key: string; allowed: boolean }[] = [
  { key: "dashboard.talentReviews.ruleReply", allowed: true },
  { key: "dashboard.talentReviews.ruleFlag", allowed: true },
  { key: "dashboard.talentReviews.ruleAsk", allowed: true },
  { key: "dashboard.talentReviews.ruleEdit", allowed: false },
  { key: "dashboard.talentReviews.ruleDelete", allowed: false },
  { key: "dashboard.talentReviews.ruleHide", allowed: false },
];

export function ReviewRulesCard() {
  const t = useT();
  return (
    <div className="flex flex-col gap-[9px] rounded-admin-lg border border-admin-border-soft bg-admin-surface-alt p-[16px] font-admin-body">
      <span className="text-admin-10h font-bold uppercase tracking-[0.8px] text-admin-ink-muted">
        {t("dashboard.talentReviews.rulesTitle")}
      </span>
      {REVIEW_RULES.map((r) => (
        <div key={r.key} className="flex items-start gap-[9px] text-[12px]">
          <span
            aria-hidden
            className={`w-[11px] font-bold ${r.allowed ? "text-admin-green" : "text-admin-red"}`}
          >
            {r.allowed ? "✓" : "✕"}
          </span>
          <span className="flex-1 leading-[1.4] text-admin-ink">{t(r.key)}</span>
        </div>
      ))}
      <span className="text-admin-11 leading-[1.45] text-admin-ink-muted">
        {t("dashboard.talentReviews.rulesFoot")}
      </span>
    </div>
  );
}
