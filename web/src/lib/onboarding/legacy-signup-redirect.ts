/**
 * TUL-117 (PR A): the old signup doors lead to the new guided flow.
 *
 * `/register`, `/onboarding/role` and the login page's "create account" link
 * used to run the pre-`/start` path: an English role picker, then the raw
 * profile editor. `/start` (marketing host) is the front door now. This is the
 * one decision for all three, pure so it is unit tested without a request.
 *
 * Returns the absolute `/start` URL to send the visitor to, or `null` to keep
 * the old page. It returns `null` for everything that is NOT a plain pro
 * signup: clients, claim invites, workspace leads, roster invites, a `next`
 * that is not a talent-signup next, a flag that is off, or a host that is not
 * the platform's own (a whitelabel agency host keeps its own brand).
 */

import { resolveAuthPageLocale } from "@/i18n/auth-page-locale";
import type { FlowLocale } from "./flow";

export type LegacySignupSurface = "register" | "role";

export type LegacySignupInput = {
  /** `getOnboardingFlags().onboarding_module_enabled`. */
  flagOn: boolean;
  surface: LegacySignupSurface;
  /** Absolute marketing origin, `getSiteUrl()`. */
  siteUrl: string;
  lang: FlowLocale;
  /** Host kind. Only the platform's own hosts hand off to the platform `/start`. */
  hostKind: string;
  /** Resolved `/register` intent (`talent` | `client` | `operator`), if any. */
  intent?: string | null;
  /** The normalized `next`, or null when there is none. */
  next?: string | null;
  /** `isTalentSignupNext(next)`: the old "Join as Talent" / talent register next. */
  nextIsTalentSignup?: boolean;
  hasWorkspaceLead?: boolean;
  hasClaimInvite?: boolean;
};

const PLATFORM_HOST_KINDS = new Set(["app", "marketing"]);

export function buildStartUrl(input: {
  siteUrl: string;
  lang: FlowLocale;
  choice?: "myself" | null;
}): string {
  const q = new URLSearchParams();
  if (input.choice) q.set("choice", input.choice);
  q.set("lang", input.lang);
  return `${input.siteUrl.replace(/\/$/, "")}/start?${q.toString()}`;
}

export function legacySignupRedirect(input: LegacySignupInput): string | null {
  if (!input.flagOn) return null;
  if (!PLATFORM_HOST_KINDS.has(input.hostKind)) return null;
  if (input.hasWorkspaceLead || input.hasClaimInvite) return null;

  const intent = input.intent ?? null;
  // Client and operator signups have their own flows.
  if (intent === "client" || intent === "operator") return null;

  const hasNext = Boolean(input.next);
  if (hasNext && !input.nextIsTalentSignup) return null;

  const talent = intent === "talent" || (hasNext && Boolean(input.nextIsTalentSignup));
  return buildStartUrl({
    siteUrl: input.siteUrl,
    lang: input.lang,
    choice: talent ? "myself" : null,
  });
}

/** The first browser language when it is one the flow serves; null when absent or another language. */
function explicitBrowserLang(acceptLanguage: string | null | undefined): FlowLocale | null {
  const first = (acceptLanguage ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  if (first === "es" || first.startsWith("es-")) return "es";
  if (first === "en" || first.startsWith("en-")) return "en";
  return null;
}

/**
 * TUL-492: the language to hand `/start` from a legacy door (`/register`,
 * `/login`, `/onboarding/role`). Order: the URL's own language (`/es/...` prefix
 * or a `?lang=` the proxy kept when it stripped the prefix), a deliberate
 * `locale` cookie, an explicit browser language (an `en-US` browser is not
 * overridden by an IP in Mexico), then Mexico, then English. Never a hardcoded
 * default of Spanish.
 */
export function resolveLegacyFlowLang(input: {
  urlLang?: string | null;
  cookieLocale?: string | null;
  cookieIsAuto?: boolean;
  acceptLanguage?: string | null;
  country?: string | null;
}): FlowLocale {
  if (input.urlLang === "es" || input.urlLang === "en") return input.urlLang;
  // One resolver for every auth/onboarding page (see resolveAuthPageLocale).
  return resolveAuthPageLocale({
    cookieLocale: input.cookieLocale === "es" || input.cookieLocale === "en" ? input.cookieLocale : null,
    cookieIsAuto: input.cookieIsAuto === true,
    acceptLanguage: input.acceptLanguage,
    country: input.country,
    fallback: "en",
    enabledLocales: ["en", "es"],
  }) === "es"
    ? "es"
    : "en";
}

/** `/es/register`-style path → its language, or null when the path has no locale prefix. */
export function langFromLocalePrefixedPath(pathname: string | null | undefined): FlowLocale | null {
  const m = /^\/(es|en)(?:\/|$)/.exec(pathname ?? "");
  return m ? (m[1] as FlowLocale) : null;
}
