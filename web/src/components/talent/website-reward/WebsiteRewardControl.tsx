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

  const siteUrl = siteLoad?.ok ? siteLoad.state.publicSiteUrl : null;
  const siteHost = siteUrl ? siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "") : null;
  const isLive = reward === "live";
  const action =
    reward === "unlocked_not_activated"
      ? copy.isSpanish ? "Activar" : "Activate"
      : reward === "setup_unfinished"
        ? copy.isSpanish ? "Continuar" : "Continue"
        : reward === "ready_to_publish"
          ? copy.isSpanish ? "Ver y publicar" : "Preview & publish"
          : null;
  const onPress = () => {
    if (isLive && siteUrl) {
      window.open(siteUrl, "_blank", "noopener");
      return;
    }
    if (placement === "topbar" && reward === "profile_unfinished") setOpen(true);
    else goWebsite();
  };
  const chevron = (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-admin-ink-dim">
      <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  return (
    <div className={placement === "topbar" ? "hidden md:block" : "md:hidden"}>
      {isLive ? (
        <button
          type="button"
          onClick={onPress}
          className="inline-flex items-center gap-2.5 rounded-xl border border-admin-border-soft bg-white px-3 py-1.5 text-left font-admin-body"
          aria-label={copy.isSpanish ? "Sitio en vivo" : "Website live"}
        >
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-emerald-600" />
          <span className="min-w-0">
            <span className="block text-[12.5px] font-semibold leading-tight text-admin-ink">
              {copy.isSpanish ? "Sitio en vivo" : "Website live"}
            </span>
            {siteHost && (
              <span className="block max-w-[180px] truncate text-[11px] leading-tight text-admin-ink-dim">{siteHost}</span>
            )}
          </span>
          {chevron}
        </button>
      ) : (
        <button
          type="button"
          onClick={onPress}
          className="inline-flex min-w-[220px] items-center gap-3 rounded-xl border border-emerald-900/15 bg-emerald-900/[0.06] px-3 py-1.5 text-left font-admin-body"
          aria-label={labels.title}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-semibold leading-tight text-emerald-900">{labels.title}</span>
            <span className="block truncate text-[11px] leading-tight text-admin-ink-muted">{labels.detail}</span>
            {reward === "profile_unfinished" && (
              <span aria-hidden className="mt-1 block h-[3px] w-full overflow-hidden rounded-full bg-black/10">
                <span className="block h-full rounded-full bg-emerald-900" style={{ width: `${Math.min(100, percent)}%` }} />
              </span>
            )}
          </span>
          {action && <span className="shrink-0 text-[12px] font-semibold text-emerald-900">{action}</span>}
          {chevron}
        </button>
      )}
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
