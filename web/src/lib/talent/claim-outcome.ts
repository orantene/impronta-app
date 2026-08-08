/**
 * claim-outcome — map the `claim_talent_profile` RPC verdict to i18n catalog
 * keys for the outcome screen's copy.
 *
 * The RPC returns a jsonb verdict rather than throwing, because almost every
 * failure here is a NORMAL situation a real person can hit (an expired link, a
 * link opened in the wrong account, a profile an agency already re-claimed).
 * The signed-in session must survive all of them so we can explain what
 * happened and offer the next step, instead of dumping the person on an error
 * page after they just created an account.
 *
 * PURE: no `next/*`, no server translator, no literal English/Spanish strings.
 * This module only knows catalog KEYS under `public.auth.claim.*` (mirroring
 * the `registerCopyKeys` pattern in `lib/auth/register-intent.ts`) — the
 * caller resolves them with its own translator and fills the `{agency}`
 * placeholder that some bodies carry, exactly like `(auth)/register/page.tsx`
 * does for `claimDescription`. That keeps this module exhaustively switched
 * and unit-testable without a request, and keeps the outcome screen's copy
 * localized instead of hard-coded English wrapped in localized chrome.
 *
 * Exhaustively switched so a new RPC reason can't silently fall through to a
 * blank screen.
 */

export type ClaimReason =
  | "claimed"
  | "already_yours"
  | "already_redeemed_by_you"
  | "not_authenticated"
  | "invite_not_found"
  | "invite_revoked"
  | "invite_already_redeemed"
  | "invite_expired"
  | "email_mismatch"
  | "profile_unavailable"
  | "profile_already_claimed"
  | "claimer_has_profile";

export type ClaimVerdict = {
  ok: boolean;
  reason: ClaimReason | string;
  talent_profile_id?: string;
  tenant_id?: string;
  exclusive_confirmed?: boolean;
  plan_tier?: string | null;
  existing_profile_id?: string;
};

export type ClaimPresentation = {
  /** true → celebrate; false → explain. */
  success: boolean;
  /** Catalog key under `public.auth.claim.*` for the headline. */
  titleKey: string;
  /**
   * Catalog key under `public.auth.claim.*` for the body. Some bodies carry a
   * `{agency}` placeholder — the caller fills it (real name, or the
   * `public.auth.claim.agencyFallback` catalog string when unknown), the same
   * way `(auth)/register/page.tsx` fills `claimDescription`.
   */
  bodyKey: string;
  /** Show the "go to my dashboard" CTA (only when they now own a profile). */
  showDashboard: boolean;
  /** Show "ask the agency to re-send" guidance. */
  showResendHint: boolean;
};

const C = "public.auth.claim";

export function presentClaimOutcome(verdict: ClaimVerdict): ClaimPresentation {
  switch (verdict.reason) {
    case "claimed":
      return {
        success: true,
        titleKey: `${C}.claimedTitle`,
        bodyKey: verdict.exclusive_confirmed
          ? `${C}.claimedExclusiveBody`
          : `${C}.claimedSharedBody`,
        showDashboard: true,
        showResendHint: false,
      };

    case "already_yours":
    case "already_redeemed_by_you":
      return {
        success: true,
        titleKey: `${C}.alreadyOwnTitle`,
        bodyKey: `${C}.alreadyOwnBody`,
        showDashboard: true,
        showResendHint: false,
      };

    case "invite_expired":
      return {
        success: false,
        titleKey: `${C}.expiredTitle`,
        bodyKey: `${C}.expiredBody`,
        showDashboard: false,
        showResendHint: true,
      };

    case "invite_revoked":
      return {
        success: false,
        titleKey: `${C}.revokedTitle`,
        bodyKey: `${C}.revokedBody`,
        showDashboard: false,
        showResendHint: true,
      };

    case "email_mismatch":
      return {
        success: false,
        titleKey: `${C}.emailMismatchTitle`,
        bodyKey: `${C}.emailMismatchBody`,
        showDashboard: false,
        showResendHint: true,
      };

    case "invite_already_redeemed":
    case "profile_already_claimed":
      return {
        success: false,
        titleKey: `${C}.alreadyClaimedTitle`,
        bodyKey: `${C}.alreadyClaimedBody`,
        showDashboard: false,
        showResendHint: false,
      };

    case "claimer_has_profile":
      return {
        success: false,
        titleKey: `${C}.claimerHasProfileTitle`,
        bodyKey: `${C}.claimerHasProfileBody`,
        showDashboard: true,
        showResendHint: false,
      };

    case "invite_not_found":
    case "profile_unavailable":
      return {
        success: false,
        titleKey: `${C}.notFoundTitle`,
        bodyKey: `${C}.notFoundBody`,
        showDashboard: false,
        showResendHint: true,
      };

    case "not_authenticated":
      return {
        success: false,
        titleKey: `${C}.notAuthenticatedTitle`,
        bodyKey: `${C}.notAuthenticatedBody`,
        showDashboard: false,
        showResendHint: false,
      };

    default:
      return {
        success: false,
        titleKey: `${C}.unknownTitle`,
        bodyKey: `${C}.unknownBody`,
        showDashboard: false,
        showResendHint: true,
      };
  }
}
