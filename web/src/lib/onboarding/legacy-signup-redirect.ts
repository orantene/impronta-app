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
