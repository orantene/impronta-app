"use client";

/**
 * Mounts the onboarding module once per marketing surface (from
 * `MarketingModalHost`) and opens it when a CTA dispatches
 * `ONBOARDING_MODULE_EVENT`.
 *
 * With the flag on, this host also owns the two redirections that make every
 * existing CTA reach the module without touching each call site:
 *   - `TALENT_MODAL_EVENT` (every "Sell your work" button) opens the module
 *     with intent `talent` instead of the talent modal;
 *   - a click on any internal link to `/get-started` (hero "Start a business",
 *     header "Get started", plan cards) is intercepted in the capture phase
 *     and opens the module with the intent the CTA carries in `data-intent`
 *     (`start-business` → business, anything else → unknown). `preventDefault`
 *     only, never `stopPropagation`, so the CTA's own analytics still fire.
 * With the flag off nothing here is mounted and the funnel is unchanged.
 */

import { useCallback, useEffect, useState } from "react";

import { translatorFor } from "@/i18n/use-t";
import { stripLocaleFromPathname } from "@/i18n/pathnames";
import type { OnboardingIntent } from "@/lib/onboarding/module-state";
import { TALENT_MODAL_EVENT } from "@/components/marketing/talent-register-modal";

import { ONBOARDING_MODULE_EVENT, type OnboardingModuleEventDetail } from "./onboarding-events";
import { intentFromStartParam, START_PARAM } from "@/lib/onboarding/front-door";
import { OnboardingModule, SavedToast } from "./onboarding-module";

const GET_STARTED_PATH = "/get-started";

function intentFromAnchor(a: HTMLAnchorElement): OnboardingIntent {
  const raw = a.dataset.intent ?? "";
  if (raw === "start-business") return "business";
  if (raw === "talent-register") return "talent";
  return "unknown";
}

export function OnboardingModuleHost({ locale }: { locale: "en" | "es" }) {
  const [open, setOpen] = useState<OnboardingIntent | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const openWith = useCallback((intent: OnboardingIntent) => setOpen(intent), []);

  useEffect(() => {
    const onModuleEvent = (e: Event) => {
      const detail = (e as CustomEvent<OnboardingModuleEventDetail>).detail;
      openWith(detail?.intent ?? "unknown");
    };
    const onTalentEvent = () => openWith("talent");
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as Element | null;
      const a = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank") return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      const { pathnameWithoutLocale } = stripLocaleFromPathname(url.pathname);
      if (pathnameWithoutLocale.replace(/\/$/, "") !== GET_STARTED_PATH) return;
      e.preventDefault();
      openWith(intentFromAnchor(a));
    };
    window.addEventListener(ONBOARDING_MODULE_EVENT, onModuleEvent);
    window.addEventListener(TALENT_MODAL_EVENT, onTalentEvent);
    document.addEventListener("click", onClick, true);
    // One front door: an old route redirected here with `?start=`; open at
    // once and drop the param so a reload or a share does not reopen it.
    const params = new URLSearchParams(window.location.search);
    const startIntent = intentFromStartParam(params.get(START_PARAM));
    if (startIntent) {
      params.delete(START_PARAM);
      const rest = params.toString();
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
      openWith(startIntent);
    }
    // Hydration marker: a CTA clicked before this effect ran would navigate or
    // do nothing. Specs wait for it; nothing else reads it.
    document.documentElement.setAttribute("data-onboarding-ready", "1");
    return () => {
      window.removeEventListener(ONBOARDING_MODULE_EVENT, onModuleEvent);
      window.removeEventListener(TALENT_MODAL_EVENT, onTalentEvent);
      document.removeEventListener("click", onClick, true);
      document.documentElement.removeAttribute("data-onboarding-ready");
    };
  }, [openWith]);

  return (
    <>
      {open ? (
        <OnboardingModule
          locale={locale}
          intent={open}
          onClose={({ saved }) => {
            setOpen(null);
            if (saved) setToast(translatorFor(locale)("public.onboarding.chrome.savedToast"));
          }}
        />
      ) : null}
      {toast ? <SavedToast text={toast} onDone={() => setToast(null)} /> : null}
    </>
  );
}
