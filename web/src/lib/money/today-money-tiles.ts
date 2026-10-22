/**
 * Today money tiles (Stage C M3 / audit F2) — types + landing helpers only.
 * The September-fixture tile builder lives in `today-money-tiles.fixture.ts`
 * (tests only) so the fixture never reaches a client bundle (TUL-1178).
 *
 * Compact three figures on Talent Today — Collected in September, Due by today,
 * Next payout · estimated — from the same M1 fixture + `summarizeMoneyLedger`
 * path as the Money spine. Due by today opens Outstanding with filter `"today"`
 * (`mc_out_today`). No snapshot-aggregations / earnings totals here.
 */

import type { MoneyTab, OutstandingFilter } from "./money-spine-view";

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
