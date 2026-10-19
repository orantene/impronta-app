import {
  PRESENTATION_DEGRADE_ORDER,
  isPresentationMode,
  type PresentationEntitlements,
  type PresentationMode,
  type ResolvedPresentation,
  type ResolveServicePresentationInput,
} from "./types";
import { DEFAULT_PRESENTATION_MODE, tradeDefaultMode } from "./trade-defaults";

function degrade(
  wanted: PresentationMode,
  entitlements: PresentationEntitlements,
): PresentationMode {
  const start = PRESENTATION_DEGRADE_ORDER.indexOf(wanted);
  for (const mode of PRESENTATION_DEGRADE_ORDER.slice(start)) {
    if (mode === "book_direct" || entitlements.allowedModes.includes(mode)) return mode;
  }
  return "book_direct";
}

/** Pure: decides how one service opens on the public site. */
export function resolveServicePresentation(input: ResolveServicePresentationInput): ResolvedPresentation {
  if (!input.enabled) {
    return { mode: "book_direct", source: "legacy", legacy: true, degradedFrom: null };
  }
  let wanted: PresentationMode;
  let source: ResolvedPresentation["source"];
  if (isPresentationMode(input.setting)) {
    wanted = input.setting;
    source = "service";
  } else {
    const byTrade = tradeDefaultMode(input.tradeSlug);
    wanted = byTrade ?? DEFAULT_PRESENTATION_MODE;
    source = byTrade ? "trade_default" : "fallback_default";
  }
  const mode = degrade(wanted, input.entitlements);
  return { mode, source, legacy: false, degradedFrom: mode === wanted ? null : wanted };
}
