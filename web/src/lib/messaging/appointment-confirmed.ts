/**
 * The appointment confirmation Messages sends.
 *
 * Location privacy does not exist on talent_profiles. The exact address is
 * included only when a caller already has one. An empty address stays the
 * short confirmation, so the page never promises an address it cannot send.
 */

export function appointmentConfirmedBody(exactAddress: string | null | undefined): string {
  const address = exactAddress?.trim() ?? "";
  if (!address) return "Appointment confirmed";
  return `Appointment confirmed. Exact address: ${address}`;
}
