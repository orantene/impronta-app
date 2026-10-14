/**
 * TUL-847 · the location block's kind label follows how the service is
 * delivered. `studio_kind` defaults to "studio" until the talent opens
 * Services > Defaults, so a house cleaner who never touched it read "ESTUDIO"
 * for an at-home service. With no saved choice, a travel-to area or an
 * at-the-client trade means home visits. A saved choice always wins. Pure.
 */
import { classifyTrade, type TradeKey } from "@/lib/onboarding/trade-label";

import type { StudioKind } from "./location-settings";

/** Trades whose work happens at the client's place. */
const AT_CLIENT_TRADES: ReadonlySet<TradeKey> = new Set<TradeKey>(["cleaning"]);

export function effectiveStudioKind(input: {
  /** A `talent_location_settings` row exists (the talent chose). */
  saved: boolean;
  savedKind: StudioKind;
  /** The talent lists areas she travels to. */
  travelsToClients: boolean;
  /** Primary trade words (slug + English name). */
  tradeText: string | null;
}): StudioKind {
  if (input.saved) return input.savedKind;
  const atClientTrade = AT_CLIENT_TRADES.has(classifyTrade(input.tradeText) as TradeKey);
  return input.travelsToClients || atClientTrade ? "home_visits" : input.savedKind;
}
