/**
 * Talent vanity hosts reuse the guest dock, but they are never the hub.
 * Vocabulary is singular: services and appointments, no team, no lineup.
 */
import { chatItemsLabel } from "@/lib/words/chat-items-label";
import { INDUSTRY_PRESETS } from "@/lib/words/presets";
import type { WordLocale } from "@/lib/words/rows";

import type { GuestDockFlags } from "./guest-dock-flags";

export type GuestDockSurface = "hub" | "agency" | "talent_site";

function wordLocale(locale: string | null | undefined): WordLocale {
  return locale === "es" ? "es" : "en";
}

export function talentSiteGreeting(locale: string | null | undefined): string {
  const salon = INDUSTRY_PRESETS.find((p) => p.id === "salon_barber");
  return salon?.chatVoice[wordLocale(locale)] ?? "";
}

export function talentSiteDockFlags(locale: string | null | undefined): GuestDockFlags {
  const salon = INDUSTRY_PRESETS.find((p) => p.id === "salon_barber");
  const loc = wordLocale(locale);
  const dockItemsLabel = salon
    ? chatItemsLabel({
        locale: loc,
        preset: salon,
        word: () => "",
        sourceOf: () => "default",
      })
    : loc === "es"
      ? "Servicios"
      : "Services";
  return {
    dockItemsTab: true,
    dockCardsV5: true,
    dockItemsLabel,
    dockRepresentsPeople: false,
  };
}
