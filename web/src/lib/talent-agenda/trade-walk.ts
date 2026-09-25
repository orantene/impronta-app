/**
 * T9.1 Trade walk checklist — four screens × ten trades via registry only.
 * Fixes go through TRADE_PROFILES or TradeSections, never trade-named components.
 */

import { TRADE_PROFILES, resolveTradeProfile } from "./trades";
import { tradeCalendarRules } from "./trade-calendar";

export const TRADE_WALK_SCREENS = ["today", "calendar", "record", "new"] as const;

export const TRADE_WALK_KEYS = [
  "beauty",
  "barber",
  "massage",
  "chef",
  "dancer",
  "trainer",
  "photo",
  "tutor",
  "clean",
  "design",
] as const;

export type TradeWalkKey = (typeof TRADE_WALK_KEYS)[number];
export type TradeWalkScreen = (typeof TRADE_WALK_SCREENS)[number];

export type TradeWalkCell = {
  trade: TradeWalkKey;
  screen: TradeWalkScreen;
  kind: string;
  newLabelEn: string;
  newLabelEs: string;
  calendar: ReturnType<typeof tradeCalendarRules>;
};

/** Pure matrix for QA / unit proof that every trade resolves for every screen. */
export function buildTradeWalkMatrix(): TradeWalkCell[] {
  const out: TradeWalkCell[] = [];
  for (const trade of TRADE_WALK_KEYS) {
    const profile = TRADE_PROFILES[trade] ?? resolveTradeProfile(trade);
    for (const screen of TRADE_WALK_SCREENS) {
      out.push({
        trade,
        screen,
        kind: profile.kind,
        newLabelEn: profile.words.newLabel[0],
        newLabelEs: profile.words.newLabel[1],
        calendar: tradeCalendarRules(trade),
      });
    }
  }
  return out;
}

export function assertTradeWalkComplete(cells: readonly TradeWalkCell[] = buildTradeWalkMatrix()): void {
  const expected = TRADE_WALK_KEYS.length * TRADE_WALK_SCREENS.length;
  if (cells.length !== expected) {
    throw new Error(`Trade walk size ${cells.length} !== ${expected}`);
  }
  for (const cell of cells) {
    if (!cell.newLabelEn || !cell.newLabelEs) {
      throw new Error(`Missing newLabel for ${cell.trade}/${cell.screen}`);
    }
    if (!cell.kind) throw new Error(`Missing kind for ${cell.trade}`);
  }
}
