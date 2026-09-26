"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAdminShell } from "@/components/admin/shell/internal/state";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { websiteRewardCopy, websiteRewardState } from "@/lib/talent/website-reward";
import { useWebsiteEligibility } from "@/components/talent/studio/useWebsiteEligibility";
import { useTalentSiteDashboardInitialLoad } from "@/components/talent/site/TalentSiteDashboardProvider";
import { loadMyBio, saveMyBio } from "@/lib/server-actions/ai-writing-helper";

// Missing-item keys come from buildTalentChecklist (src/lib/talent-dashboard.ts).
const MISSING_SECTION: Record<string, string> = {
  display_name: "identity",
  first_name: "identity",
  last_name: "identity",
  phone: "identity",
  gender: "identity",
  date_of_birth: "identity",
  origin: "location",
  location: "location",
  short_bio: "about",
  taxonomy: "services",
  media: "media",
  fields_required: "profile_fields",
  fields_recommended: "profile_fields",
};

const SLICE_LABEL = {
  who: "Your name and what you do",
  photos: "Photos of your work",
  offer: "Things clients can book or ask about",
  intro: "A short intro",
  when: "When you are available",
  where: "Where you work",
} as const;

const MISSING_TIME: Record<string, string> = {
  display_name: "30 seconds",
  first_name: "30 seconds",
  last_name: "30 seconds",
  phone: "30 seconds",
  gender: "30 seconds",
  date_of_birth: "30 seconds",
  origin: "30 seconds",
  location: "30 seconds",
  short_bio: "about 2 min",
  taxonomy: "about 1 min",
  media: "about 2 min",
  fields_required: "about 2 min",
  fields_recommended: "about 2 min",
};

export function WebsiteRewardControl({ placement }: { placement: "topbar" | "mobile" | "services" }) {
  const { bridgeTalentCompletion, bridgeTalentSelfProfile, openDrawer, setTalentPage, state } = useAdminShell();
  const siteLoad = useTalentSiteDashboardInitialLoad();
  const copy = useDashboardText();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const [introSaved, setIntroSaved] = useState(false);
  const [introText, setIntroText] = useState("");
  const [introDraft, setIntroDraft] = useState("");
  const [introOwn, setIntroOwn] = useState(false);
  const [introPending, startIntro] = useTransition();
  // Single source for website unlock % — never the agency checklist score (W17).
  const eligibility = useWebsiteEligibility();
  const openIntroTask = useCallback(() => {
    setOpen(false);
    setIntroOwn(false);
    setIntroOpen(true);
    startIntro(async () => {
      const r = await loadMyBio();
      if (r.ok) {
        setIntroDraft(r.text);
        setIntroText(r.text);
      }
    });
  }, [startIntro]);

  useEffect(() => {
    if (placement !== "services") return;
    const openFromHash = () => {
      if (window.location.hash === "#write-intro") openIntroTask();
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, [placement, openIntroTask]);
  const percent = eligibility.percent;
  // Null percent = still loading slices → treat as unfinished (0), never checklist %.
  const knownPercent = percent ?? 0;
  const siteStatus = siteLoad?.ok ? siteLoad.state.site?.status ?? null : null;
  const reward = websiteRewardState({ completionPercent: knownPercent, siteStatus });
  const labels = websiteRewardCopy(reward, knownPercent, copy.isSpanish ? "es" : "en");

  const goWebsite = () => {
    setOpen(false);
    setTalentPage("public-page");
    router.push("/talent/site");
  };

  const missing = bridgeTalentCompletion?.missing ?? [];
  const openMissing = (key: string | null) => {
    setOpen(false);
    if (key === "short_bio") {
      openIntroTask();
      return;
    }
    const section = key ? MISSING_SECTION[key] ?? "identity" : "identity";
    const talentId = bridgeTalentSelfProfile?.id;
    if (!talentId) {
      setTalentPage("profile");
      router.push("/talent/profile");
      return;
    }
    openDrawer("talent-profile-shell", { mode: "edit-self", talentId, section });
    const focusFirst = (attempt: number) => {
      const root = document.querySelector(`[data-tulala-pshell] #pshell-${section}`);
      const fields = root
        ? Array.from(root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
            "input:not([type=hidden]):not([disabled]), textarea:not([disabled])",
          ))
        : [];
      const target = fields.find((f) => !f.value) ?? fields[0];
      if (target) target.focus({ preventScroll: false });
      else if (attempt < 8) setTimeout(() => focusFirst(attempt + 1), 150);
    };
    setTimeout(() => focusFirst(0), 350);
  };

  const siteUrl = siteLoad?.ok ? siteLoad.state.publicSiteUrl : null;
  const siteHost = siteUrl ? siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "") : null;
  const isLive = reward === "live";
  const onWebOffice = state.talentTier === "max";
  const action =
    reward === "unlocked_not_activated"
      ? copy.isSpanish ? "Activar" : "Activate"
      : reward === "setup_unfinished"
        ? copy.isSpanish ? "Terminar" : "Finish"
        : reward === "ready_to_publish"
          ? copy.isSpanish ? "Ver y publicar" : "Preview & publish"
          : null;
  const onPress = () => {
    if (isLive && onWebOffice) {
      goWebsite();
      return;
    }
    if (isLive && siteUrl) {
      window.open(siteUrl, "_blank", "noopener");
      return;
    }
    if (reward === "profile_unfinished") setOpen(true);
    else goWebsite();
  };
  const chevron = (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-admin-ink-dim">
      <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const wrapClass =
    placement === "topbar"
      ? "hidden md:block"
      : placement === "services"
        ? "md:hidden mb-4 w-full"
        : "md:hidden";

  const leftCount = eligibility.slices.filter((s) => s.required && s.done === false).length;

  return (
    <div className={wrapClass}>
      {introSaved && (
        <p
          role="status"
          className="mb-2 flex items-center gap-2 rounded-xl bg-emerald-900/[0.08] px-3 py-2 text-[13px] font-semibold text-emerald-900"
        >
          <span aria-hidden className="grid h-5 w-5 place-items-center rounded-full bg-emerald-900 text-[11px] text-white">✓</span>
          {copy.t("Intro saved")}
        </p>
      )}
      {isLive ? (
        <button
          type="button"
          onClick={onPress}
          className={`inline-flex items-center gap-2.5 rounded-xl border border-admin-border-soft bg-white px-3 py-1.5 text-left font-admin-body ${placement === "services" ? "w-full" : ""}`}
          aria-label={onWebOffice ? copy.t("Manage website") : copy.isSpanish ? "Sitio en vivo" : "Website live"}
        >
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-emerald-600" />
          <span className="min-w-0">
            <span className="block text-[12.5px] font-semibold leading-tight text-admin-ink">
              {onWebOffice ? copy.t("Manage website") : copy.isSpanish ? "Sitio en vivo" : "Website live"}
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
          className={`inline-flex min-w-[220px] items-center gap-3 rounded-xl border border-emerald-900/15 bg-emerald-900/[0.06] px-3 py-1.5 text-left font-admin-body ${placement === "services" ? "w-full" : ""}`}
          aria-label={labels.title}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-semibold leading-tight text-emerald-900">{labels.title}</span>
            <span className="block truncate text-[11px] leading-tight text-admin-ink-muted">{labels.detail}</span>
            {reward === "profile_unfinished" && percent != null && (
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
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/30 md:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={copy.t("Your free website")}
            className="flex w-full flex-col rounded-t-2xl bg-white font-admin-body md:rounded-2xl"
            style={{ maxWidth: 420, maxHeight: "88vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2 md:hidden">
              <span aria-hidden className="h-1 w-9 rounded-full bg-black/15" />
            </div>
            <div className="flex-1 overflow-auto px-5 pb-4 pt-3">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-[16px] font-semibold text-admin-ink">{copy.t("Your free website")}</h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={copy.t("Close")}
                  className="-mr-1 rounded-full px-2 text-[18px] leading-none text-admin-ink-dim"
                >
                  ×
                </button>
              </div>
              <div className="mt-3 flex gap-3 border-b border-admin-border-soft pb-4">
                <span
                  aria-hidden
                  className="flex h-[76px] w-[76px] shrink-0 flex-col gap-1 overflow-hidden rounded-md border border-admin-border-soft bg-stone-50 p-1.5"
                >
                  <span className="h-6 rounded-sm bg-stone-300" />
                  <span className="h-1 w-3/4 rounded-full bg-stone-300" />
                  <span className="h-1 w-1/2 rounded-full bg-stone-200" />
                  <span className="mt-auto h-2 w-8 rounded-sm bg-emerald-900" />
                </span>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-admin-ink">{copy.t("A real page at your own address")}</p>
                  {siteHost && <p className="truncate text-[12.5px] text-emerald-900">{siteHost}</p>}
                  <p className="mt-0.5 text-[12.5px] leading-snug text-admin-ink-muted">
                    {copy.t("Built from your profile and the things you sell. Free, and yours to keep.")}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-[13.5px] font-semibold text-admin-ink">
                {eligibility.percent == null
                  ? copy.t("Not available")
                  : `${eligibility.slices.filter((s) => s.required && s.done).length} ${copy.isSpanish ? "de" : "of"} ${eligibility.slices.filter((s) => s.required).length}`}
              </p>
              <ul className="mt-2 space-y-0.5">
                {eligibility.slices
                  .filter((slice) => slice.required)
                  .map((slice) => (
                      <li key={slice.key}>
                        {slice.key === "intro" ? (
                          <button
                            type="button"
                            onClick={openIntroTask}
                            className="flex w-full items-center gap-2.5 rounded-md py-1.5 text-left text-[13.5px] text-admin-ink hover:bg-black/[0.03]"
                          >
                            <span aria-hidden className="h-4 w-4 shrink-0 rounded border border-admin-border-soft bg-white text-center text-[11px] leading-4">
                              {slice.done ? "✓" : ""}
                            </span>
                            <span className="min-w-0 flex-1">{copy.t(SLICE_LABEL[slice.key])}</span>
                            <span className="shrink-0 text-[11.5px] text-admin-ink-dim">
                              {slice.done == null ? copy.t("Not available") : `${slice.weight}`}
                            </span>
                            {chevron}
                          </button>
                        ) : (
                          <div className="flex items-center gap-2.5 py-1.5 text-[13.5px] text-admin-ink">
                            <span aria-hidden className="h-4 w-4 shrink-0 rounded border border-admin-border-soft bg-white text-center text-[11px] leading-4">
                              {slice.done ? "✓" : ""}
                            </span>
                            <span className="min-w-0 flex-1">{copy.t(SLICE_LABEL[slice.key])}</span>
                            <span className="shrink-0 text-[11.5px] text-admin-ink-dim">
                              {slice.done == null ? copy.t("Not available") : `${slice.weight}`}
                            </span>
                          </div>
                        )}
                      </li>
                    ))}
              </ul>
              <p className="mt-3 text-[12px] leading-snug text-admin-ink-dim">
                {copy.t("Stop whenever you like. What you have written is saved and this sheet picks up where you left off.")}
              </p>
            </div>
            <div className="border-t border-admin-border-soft px-5 py-4">
              <button
                type="button"
                onClick={() => openMissing(missing[0]?.key ?? null)}
                className="w-full rounded-lg bg-emerald-900 px-4 py-3 text-[14px] font-semibold text-white"
              >
                {copy.t("Continue your profile")}
              </button>
            </div>
          </div>
        </div>
      )}
      {introOpen && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-white font-admin-body">
          <header className="flex items-center gap-3 border-b border-admin-border-soft px-4 py-3">
            <button
              type="button"
              onClick={() => setIntroOpen(false)}
              aria-label={copy.t("Back")}
              className="text-[20px] leading-none text-admin-ink"
            >
              ←
            </button>
            <div className="min-w-0">
              <h2 className="text-[16px] font-semibold text-admin-ink">{copy.t("Write your intro")}</h2>
              <p className="text-[12px] text-admin-ink-dim">
                {leftCount} {copy.t("of")} {eligibility.slices.filter((s) => s.required).length} {copy.t("left")}
              </p>
            </div>
          </header>
          <div className="flex-1 overflow-auto px-4 py-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-admin-ink-dim">
              {copy.t("Your introduction")}
              <span className="ml-2 font-normal normal-case tracking-normal">
                {introOwn ? copy.t("Your words") : copy.t("Tulala drafted this")}
              </span>
            </p>
            <textarea
              value={introText}
              onChange={(e) => {
                setIntroText(e.target.value);
                setIntroOwn(true);
              }}
              rows={5}
              className="mt-2 w-full rounded-xl border border-admin-border-soft bg-stone-50 px-3 py-3 text-[14px] leading-relaxed text-admin-ink"
            />
            <p className="mt-2 text-[12.5px] text-admin-ink-muted">
              {copy.t("Written from what you told us when you signed up. Keep it or write your own.")}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setIntroOwn(false);
                  setIntroText(introDraft);
                }}
                className={`flex-1 rounded-full border px-3 py-2 text-[13px] font-semibold ${introOwn ? "border-admin-border-soft bg-white text-admin-ink" : "border-emerald-900 bg-emerald-900 text-white"}`}
              >
                {copy.t("Keep it")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIntroOwn(true);
                  setIntroText("");
                }}
                className={`flex-1 rounded-full border px-3 py-2 text-[13px] font-semibold ${introOwn ? "border-emerald-900 bg-emerald-900 text-white" : "border-admin-border-soft bg-white text-admin-ink"}`}
              >
                {copy.t("Write my own")}
              </button>
            </div>
            <p className="mt-8 text-[12.5px] text-admin-ink-muted">
              {copy.t("Next: your working hours, then your studio address. About 90 seconds for both.")}
            </p>
          </div>
          <div className="border-t border-admin-border-soft px-4 py-4">
            <button
              type="button"
              disabled={introPending || !introText.trim()}
              onClick={() => {
                startIntro(async () => {
                  const r = await saveMyBio({ text: introText, locale: copy.isSpanish ? "es" : "en" });
                  if (!r.ok) return;
                  setIntroOpen(false);
                  setIntroSaved(true);
                  if (window.location.hash === "#write-intro") {
                    history.replaceState(null, "", window.location.pathname + window.location.search);
                  }
                });
              }}
              className="w-full rounded-full bg-emerald-900 px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-50"
            >
              {copy.t("Save and continue")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
