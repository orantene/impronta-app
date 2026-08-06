/**
 * claim-outcome — map the `claim_talent_profile` RPC verdict to user-facing copy.
 *
 * The RPC returns a jsonb verdict rather than throwing, because almost every
 * failure here is a NORMAL situation a real person can hit (an expired link, a
 * link opened in the wrong account, a profile an agency already re-claimed).
 * The signed-in session must survive all of them so we can explain what
 * happened and offer the next step, instead of dumping the person on an error
 * page after they just created an account.
 *
 * Pure + exhaustively switched so a new RPC reason can't silently fall through
 * to a blank screen.
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
  title: string;
  body: string;
  /** Show the "go to my dashboard" CTA (only when they now own a profile). */
  showDashboard: boolean;
  /** Show "ask the agency to re-send" guidance. */
  showResendHint: boolean;
};

/**
 * @param agencyName display name of the inviting workspace, when known.
 */
export function presentClaimOutcome(
  verdict: ClaimVerdict,
  agencyName?: string | null,
): ClaimPresentation {
  const who = agencyName?.trim() || "the agency";

  switch (verdict.reason) {
    case "claimed":
      return {
        success: true,
        title: "Your profile is yours",
        body: verdict.exclusive_confirmed
          ? `You now control this profile. ${who} represents you exclusively and can keep managing your details and rates. You can review or end that from your dashboard whenever you want.`
          : `You now control this profile. ${who} can still see you on their roster, and you decide what they manage.`,
        showDashboard: true,
        showResendHint: false,
      };

    case "already_yours":
    case "already_redeemed_by_you":
      return {
        success: true,
        title: "You already own this profile",
        body: "Nothing more to do. This link was already used by your account.",
        showDashboard: true,
        showResendHint: false,
      };

    case "invite_expired":
      return {
        success: false,
        title: "This link has expired",
        body: `Claim links are time-limited for your security. Ask ${who} to send a fresh one.`,
        showDashboard: false,
        showResendHint: true,
      };

    case "invite_revoked":
      return {
        success: false,
        title: "This link was cancelled",
        body: `${who} cancelled this invite. Ask them to send a new one if you still want to claim your profile.`,
        showDashboard: false,
        showResendHint: true,
      };

    case "email_mismatch":
      return {
        success: false,
        title: "This link was sent to a different email",
        body: "For your protection a claim link only works for the address it was sent to. Sign in with that address, or ask for an invite to the email you prefer.",
        showDashboard: false,
        showResendHint: true,
      };

    case "invite_already_redeemed":
    case "profile_already_claimed":
      return {
        success: false,
        title: "This profile has already been claimed",
        body: `Someone has already taken ownership of it. If that wasn't you, contact ${who} — they can see who claimed it.`,
        showDashboard: false,
        showResendHint: false,
      };

    case "claimer_has_profile":
      return {
        success: false,
        title: "Your account already has a profile",
        body: `An account can only hold one talent profile, so we didn't touch either of them. Contact ${who} and they can merge the two — nothing has been lost.`,
        showDashboard: true,
        showResendHint: false,
      };

    case "invite_not_found":
    case "profile_unavailable":
      return {
        success: false,
        title: "We couldn't find that invite",
        body: `The link may be incomplete. Ask ${who} to send it again.`,
        showDashboard: false,
        showResendHint: true,
      };

    case "not_authenticated":
      return {
        success: false,
        title: "Please sign in first",
        body: "Sign in with the email your invite was sent to, and we'll finish claiming your profile.",
        showDashboard: false,
        showResendHint: false,
      };

    default:
      return {
        success: false,
        title: "Something went wrong",
        body: `We couldn't finish claiming your profile. Ask ${who} to send a fresh invite.`,
        showDashboard: false,
        showResendHint: true,
      };
  }
}
