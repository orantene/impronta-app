/**
 * Cross-context busy projection — prevents conflicting work without leaking
 * another customer's identity (N22).
 */

export type BusyProjection = {
  startsAt: string;
  endsAt: string;
  /** Always opaque — never a customer name. */
  label: "Busy";
};

export function projectBusyWithoutIdentity(input: {
  startsAt: string;
  endsAt: string;
  customerLabel?: string | null;
}): BusyProjection {
  void input.customerLabel;
  return { startsAt: input.startsAt, endsAt: input.endsAt, label: "Busy" };
}

export function windowsOverlap(a: BusyProjection, b: BusyProjection): boolean {
  const a0 = Date.parse(a.startsAt);
  const a1 = Date.parse(a.endsAt);
  const b0 = Date.parse(b.startsAt);
  const b1 = Date.parse(b.endsAt);
  if (![a0, a1, b0, b1].every(Number.isFinite)) return false;
  return a0 < b1 && b0 < a1;
}
