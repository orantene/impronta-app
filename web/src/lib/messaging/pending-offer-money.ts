/**
 * TUL-957: the Dinero panel of a thread whose only money is a SENT offer (no
 * order yet). The offer total is shown as owed and unpaid, so the panel no
 * longer says "Sin cargos aun". Pure; offers store `total_client_price` in major
 * units, the panel works in cents.
 */
import { tryMajorToMinor } from "@/lib/inquiry/offer-minor-units";

export type PendingOfferMoney = { totalCents: number; paidCents: number; balanceCents: number; currency: string };

export function pendingOfferMoney(totalMajor: number, currency: string): PendingOfferMoney | null {
  if (!Number.isFinite(totalMajor) || totalMajor <= 0) return null;
  const totalCents = tryMajorToMinor(totalMajor, currency);
  if (totalCents == null || totalCents <= 0) return null;
  return { totalCents, paidCents: 0, balanceCents: totalCents, currency: currency.trim().toUpperCase() };
}
