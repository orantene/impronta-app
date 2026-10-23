/**
 * Demo/QA-only: Today money tiles built from the September ledger FIXTURE.
 *
 * Kept OUT of `today-money-tiles.ts` on purpose (TUL-1178): that module is
 * imported by client code (AgendaTodayPage), and importing the fixture view
 * there put the whole September spine read model in the admin bundle. Only
 * tests import this file; a static test pins that no client module does.
 */

import { moneyDefinition } from "./definitions";
import { formatMoneyMajor, formatMoneyShort } from "./money-spine-format";
import { buildMoneySpineView } from "./money-spine-view";
import { PAYOUT_ACCOUNT } from "./money-spine-chrome";
import type { TodayMoneyTile } from "./today-money-tiles";

/**
 * Three Today tiles from the Money read model. Amounts are major units from
 * `buildMoneySpineView()` — the September fixture, not invented copy.
 */
export function todayMoneyTilesFromLedger(): readonly TodayMoneyTile[] {
  const view = buildMoneySpineView();
  const s = view.summary;
  const currency = view.currency;
  const due = moneyDefinition("due_by_today");
  const next = s.next_payout_estimated;
  const nextDay = view.payouts.find((p) => p.state === "scheduled" || p.estimated === true);

  return [
    {
      id: "collected",
      labelEn: "Collected in September",
      labelEs: "Cobrado en septiembre",
      scopeEn: "gross, 1–23 Sep",
      scopeEs: "bruto, 1–23 sep",
      amountMajor: s.collected_gross,
      amountLabel: formatMoneyMajor(s.collected_gross, currency),
      linesEn: `${s.payments_count} payments · card ${formatMoneyShort(s.by_method.card)} · cash ${formatMoneyShort(s.by_method.cash)} · transfer ${formatMoneyShort(s.by_method.transfer)}`,
      linesEs: `${s.payments_count} pagos · tarjeta ${formatMoneyShort(s.by_method.card)} · efectivo ${formatMoneyShort(s.by_method.cash)} · transferencia ${formatMoneyShort(s.by_method.transfer)}`,
      landing: { tab: "payments" },
      tone: "default",
    },
    {
      id: "due_by_today",
      labelEn: due.labelEn,
      labelEs: due.labelEs,
      scopeEn: "overdue + today",
      scopeEs: "vencido + hoy",
      amountMajor: s.due_by_today,
      amountLabel: formatMoneyMajor(s.due_by_today, currency),
      linesEn: `${formatMoneyShort(s.outstanding_overdue)} overdue · ${formatMoneyShort(s.outstanding_today)} due today`,
      linesEs: `${formatMoneyShort(s.outstanding_overdue)} vencido · ${formatMoneyShort(s.outstanding_today)} hoy`,
      landing: { tab: "outstanding", outFilt: "today" },
      tone: "attention",
    },
    {
      id: "payout",
      labelEn: "Next payout · estimated",
      labelEs: "Próximo pago · estimado",
      scopeEn: "card only",
      scopeEs: "solo tarjeta",
      amountMajor: next ?? 0,
      amountLabel:
        next == null ? "—" : formatMoneyMajor(next, currency),
      linesEn:
        next == null || !nextDay
          ? "No estimated payout"
          : `About ${formatMoneyShort(next)} on Fri ${nextDay.day} (estimated) · ${PAYOUT_ACCOUNT.bank}`,
      linesEs:
        next == null || !nextDay
          ? "Sin depósito estimado"
          : `Cerca de ${formatMoneyShort(next)} el vie ${nextDay.day} (estimado) · ${PAYOUT_ACCOUNT.bank}`,
      landing: { tab: "payouts" },
      tone: "success",
    },
  ];
}
