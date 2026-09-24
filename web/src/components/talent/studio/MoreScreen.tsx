"use client";

import { useState } from "react";
import { signOut } from "@/app/auth/actions";
import { WebsiteRewardControl } from "@/components/talent/website-reward/WebsiteRewardControl";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { useAdminShell, type TalentPage } from "@/components/admin/shell/internal/state";
import { openGuideArticle } from "@/lib/guide/open-guide";
import { useWebsiteEligibility } from "@/components/talent/studio/useWebsiteEligibility";

type Row = { label: string; detail: string; page?: TalentPage; run?: () => void };

export function TalentMoreScreen({ onClose }: { onClose: () => void }) {
  const copy = useDashboardText();
  const { setTalentPage, bridgeTalentSelfProfile, bridgeTalentCompletion } = useAdminShell();
  const eligibility = useWebsiteEligibility();
  const [signingOut, setSigningOut] = useState(false);
  const name = bridgeTalentSelfProfile?.displayName?.trim() || copy.t("Not available");
  const city = bridgeTalentSelfProfile?.homeCity?.trim() || "";
  const profileLeft = bridgeTalentCompletion
    ? `${bridgeTalentCompletion.missing.length} ${copy.t("things left")}`
    : copy.t("Not available");
  const bookable =
    eligibility.bookableCount == null
      ? copy.t("Not available")
      : eligibility.bookableCount === 0
        ? copy.t("None yet")
        : `${eligibility.bookableCount} ${copy.t("items")}`;
  const hoursDetail =
    eligibility.hasAvailability == null
      ? copy.t("Not available")
      : eligibility.hasAvailability
        ? copy.t("Hours set")
        : copy.t("Not set yet");
  const photosDetail =
    eligibility.photoCount == null
      ? copy.t("Not available")
      : eligibility.photoCount === 0
        ? copy.t("None yet")
        : String(eligibility.photoCount);
  const publicPageDetail = eligibility.unlocked ? copy.t("Ready") : copy.t("In progress");

  const go = (page: TalentPage) => {
    setTalentPage(page);
    onClose();
  };

  const groups: Array<{ title: string; rows: Row[] }> = [
    {
      title: "Presence",
      rows: [
        { label: "My public page", detail: publicPageDetail, page: "public-page" },
        { label: "Where I appear", detail: publicPageDetail, page: "public-page" },
        { label: "Edit my profile", detail: profileLeft, page: "profile" },
        { label: "Photos of my work", detail: photosDetail, page: "profile" },
        { label: "Reviews", detail: copy.t("Open"), page: "reviews" },
      ],
    },
    {
      title: "Work",
      rows: [
        { label: "Services", detail: bookable, page: "services" },
        { label: "Clients", detail: copy.t("Open"), page: "clients" },
        { label: "Working hours", detail: hoursDetail, page: "calendar" },
      ],
    },
    {
      title: "You",
      rows: [
        { label: "Settings", detail: "", page: "settings" },
        { label: "Get help", detail: "", run: () => openGuideArticle("talent") },
        {
          label: signingOut ? "Signing out…" : "Sign out",
          detail: "",
          run: async () => {
            if (signingOut) return;
            setSigningOut(true);
            await signOut();
          },
        },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-white font-admin-body" role="dialog" aria-label={copy.t("More")}>
      <div className="mx-auto max-w-[480px] px-4 pb-28 pt-4">
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-semibold text-admin-ink">{copy.t("More")}</h1>
          <button type="button" className="text-[13px] font-semibold text-admin-ink-muted" onClick={onClose}>
            {copy.t("Close")}
          </button>
        </div>
        <p className="mt-1 text-[13px] text-admin-ink-muted">
          {name}
          {city ? ` · ${city}` : ""}
        </p>
        <div className="mt-3">
          <WebsiteRewardControl placement="mobile" />
        </div>
        {groups.map((group) => (
          <section key={group.title} className="mt-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.4px] text-admin-ink-muted">{copy.t(group.title)}</h2>
            <ul className="mt-1">
              {group.rows.map((row) => (
                <li key={row.label}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 border-b border-admin-border-soft py-3 text-left"
                    onClick={() => {
                      if (row.page) go(row.page);
                      else row.run?.();
                    }}
                  >
                    <span className="text-[15px] font-medium text-admin-ink">{copy.t(row.label)}</span>
                    {row.detail ? <span className="text-[12px] text-admin-ink-muted">{row.detail}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
