/**
 * Desk name → mint holders. `anonymousSaleVerdict` accepts a display name
 * for `attendee_names` offerings; the mint only writes `holder_name` when
 * each line carries `holders`.
 */
export function admissionHoldersFromDeskContact(input: {
  units: number;
  displayName?: string | null;
  email?: string | null;
}): Array<{ name?: string | null; email?: string | null }> | undefined {
  const name = input.displayName?.trim() || null;
  const email = input.email?.trim() || null;
  if (!name && !email) return undefined;
  const count = Number.isFinite(input.units) && input.units > 0 ? Math.trunc(input.units) : 1;
  return Array.from({ length: count }, () => ({ name, email }));
}
