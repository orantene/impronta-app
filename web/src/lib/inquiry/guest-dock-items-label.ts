/**
 * Front-door brief Items-tab label for agency docks (Impronta Talk/Browse/Yours).
 * Operator words overrides still win; this only replaces the derived
 * "Talent & services" default when dockIntake is agency.
 */

import type { IntakeTrade } from "@/app/t/[profileCode]/_chat/guest-intake-rail";

const BROWSE: Readonly<Record<"en" | "es" | "fr", string>> = {
  en: "Browse",
  es: "Explorar",
  fr: "Parcourir",
};

export function frontDoorBrowseLabel(locale: string | null | undefined): string {
  if (locale === "es" || locale === "fr") return BROWSE[locale];
  return BROWSE.en;
}

/**
 * Agency front-door docks paint DoR "Browse" instead of the L13 people default
 * ("Talent & services"). Custom `customers.chat_items` words still win.
 */
export function resolveGuestDockItemsLabel(input: {
  readonly dockIntake: IntakeTrade | null;
  readonly derivedLabel: string;
  readonly chatItemsCustomized: boolean;
  readonly locale: string | null | undefined;
}): string {
  if (input.dockIntake === "agency" && !input.chatItemsCustomized) {
    return frontDoorBrowseLabel(input.locale);
  }
  return input.derivedLabel;
}
