/**
 * claimEmailNotice — localized copy for a claim-email check result.
 *
 * The server action returns BOTH a `status` code and a `message` string, and
 * the two display sites (the contact gate + the account card's change-email
 * form) used to print the message — which is hardcoded English in
 * guest-chat-actions.ts, so a Spanish or French guest got English notices
 * inside an otherwise fully translated panel.
 *
 * The status code was always enough. This maps it through the catalogs; the
 * server `message` stays only as the fallback for a status this map has never
 * heard of (a newer server than client mid-deploy).
 *
 * `already_registered` renders differently by intent, which the CALLER knows
 * because it sent `replacePrimary`:
 *   replacing the primary  -> a hard block ("sign in with that account")
 *   just checking at the gate -> reassurance ("we'll send a sign-in link")
 */
import type { Translator } from "@/i18n/interpolate";
import type { GuestClaimEmailStatus } from "@/lib/inquiry/guest-chat-contract";

export function claimEmailNotice(
  t: Translator,
  status: GuestClaimEmailStatus,
  opts: { replacePrimary: boolean },
  serverMessage?: string,
): string | null {
  switch (status) {
    case "available":
      return null;
    case "team_account":
      return t("public.guestChat.emailTeamAccount");
    case "same_account":
      return t("public.guestChat.emailSameAccount");
    case "already_registered":
      return opts.replacePrimary
        ? t("public.guestChat.emailRegisteredReplace")
        : t("public.guestChat.emailRegisteredGate");
    default:
      return serverMessage ?? null;
  }
}
