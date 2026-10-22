/**
 * TUL-1256: Hoy "Needs attention" shows ONE number. The header badge counts
 * every row in the card: the agenda items plus the single "N clients waiting
 * for a reply" row. The "View all" link used to show the agenda items alone
 * (badge 7, "View all 6"), so both read this one total.
 */
export function todayAttentionTotal(agendaItems: number, awaitingReply: number): number {
  return agendaItems + (awaitingReply > 0 ? 1 : 0);
}
