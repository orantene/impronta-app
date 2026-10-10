/**
 * TUL-516 E2: who-step place honesty. Studio services keep the "we'll send
 * the address" note; client-place services say we come to them (and collect
 * the address field). Remote is online. Pure so the sheet and the matrix test
 * share one rule.
 */
import type { OfferingDeliveryWhere } from "@/lib/talent/offering-request-detail";

/** Place note under the who-step recap. Null = hide the line. */
export function catalogWhoPlaceNote(
  where: readonly OfferingDeliveryWhere[] | null | undefined,
  locale?: string | null,
): string | null {
  const es = !(locale ?? "es").toLowerCase().startsWith("en");
  const list = Array.isArray(where) ? where : [];
  if (list.includes("client")) {
    return es ? "Vamos a tu domicilio" : "We'll come to your place";
  }
  if (list.length === 1 && list[0] === "remote") {
    return es ? "La sesión es en línea" : "This session is online";
  }
  if (list.includes("studio")) {
    return es
      ? "Te enviamos la ubicación exacta al confirmar"
      : "We'll send the exact address when you confirm";
  }
  // Empty / agreed / unknown: keep the studio-era note (TUL-59 default).
  return es
    ? "Te enviamos la ubicación exacta al confirmar"
    : "We'll send the exact address when you confirm";
}
