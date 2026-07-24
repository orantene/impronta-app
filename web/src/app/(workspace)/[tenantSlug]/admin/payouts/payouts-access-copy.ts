/**
 * Shared access-denied copy for the Payouts surface.
 *
 * Lives in its own module (NOT in the neighbouring `"use server"` action
 * files) because a `"use server"` module may only export async functions —
 * exporting a plain const from one is a runtime 500, not a build error.
 *
 * Why the wording changed: the payouts gate is
 * `agency.payout_account.manage`, which sits in `OWNER_CAPS` in
 * `lib/access/roles.ts` — it is NOT granted to `admin`. The previous string
 * ("Forbidden — workspace admin only.") therefore told a workspace admin they
 * lacked a permission they visibly had, which reads as a broken page instead
 * of a role boundary. It also gave no next step.
 *
 * The matching Spanish translation lives in the admin shell dictionary
 * (`dashboard-i18n.ts`) keyed on this exact English string, so keep the two
 * in sync if you edit it.
 */
export const PAYOUTS_OWNER_ONLY_ERROR =
  "Only the workspace owner can manage payouts. Ask your owner to connect the payout account.";
