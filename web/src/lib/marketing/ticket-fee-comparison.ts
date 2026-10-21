/**
 * What a ticket carries, here and on Eventbrite.
 *
 * The point of this table is not that we are cheaper. It is WHY the gap exists
 * and why it changes shape: Eventbrite charges a flat $1.79 per ticket on top
 * of a percentage, and a flat fee is a percentage that shrinks as the ticket
 * gets dearer. So it costs least on expensive tickets and punishes cheap ones
 * hardest. Ours is a flat percentage, so it is the same share at every price.
 *
 * VERIFIED AT SOURCE on 4 September 2026, from Eventbrite's own pricing page:
 * 3.7% + $1.79 service fee per paid ticket, plus 2.9% payment processing per
 * order. Their page also states that ticket fees are paid by buyers by default
 * and the organiser may choose to absorb them, which is why every number here
 * is expressed as what the TRANSACTION CARRIES rather than as what anybody
 * pays. An organiser who passes fees on could otherwise call us wrong on the
 * one page whose entire job is being checkable.
 *
 * WHY $10 AND $20 ARE THE HEADLINE AND $5 IS NOT.
 * The $5 row is the most dramatic and it is deliberately not the pitch. Our
 * own card cost on a typical Riviera Maya transaction is higher than the base
 * card rate (the exact figure is unverified and must not be quoted), so on a
 * $5 ticket we take $0.30 and the card cost can exceed it: we can lose money on
 * small tickets. Leading with the row where we look best would advertise hardest
 * into the segment that costs us most, and if it worked we would buy volume
 * that loses money on every transaction. So the row stays in the table as
 * evidence, and the copy leads on $10 to $20, which is the realistic
 * community event price and inside the range we can sustain.
 *
 * That is a timing constraint rather than a permanent one. If the currency
 * corridor question resolves, break-even drops sharply and the $5 row can
 * lead.
 */

/** Eventbrite, US, paid tickets. Read from their pricing page 4 Sep 2026. */
const EB_SERVICE_RATE = 0.037;
const EB_SERVICE_FLAT = 1.79;
const EB_PROCESSING_RATE = 0.029; // fee-config-ok: Eventbrite's published rate, not ours

export type FeeRow = {
  faceValue: number;
  /** Total the ticket carries on Eventbrite, in dollars. */
  eventbrite: number;
  /** ...as a share of face value. */
  eventbritePct: number;
  /** Total the ticket carries here. */
  tulala: number;
  /** The flat rate as a percentage, from live config. Stated so the flat shape
   *  is visible next to Eventbrite's shrinking one. */
  tulalaPct: number;
  /** True for the rows the copy leads on. See the module note above. */
  headline: boolean;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * @param tulalaRate the LIVE platform take as a fraction (a fraction, bps / 10000).
 * Callers resolve it from the live fee decision (ticket-fee-rates.ts); there is
 * no built-in default, a caller with no rate renders no table.
 */
export function ticketFeeRows(tulalaRate: number): FeeRow[] {
  const ratePct = Math.round(tulalaRate * 1000) / 10;
  return [5, 10, 20, 50, 100].map((faceValue) => {
    const eventbrite = round2(
      faceValue * EB_SERVICE_RATE + EB_SERVICE_FLAT + faceValue * EB_PROCESSING_RATE,
    );
    const tulala = round2(faceValue * tulalaRate);
    return {
      faceValue,
      eventbrite,
      eventbritePct: Math.round((eventbrite / faceValue) * 1000) / 10,
      tulala,
      tulalaPct: ratePct,
      headline: faceValue === 10 || faceValue === 20,
    };
  });
}

/** Their published terms, rendered so a reader can check our arithmetic. */
export const EVENTBRITE_TERMS = {
  checkedOn: "4 September 2026",
  checkedOnIso: "2026-09-04",
  sourceUrl: "https://www.eventbrite.com/organizer/pricing/",
  // fee-config-ok: Eventbrite published terms (competitor), not our rate
  en: "3.7% plus $1.79 per paid ticket, plus 2.9% payment processing per order. Their page states ticket fees are paid by buyers by default, and an organiser may choose to absorb them instead.",
  // fee-config-ok: Eventbrite published terms (competitor), not our rate
  es: "3.7% más $1.79 por boleto pagado, más 2.9% de procesamiento por orden. Su página dice que las cuotas las paga el comprador por defecto, y que el organizador puede elegir absorberlas.",
} as const;

/** The "checked on" date in the page language, so Spanish never prints "4 September". */
export function formatCheckedOn(locale: string): string {
  const es = locale.toLowerCase().startsWith("es");
  return new Date(`${EVENTBRITE_TERMS.checkedOnIso}T12:00:00Z`).toLocaleDateString(
    es ? "es-MX" : "en-GB",
    { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" },
  );
}
