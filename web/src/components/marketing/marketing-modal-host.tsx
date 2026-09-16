"use client";

/**
 * Mounts the talent registration modal once per marketing surface and opens it
 * in response to the `TALENT_MODAL_EVENT` custom event dispatched by any CTA
 * (header, hero, footer, in-page buttons). Rendered in `MarketingShell` so the
 * modal is available on every marketing page without each section owning state.
 */

import { useEffect, useState } from "react";
import { TalentRegisterModal, TALENT_MODAL_EVENT } from "./talent-register-modal";
import { LoginModal, LOGIN_MODAL_EVENT } from "./login-modal";
import { OnboardingModuleHost } from "@/components/onboarding/onboarding-module-host";

export function MarketingModalHost({
  locale = "en",
  onboardingModule = false,
}: {
  locale?: string;
  /**
   * `onboarding_module_enabled`: when true the shared onboarding module owns
   * every "Get started" CTA (including the talent event), so the talent modal
   * is not opened here. Read once per request in `MarketingShell`.
   */
  onboardingModule?: boolean;
}) {
  const [talentOpen, setTalentOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    const openTalent = () => {
      if (!onboardingModule) setTalentOpen(true);
    };
    const openLogin = () => setLoginOpen(true);
    window.addEventListener(TALENT_MODAL_EVENT, openTalent);
    window.addEventListener(LOGIN_MODAL_EVENT, openLogin);
    return () => {
      window.removeEventListener(TALENT_MODAL_EVENT, openTalent);
      window.removeEventListener(LOGIN_MODAL_EVENT, openLogin);
    };
  }, [onboardingModule]);

  return (
    <>
      {onboardingModule ? <OnboardingModuleHost locale={locale === "es" ? "es" : "en"} /> : null}
      {talentOpen ? (
        <TalentRegisterModal locale={locale} onClose={() => setTalentOpen(false)} />
      ) : null}
      {loginOpen ? (
        <LoginModal locale={locale} onClose={() => setLoginOpen(false)} />
      ) : null}
    </>
  );
}
