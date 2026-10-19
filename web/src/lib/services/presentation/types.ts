/** How a service opens on the public site. */
export const PRESENTATION_MODES = ["own_page", "quick_view", "expand", "book_direct"] as const;
export type PresentationMode = (typeof PRESENTATION_MODES)[number];

/** Richest to simplest. Degradation walks this order from the requested mode downward. */
export const PRESENTATION_DEGRADE_ORDER: readonly PresentationMode[] = PRESENTATION_MODES;

export function isPresentationMode(value: unknown): value is PresentationMode {
  return typeof value === "string" && (PRESENTATION_MODES as readonly string[]).includes(value);
}

/** Plain input so the resolver stays pure. `book_direct` is always implicitly allowed. */
export type PresentationEntitlements = {
  allowedModes: readonly PresentationMode[];
};

export type PresentationSource = "legacy" | "service" | "trade_default" | "fallback_default";

export type ResolvedPresentation = {
  mode: PresentationMode;
  source: PresentationSource;
  /** True only when the flag is off: callers keep today's behaviour. */
  legacy: boolean;
  /** The mode that was wanted before the plan forced a simpler one, else null. */
  degradedFrom: PresentationMode | null;
};

export type ResolveServicePresentationInput = {
  /** Result of servicePresentationResolverEnabled(); passed in to keep this pure. */
  enabled: boolean;
  /** Per-service setting; null/undefined when unset. */
  setting?: PresentationMode | null;
  /** Talent type / trade slug, e.g. "barber", "photographer". */
  tradeSlug?: string | null;
  entitlements: PresentationEntitlements;
};
