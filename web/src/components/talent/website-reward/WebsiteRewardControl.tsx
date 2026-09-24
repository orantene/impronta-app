"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminShell } from "@/components/admin/shell/internal/state";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { websiteRewardCopy, websiteRewardState } from "@/lib/talent/website-reward";
import { useTalentSiteDashboardInitialLoad } from "@/components/talent/site/TalentSiteDashboardProvider";

export function WebsiteRewardControl({ placement }: { placement: "topbar" | "mobile" }) {
  const { bridgeTalentCompletion, setTalentPage } = useAdminShell();
  const siteLoad = useTalentSiteDashboardInitialLoad();
  const copy = useDashboardText();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const percent = bridgeTalentCompletion?.percent ?? 0;
  const siteStatus = siteLoad?.ok ? siteLoad.state.site?.status ?? null : null;
  const reward = websiteRewardState({ completionPercent: percent, siteStatus });
  const labels = websiteRewardCopy(reward, percent, copy.isSpanish ? "es" : "en");

  const goWebsite = () => {
    setOpen(false);
    setTalentPage("public-page");
    router.push("/talent/site");
  };

  return (
    <div className={placement === "topbar" ? "hidden md:block" : "md:hidden"}>
      <button
        type="button"
        onClick={() => (placement === "topbar" ? setOpen(true) : goWebsite())}
        className="inline-flex items-center gap-2 rounded-full border border-admin-border-soft bg-white px-2.5 py-1 text-left font-admin-body"
        aria-label={labels.title}
      >
        <span
          aria-hidden
          className="grid h-7 w-7 place-items-center rounded-full border-2 border-admin-brand text-[10px] font-bold text-admin-brand"
        >
          {percent}%
        </span>
        <span className="max-w-[160px]">
          <span className="block truncate text-[12px] font-semibold text-admin-ink">{labels.title}</span>
          {placement === "mobile" && (
            <span className="block truncate text-[11px] text-admin-ink-muted">{labels.detail}</span>
          )}
        </span>
      </button>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/30 md:items-center" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-label={copy.t("Website reward")}
            className="w-full max-w-[420px] rounded-t-2xl bg-white p-5 font-admin-body md:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-admin-ink-dim">
              {copy.t("Website reward")}
            </p>
            <h2 className="mt-2 font-admin-display text-[22px] text-admin-ink">{labels.title}</h2>
            <p className="mt-1 text-[13px] text-admin-ink-muted">{labels.detail}</p>
            <p className="mt-3 text-[13px] text-admin-ink">
              {copy.t("What is left")} · {bridgeTalentCompletion?.missing.length ?? 0}
            </p>
            <ul className="mt-2 max-h-[220px] space-y-1 overflow-auto text-[13px]">
              {(bridgeTalentCompletion?.missing ?? []).map((item) => (
                <li key={item.key} className="text-admin-ink-muted">
                  {item.label}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={goWebsite}
                className="rounded-full bg-admin-brand px-4 py-2 text-[13px] font-semibold text-white"
              >
                {copy.t("Continue your profile")}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full px-3 py-2 text-[13px]">
                {copy.t("Close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
