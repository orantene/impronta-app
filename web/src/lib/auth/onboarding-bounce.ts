/**
 * Loop guard for /talent (and other dashboards) <-> /onboarding/role.
 *
 * The middleware routes on a memoised access profile; the pages re-read the
 * profile fresh. Right after onboarding creates a profile the two can
 * disagree, and each one redirects to the other until the browser gives up
 * (ERR_TOO_MANY_REDIRECTS). Two guards:
 *
 *   1. The middleware never bounces to /onboarding/role on a memoised
 *      "no role yet" profile: it re-reads first
 *      (`shouldRereadBeforeOnboardingBounce`).
 *   2. When the middleware does bounce, it stamps ONBOARDING_BOUNCE_COOKIE.
 *      If /onboarding/role then wants to send the person back out within the
 *      window, it renders a "setting up your page" state that retries instead
 *      of redirecting (`shouldHoldOnboardingBounce`).
 */
import type { AccessProfile } from "@/lib/auth-flow";

export const ONBOARDING_BOUNCE_COOKIE = "tulala_onboarding_bounce";
export const ONBOARDING_BOUNCE_WINDOW_S = 20;
/** Seconds the holding page waits before retrying the destination. */
export const ONBOARDING_HOLD_RETRY_S = 3;

export function shouldRereadBeforeOnboardingBounce(
  profile: Pick<AccessProfile, "app_role"> | null,
): boolean {
  return !profile?.app_role;
}

export function shouldHoldOnboardingBounce(input: {
  bounceCookie: string | undefined | null;
  destination: string;
  now: number;
}): boolean {
  if (input.destination.startsWith("/onboarding/role")) return false;
  const raw = input.bounceCookie;
  if (!raw || !/^[0-9]{10,16}$/.test(raw)) return false;
  const at = Number(raw);
  const age = input.now - at;
  return age >= 0 && age < ONBOARDING_BOUNCE_WINDOW_S * 1000;
}

export type OnboardingHoldCopy = { title: string; body: string; cta: string };

export function onboardingHoldCopy(locale: string | null | undefined): OnboardingHoldCopy {
  if ((locale ?? "").toLowerCase().startsWith("es")) {
    return {
      title: "Estamos preparando tu página",
      body: "Tarda solo unos segundos. Esta pantalla se actualiza sola.",
      cta: "Reintentar ahora",
    };
  }
  return {
    title: "Setting up your page",
    body: "This takes a few seconds. This screen refreshes on its own.",
    cta: "Try again now",
  };
}
