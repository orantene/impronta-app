/**
 * Money number definitions (audit 3.1 / `mc_defs`).
 *
 * One vocabulary for Money, Today, Clients, and receipts. Surfaces import these
 * ids; they do not invent alternate meanings for "collected" or "outstanding".
 *
 * Per currency only — never sum across currencies (decision D7 / DECISIONS #4).
 */

export type MoneyDefinitionId =
  | "collected"
  | "refunded"
  | "collected_after_refunds"
  | "outstanding"
  | "due_by_today"
  | "payment_request_waiting"
  | "platform_payout"
  | "recorded_outside_tulala"
  | "agency_money"
  | "client_numbers"
  | "dates_on_rows";

export type MoneyDefinition = {
  id: MoneyDefinitionId;
  /** Short label (EN). */
  labelEn: string;
  /** Short label (ES). */
  labelEs: string;
  /** Meaning (EN) — matches `mc_defs` / Part 1 p04. */
  meaningEn: string;
  /** Meaning (ES). */
  meaningEs: string;
};

/**
 * Canonical definitions. Copy tracks the visual-spec / prototype `mc_defs`
 * register; September example amounts live in the ledger fixture, not here.
 */
export const MONEY_DEFINITIONS: readonly MoneyDefinition[] = [
  {
    id: "collected",
    labelEn: "Collected",
    labelEs: "Cobrado",
    meaningEn:
      "Successful payments received in the period, by any method, before refunds (gross). Includes deposits for work not done yet, so it is not earned or profit.",
    meaningEs:
      "Pagos recibidos en el periodo, por cualquier método, antes de reembolsos (bruto). Incluye anticipos de trabajo futuro: no es ganado ni utilidad.",
  },
  {
    id: "refunded",
    labelEn: "Refunded",
    labelEs: "Reembolsado",
    meaningEn:
      "Money returned, always linked to its original payment and shown with its own date and state.",
    meaningEs:
      "Dinero devuelto, ligado a su pago original, con su propia fecha y estado.",
  },
  {
    id: "collected_after_refunds",
    labelEn: "Collected after refunds",
    labelEs: "Cobrado después de reembolsos",
    meaningEn: "Collected gross minus refunded in the same period.",
    meaningEs: "Cobrado bruto menos reembolsado en el mismo periodo.",
  },
  {
    id: "outstanding",
    labelEn: "Outstanding",
    labelEs: "Pendiente",
    meaningEn:
      "The unpaid part of agreed work, from any month: agreed price minus what was paid, after adjustments. Split into overdue, due today and later.",
    meaningEs:
      "La parte sin pagar de trabajo acordado, de cualquier mes. Se divide en vencido, hoy y después.",
  },
  {
    id: "due_by_today",
    labelEn: "Due by today",
    labelEs: "Por cobrar hasta hoy",
    meaningEn:
      "Overdue plus due today. Opens Outstanding with that filter (Today tile).",
    meaningEs:
      "Vencido más hoy. Abre Pendiente con ese filtro (mosaico de Hoy).",
  },
  {
    id: "payment_request_waiting",
    labelEn: "Payment request waiting",
    labelEs: "Solicitud en espera",
    meaningEn:
      "A link sent but not paid. Not money received, and for a hold not money owed either.",
    meaningEs:
      "Un enlace enviado sin pagar. No es dinero recibido y, en un apartado, tampoco es deuda.",
  },
  {
    id: "platform_payout",
    labelEn: "Platform payout",
    labelEs: "Depósito de la plataforma",
    meaningEn:
      "Card money transferred to the bank on Fridays, after refunds and processor fees. States: scheduled (estimated), paid, failed. Its dates do not follow calendar months.",
    meaningEs:
      "Dinero de tarjeta transferido los viernes, tras reembolsos y comisiones. Estados: programado (estimado), depositado, fallido.",
  },
  {
    id: "recorded_outside_tulala",
    labelEn: "Recorded outside Tulala",
    labelEs: "Registrado fuera de Tulala",
    meaningEn:
      "Cash or transfers you recorded: counted as collected, never part of a payout.",
    meaningEs:
      "Efectivo o transferencias que registraste: cuentan como cobrado, nunca en un depósito.",
  },
  {
    id: "agency_money",
    labelEn: "Agency money",
    labelEs: "Dinero de agencia",
    meaningEn:
      'Fees an agency owes you, with its terms. "Reported by the agency" unless it passed through Tulala. Kept out of Outstanding from clients.',
    meaningEs:
      'Tarifas que te debe una agencia, con sus términos. "Reportado por la agencia" si no pasó por Tulala.',
  },
  {
    id: "client_numbers",
    labelEn: "Client numbers",
    labelEs: "Números de clienta",
    meaningEn:
      'Completed appointments count only finished work. "Collected from her" includes deposits for upcoming work and says so. Averages use completed work only.',
    meaningEs:
      'Las citas completadas cuentan solo trabajo terminado. "Cobrado" incluye anticipos y lo dice. Los promedios usan solo trabajo completado.',
  },
  {
    id: "dates_on_rows",
    labelEn: "Dates on rows",
    labelEs: "Fechas en filas",
    meaningEn:
      'Each row names its date: "Booking Mon 21", "Due today", "Received Tue 22". A bare date is never shown next to an amount owed.',
    meaningEs:
      'Cada fila nombra su fecha: "Reserva lun 21", "Hoy", "Recibido mar 22".',
  },
] as const;

export function moneyDefinition(id: MoneyDefinitionId): MoneyDefinition {
  const found = MONEY_DEFINITIONS.find((d) => d.id === id);
  if (!found) {
    throw new Error(`Unknown money definition id: ${id}`);
  }
  return found;
}
