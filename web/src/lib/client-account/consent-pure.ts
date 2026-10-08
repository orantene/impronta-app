/**
 * When to stamp `client_profiles.marketing_opt_in_at`. The stamp records WHEN
 * the client gave consent, so re-saving the form with the same choice must not
 * move it. Pure: no I/O, no clock of its own.
 */

/**
 * Returns the `marketing_opt_in_at` patch for a save:
 * - value unchanged: `{}` (leave the stored stamp alone)
 * - turned on: stamp `nowIso`
 * - turned off: clear it (`null`)
 * A first save with no stored row counts as "was off".
 */
export function marketingConsentPatch(input: {
  previous: boolean | null | undefined;
  next: boolean;
  nowIso: string;
}): { marketing_opt_in_at?: string | null } {
  const was = input.previous === true;
  if (was === input.next) return {};
  return { marketing_opt_in_at: input.next ? input.nowIso : null };
}
