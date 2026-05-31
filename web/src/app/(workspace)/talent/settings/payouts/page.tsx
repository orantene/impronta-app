import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Legacy URL — payouts is now an in-shell talent section at /talent/payouts.
export default function LegacyTalentSettingsPayoutsRedirect() {
  redirect("/talent/payouts");
}
