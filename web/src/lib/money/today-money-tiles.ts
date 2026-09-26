/**
 * Today money tiles (Stage C M3 / audit F2).
 *
 * Compact three figures on Talent Today — Collected in September, Due by today,
 * Next payout · estimated — from the same M1 fixture + `summarizeMoneyLedger`
 * path as the Money spine. Due by today opens Outstanding with filter `"today"`
 * (`mc_out_today`). No snapshot-aggregations / earnings totals here.
 */

import { moneyDefinition } from "./definitions";
import { formatMoneyMajor, formatMoneyShort } from "./money-spine-format";
import {
  buildMoneySpineView,
  type MoneyTab,
  type OutstandingFilter,
} from "./money-spine-view";
import { PAYOUT_ACCOUNT } from "./money-spine-chrome";

export const MONEY_OPEN_STORAGE_KEY = "tulala:money:open";

export type MoneyLanding = {
  tab: MoneyTab;
  outFilt?: OutstandingFilter;
};

export type TodayMoneyTileId = "collected" | "due_by_today" | "payout";

export type TodayMoneyTile = {
  id: TodayMoneyTileId;
  labelEn: string;
  labelEs: string;
  scopeEn: string;
  scopeEs: string;
  amountMajor: number;
  amountLabel: string;
  linesEn: string;
  linesEs: string;
  landing: MoneyLanding;
  tone: "default" | "attention" | "success";
};

export function serializeMoneyLanding(landing: MoneyLanding): string {
  return JSON.stringify(landing);
}

export function parseMoneyLanding(raw: string | null | undefined): MoneyLanding | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { tab?: unknown; outFilt?: unknown };
    const tab = parsed.tab;
    if (tab !== "payments" && tab !== "outstanding" && tab !== "payouts") return null;
    const outFilt = parsed.outFilt;
    if (outFilt != null && outFilt !== "all" && outFilt !== "today" && outFilt !== "later") {
      return null;
    }
    return outFilt ? { tab, outFilt } : { tab };
  } catch {
    return null;
  }
}

export function pinMoneyLanding(landing: MoneyLanding): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(MONEY_OPEN_STORAGE_KEY, serializeMoneyLanding(landing));
  } catch {
    /* private mode / SSR */
  }
}

export function consumeMoneyLanding(): MoneyLanding | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const parsed = parseMoneyLanding(sessionStorage.getItem(MONEY_OPEN_STORAGE_KEY));
    sessionStorage.removeItem(MONEY_OPEN_STORAGE_KEY);
    return parsed;
  } catch {
    return null;
  }
}

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
