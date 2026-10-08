/**
 * consent.ts — the single client-side source of truth for analytics consent.
 *
 * Stored in localStorage (`impronta_analytics_consent`: granted | denied) and
 * mirrored into a first-party cookie (`tulala_consent=analytics`, only while
 * granted) so the server, which cannot read localStorage, can tell whether it
 * may set optional cookies such as the experiment visitor id.
 *
 * Global Privacy Control: when the browser sends GPC and the visitor has made
 * no explicit choice, consent resolves to "denied" and the banner is not shown
 * (the signal is treated as the choice). An explicit choice always wins, and
 * the "Privacy choices" link lets the visitor change it.
 *
 * Every storage touch is wrapped: private mode and blocked storage must never
 * break a page.
 */

export const CONSENT_STORAGE_KEY = "impronta_analytics_consent";
export const CONSENT_COOKIE = "tulala_consent";
export const CONSENT_COOKIE_VALUE = "analytics";
export const CONSENT_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
/** Fired on window after the choice changes. detail: { consent }. */
export const CONSENT_CHANGE_EVENT = "tulala:consent-change";
/** Fire to reopen the banner. */
export const PRIVACY_CHOICES_EVENT = "tulala:privacy-choices";

export type StoredConsent = "granted" | "denied";
export type Consent = StoredConsent | null;

/** Pure: what consent applies given a stored value and the GPC signal. */
export function resolveConsent(stored: unknown, gpc: boolean): Consent {
  if (stored === "granted" || stored === "denied") return stored;
  return gpc ? "denied" : null;
}

/** Pure: should the banner appear on its own (no reopen request)? */
export function shouldShowBanner(stored: unknown, gpc: boolean): boolean {
  return resolveConsent(stored, gpc) === null;
}

/**
 * Pure: routes that must never show the consent banner. Hiding the banner is
 * NOT consent: nothing is written, so `resolveConsent` stays null and analytics
 * storage and pixels stay denied by default (only an explicit "granted" opens
 * them). The banner appears on the next page the visitor reaches.
 *  - /prototypes, /template-preview: designer sandboxes.
 *  - /start: the onboarding flow renders nothing but the flow (TUL-126).
 */
export function isConsentBannerSuppressedPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return /^\/(prototypes|template-preview|start)(\/|$)/.test(pathname);
}

/** Pure: may optional analytics storage / pixels run? Only on explicit grant. */
export function isAnalyticsAllowed(consent: Consent): boolean {
  return consent === "granted";
}

/** Pure: the server-side check on the `tulala_consent` cookie value. */
export function cookieGrantsAnalytics(cookieValue: string | undefined | null): boolean {
  return cookieValue === CONSENT_COOKIE_VALUE;
}

export function isGpcEnabled(): boolean {
  if (typeof navigator === "undefined") return false;
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

export function readStoredConsent(): StoredConsent | null {
  try {
    const v = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (v === "granted" || v === "denied") return v;
  } catch {
    /* ignore */
  }
  return null;
}

/** Effective consent for this browser (stored choice, else GPC, else null). */
export function readConsent(): Consent {
  if (typeof window === "undefined") return null;
  return resolveConsent(readStoredConsent(), isGpcEnabled());
}

/** True only when the visitor explicitly granted analytics. Safe on the server. */
export function hasAnalyticsConsent(): boolean {
  return isAnalyticsAllowed(readConsent());
}

function mirrorCookie(next: StoredConsent) {
  try {
    if (typeof document === "undefined") return;
    const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
    if (next === "granted") {
      document.cookie = `${CONSENT_COOKIE}=${CONSENT_COOKIE_VALUE}; Path=/; Max-Age=${CONSENT_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
    } else {
      document.cookie = `${CONSENT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    }
  } catch {
    /* ignore */
  }
}

/** Persist a choice, mirror the cookie, update Google/Meta, notify listeners. */
export function writeConsent(next: StoredConsent): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  mirrorCookie(next);
  try {
    if (typeof window.gtag === "function") {
      window.gtag("consent", "update", {
        analytics_storage: next,
        ad_storage: next,
        ad_user_data: next,
        ad_personalization: next,
      });
    }
    window.fbq?.("consent", next === "granted" ? "grant" : "revoke");
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: { consent: next } }));
  } catch {
    /* ignore */
  }
}

/** Keep the cookie in step with a choice made before the cookie existed. */
export function syncConsentCookie(): void {
  const stored = readStoredConsent();
  if (stored) mirrorCookie(stored);
}

/** Reopen the consent banner (used by the footer "Privacy choices" link). */
export function openPrivacyChoices(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(PRIVACY_CHOICES_EVENT));
  } catch {
    /* ignore */
  }
}

/** Run `fn` now if consent is granted, and again whenever it becomes granted. */
export function onAnalyticsGranted(fn: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  let ran = false;
  const run = () => {
    if (ran) return;
    ran = true;
    fn();
  };
  if (hasAnalyticsConsent()) run();
  const handler = (e: Event) => {
    const c = (e as CustomEvent<{ consent?: string }>).detail?.consent;
    if (c === "granted") run();
  };
  window.addEventListener(CONSENT_CHANGE_EVENT, handler);
  return () => window.removeEventListener(CONSENT_CHANGE_EVENT, handler);
}
