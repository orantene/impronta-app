/**
 * The window event every "Get started" CTA dispatches when the onboarding
 * module is on. Mirrors `TALENT_MODAL_EVENT`: the host listens, the CTAs stay
 * dumb. `intent` is what the CTA implied (talent / business / unknown), never
 * a classification the person made.
 */
import type { OnboardingIntent } from "@/lib/onboarding/module-state";

export const ONBOARDING_MODULE_EVENT = "tulala:open-onboarding-module" as const;

export type OnboardingModuleEventDetail = { intent: OnboardingIntent; source?: string };

export function openOnboardingModule(detail: OnboardingModuleEventDetail): void {
  window.dispatchEvent(new CustomEvent<OnboardingModuleEventDetail>(ONBOARDING_MODULE_EVENT, { detail }));
}
