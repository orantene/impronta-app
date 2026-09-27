/**
 * Front-door brief Items-tab label for agency public docks (Impronta
 * Talk/Browse/Yours). Operator words overrides still win; this only replaces
 * the derived "Talent & services" default when the dock is an agency public
 * surface — not when intakeTradeForPreset happens to return "agency".
 */

const BROWSE: Readonly<Record<"en" | "es" | "fr", string>> = {
  en: "Browse",
  es: "Explorar",
  fr: "Parcourir",
};

/** Normalize request locale for the three Browse labels (en/es/fr). */
export function requestBrowseLocale(locale: string | null | undefined): "en" | "es" | "fr" {
  const base = (locale ?? "en").toLowerCase().split("-")[0] ?? "en";
  if (base === "es" || base === "fr") return base;
  return "en";
}

export function frontDoorBrowseLabel(locale: string | null | undefined): string {
  return BROWSE[requestBrowseLocale(locale)];
}

/**
 * Agency public docks paint DoR "Browse" instead of the L13 people default
 * ("Talent & services"). Custom `customers.chat_items` words still win.
 */
export function resolveGuestDockItemsLabel(input: {
  /** True only on agency public hosts (not hub, not talent vanity). */
  readonly agencyPublicSurface: boolean;
  readonly derivedLabel: string;
  readonly chatItemsCustomized: boolean;
  /** Request locale (may be fr); words.locale may be collapsed to en. */
  readonly locale: string | null | undefined;
}): string {
  if (input.agencyPublicSurface && !input.chatItemsCustomized) {
    return frontDoorBrowseLabel(input.locale);
  }
  return input.derivedLabel;
}
