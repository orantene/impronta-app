"use client";

/**
 * "Edit your profile" body for the talent Profile page (mockup screens
 * "Edit your profile", "Photos of your work", "Profile & portfolio").
 *
 * Completion comes from ONE value: `useWebsiteEligibility()`, the same score
 * Today and the website card read. Every section opens the existing
 * talent-profile-shell drawer at its section; nothing here writes data.
 */

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { useWebsiteEligibility } from "@/components/talent/studio/useWebsiteEligibility";
import { useWebsiteFlow } from "@/components/talent/website-reward/useWebsiteFlow";
import { useDashboardText } from "../../dashboard-i18n";
import { profileQualityMode } from "@/lib/talent/profile-quality-mode";
import {
  SLICE_SHELL_SECTION,
  buildProfileEditorSections,
  summarizeEligibility,
  type ProfileEditorSection,
  type ProfileEditorSectionKey,
} from "@/lib/talent/profile-editor-sections";
import { selfProfileTradeLabel } from "@/lib/talent/self-profile-trade-label";
import { useAdminShell } from "../../state";

const SECTION_COPY: Record<ProfileEditorSectionKey, { title: string; body: string }> = {
  nameTrade: { title: "dashboard.talentMyProfile.editor.nameTradeTitle", body: "dashboard.talentMyProfile.editor.nameTradeBody" },
  intro: { title: "dashboard.talentMyProfile.editor.introTitle", body: "dashboard.talentMyProfile.editor.introBody" },
  where: { title: "dashboard.talentMyProfile.editor.whereTitle", body: "dashboard.talentMyProfile.editor.whereBody" },
  photos: { title: "dashboard.talentMyProfile.editor.photosTitle", body: "dashboard.talentMyProfile.editor.photosBody" },
  languages: { title: "dashboard.talentMyProfile.editor.languagesTitle", body: "dashboard.talentMyProfile.editor.languagesBody" },
  contact: { title: "dashboard.talentMyProfile.editor.contactTitle", body: "dashboard.talentMyProfile.editor.contactBody" },
};

function stateChip(state: ProfileEditorSection["state"]): { key: string; cls: string } {
  switch (state) {
    case "done":
      return { key: "dashboard.talentMyProfile.editor.stateDone", cls: "bg-admin-accent-soft text-admin-accent-deep" };
    case "todo":
      return { key: "dashboard.talentMyProfile.editor.stateTodo", cls: "bg-admin-amber-soft text-admin-amber-deep" };
    case "unknown":
      return { key: "dashboard.talentMyProfile.editor.stateUnknown", cls: "bg-admin-surface-alt text-admin-ink-muted" };
    default:
      return { key: "dashboard.talentMyProfile.editor.stateOptional", cls: "bg-admin-surface-alt text-admin-ink-muted" };
  }
}

export function ProfileReadyCard({ openSection }: { openSection: (section: string) => void }) {
  const t = useT();
  const copy = useDashboardText();
  // Same flow value as the top bar pill, so "Website live" and this card agree.
  const flow = useWebsiteFlow();
  const eligibility = flow.eligibility;
  const sum = summarizeEligibility(eligibility);
  const pct = sum.percent;
  const mode = profileQualityMode({ published: flow.state === "published", unlocked: eligibility.unlocked, percent: pct });
  const line =
    mode === "live"
      ? copy.t("Your website is live")
      : mode === "unlocked"
        ? t("dashboard.talentMyProfile.editor.qualityUnlocked")
        : mode === "unknown"
          ? t("dashboard.talentMyProfile.editor.qualityUnknown")
          : interpolate(t(sum.left === 1 ? "dashboard.talentMyProfile.editor.qualityLeftOne" : "dashboard.talentMyProfile.editor.qualityLeftMany"), { count: sum.left });
  return (
    <section
      data-testid="profile-ready-card"
      className="mb-4 rounded-2xl border border-admin-border-soft bg-white p-4 font-admin-body"
    >
      <div className="flex items-baseline gap-2">
        <span className="text-[30px] font-bold tracking-tight text-admin-ink">{pct == null ? "·" : `${pct}%`}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-admin-ink">{t("dashboard.talentMyProfile.editor.qualityTitle")}</div>
          <div className="text-[12px] text-admin-ink-muted">{line}</div>
        </div>
      </div>
      <svg className="mt-3 block h-1.5 w-full overflow-hidden rounded-full" aria-hidden>
        <rect width="100%" height="100%" className="fill-admin-surface-alt" />
        <rect width={`${pct ?? 0}%`} height="100%" rx="3" className="fill-admin-accent" />
      </svg>
      {sum.firstOpen && mode !== "live" && (
        <button
          type="button"
          onClick={() => openSection(SLICE_SHELL_SECTION[sum.firstOpen!])}
          className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-[var(--tc-action)] bg-[var(--tc-action)] px-4 text-[13px] font-semibold text-white hover:bg-[var(--tc-action-hover)]"
        >
          {t("dashboard.talentMyProfile.editor.finish")}
        </button>
      )}
    </section>
  );
}

export function ProfileEditorSections({ openSection }: { openSection: (section: string) => void }) {
  const t = useT();
  const dash = useDashboardText();
  const { bridgeTalentSelfProfile } = useAdminShell();
  const eligibility = useWebsiteEligibility();
  const sections = buildProfileEditorSections(eligibility.slices);
  const photoCount = eligibility.photoCount;
  const tradeLabel = selfProfileTradeLabel(bridgeTalentSelfProfile, dash.locale);

  return (
    <section className="mb-4 flex flex-col gap-3 font-admin-body" data-testid="profile-editor-sections">
      <div>
        <h2 className="text-[16px] font-semibold text-admin-ink">{t("dashboard.talentMyProfile.editor.sectionsTitle")}</h2>
        <p className="mt-0.5 text-[12.5px] text-admin-ink-muted">{t("dashboard.talentMyProfile.editor.sectionsHint")}</p>
      </div>
      {sections.map((s) => {
        const copy = SECTION_COPY[s.key];
        const chip = stateChip(s.state);
        return (
          <div
            key={s.key}
            data-testid={`profile-section-${s.key}`}
            className="flex flex-col gap-2 rounded-2xl border border-admin-border-soft bg-white p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex-1 text-[14px] font-semibold text-admin-ink">{t(copy.title)}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip.cls}`}>
                {t(chip.key)}
              </span>
            </div>
            <p className="text-[12.5px] leading-normal text-admin-ink-muted">{t(copy.body)}</p>
            {s.key === "nameTrade" && bridgeTalentSelfProfile && (
              <p className="text-[13px] text-admin-ink">
                {bridgeTalentSelfProfile.displayName}
                {tradeLabel ? ` · ${tradeLabel}` : ""}
              </p>
            )}
            {s.key === "where" && (
              <div className="flex flex-col gap-1.5">
                {bridgeTalentSelfProfile?.homeCity && (
                  <p className="text-[13px] text-admin-ink">{bridgeTalentSelfProfile.homeCity}</p>
                )}
                <span className="text-[11.5px] font-semibold text-admin-ink-muted">{t("dashboard.talentMyProfile.editor.wherePublicLabel")}</span>
                <div role="radiogroup" aria-label={t("dashboard.talentMyProfile.editor.wherePublicLabel")} className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    role="radio"
                    aria-checked
                    className="min-h-11 rounded-xl border border-admin-ink px-3 text-[12.5px] font-semibold text-admin-ink"
                  >
                    {t("dashboard.talentMyProfile.editor.whereCityOnly")}
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={false}
                    disabled
                    className="min-h-11 cursor-not-allowed rounded-xl border border-admin-border-soft px-3 text-[12.5px] text-admin-ink-muted opacity-60"
                  >
                    {t("dashboard.talentMyProfile.editor.whereExact")}
                  </button>
                </div>
                <p className="text-[11.5px] text-admin-ink-muted">{t("dashboard.talentMyProfile.editor.wherePrivacyNote")}</p>
              </div>
            )}
            {s.key === "photos" && photoCount != null && (
              <p className="text-[13px] text-admin-ink">{interpolate(t("dashboard.talentMyProfile.editor.photosCount"), { count: photoCount })}</p>
            )}
            {s.counts && <p className="text-[11px] text-admin-ink-muted">{t("dashboard.talentMyProfile.editor.countsTowardSite")}</p>}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openSection(s.shellSection)}
                className="inline-flex min-h-11 items-center rounded-xl border border-admin-border-soft bg-white px-4 text-[13px] font-semibold text-admin-ink"
              >
                {t("dashboard.talentMyProfile.editor.edit")}
              </button>
              {s.key === "photos" && (
                <button
                  type="button"
                  onClick={() => openSection("albums")}
                  className="inline-flex min-h-11 items-center rounded-xl border border-admin-border-soft bg-white px-4 text-[13px] font-semibold text-admin-ink"
                >
                  {t("dashboard.talentMyProfile.editor.photosReorder")}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
