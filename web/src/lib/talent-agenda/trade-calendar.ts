/**
 * T5.6 Per-trade calendar rules from TRADE_PROFILES (registry only).
 */

import { resolveTradeProfile } from "@/lib/talent-agenda/trades";

export type TradeCalendarRule = {
  prepBlocksLinked: boolean;
  deadlinesAllDay: boolean;
  deadlinesBlock: boolean;
  onlyCallsBlock: boolean;
  overnightDisplayToHour: number | null;
};

export function tradeCalendarRules(talentTypeSlug: string | null | undefined): TradeCalendarRule {
  const profile = resolveTradeProfile(talentTypeSlug);
  return {
    prepBlocksLinked: profile.kind === "event" && Boolean(profile.timeAround.prepBlocks),
    deadlinesAllDay: Boolean(profile.timeAround.deliveryDates) || profile.kind === "project",
    deadlinesBlock: false,
    onlyCallsBlock: profile.key === "design",
    overnightDisplayToHour: profile.key === "dancer" ? 26 : null,
  };
}
