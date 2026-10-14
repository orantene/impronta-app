/**
 * Per-site client account entry (TUL-694): the header icon / avatar.
 *
 * Three gates, all pure:
 *   1. host flag (`CLIENT_ACCOUNT_HOSTS`), the rollout gate;
 *   2. entitlement (`CLIENT_ACCOUNT_ENTITLED_PLANS`), so a plan or paid add-on can
 *      gate it later by config alone;
 *   3. the site's own Settings switch: `auto` (smart default), `show`, `hide`.
 *
 * Smart default (`auto`): ON when the site takes bookings (a site that takes
 * bookings also takes payments), OFF when it has paused them.
 */
export type ClientAccountEntrySetting = "auto" | "show" | "hide";

export function parseClientAccountEntrySetting(raw: unknown): ClientAccountEntrySetting {
  return raw === "show" || raw === "hide" ? raw : "auto";
}

/** Unset = every plan is entitled. A comma list of plan keys narrows it. */
export function clientAccountEntitled(planKey: string | null | undefined): boolean {
  const raw = process.env.CLIENT_ACCOUNT_ENTITLED_PLANS?.trim();
  if (!raw) return true;
  const plans = raw.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);
  return plans.length === 0 || (!!planKey && plans.includes(planKey.toLowerCase()));
}

export function clientAccountEntryDefault(input: { acceptingBookings: boolean }): boolean {
  return input.acceptingBookings;
}

export function resolveClientAccountEntry(input: {
  flagOn: boolean;
  setting: ClientAccountEntrySetting;
  acceptingBookings: boolean;
  entitled: boolean;
}): boolean {
  if (!input.flagOn || !input.entitled) return false;
  if (input.setting === "show") return true;
  if (input.setting === "hide") return false;
  return clientAccountEntryDefault(input);
}
