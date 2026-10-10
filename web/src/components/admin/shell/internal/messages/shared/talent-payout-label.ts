import type { TalentPayoutSnapshot } from "@/lib/server-actions/talent-self";

/** Human payout-status phrase for the talent's booked take-home line. */
export function talentPayoutLabel(snap: TalentPayoutSnapshot | null): string {
  if (!snap || !snap.hasProfile) return "set up your payout account to get paid";
  switch (snap.status) {
    case "enabled":
      return "on its way to your connected payout account";
    case "pending":
      return "payout account verification pending";
    case "restricted":
      return "payout account needs attention";
    case "disabled":
      return "payout account disabled, contact support";
    default:
      return "connect a payout account to get paid";
  }
}
