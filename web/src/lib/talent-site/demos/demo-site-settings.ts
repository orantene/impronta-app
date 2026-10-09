/**
 * Wave 2: per-demo site switches so gallery previews show different booking /
 * inquiry / chat modes. Pure data; seed and rebuild writers apply it.
 */
import type { TalentSiteSwitches } from "@/lib/talent/site-switches";
import { DEFAULT_TALENT_SITE_SWITCHES } from "@/lib/talent/site-switches";

export type DemoSiteSettings = TalentSiteSwitches & {
  /** Primary site language(s) the demo content is written in. */
  siteLangs: readonly ("es" | "en")[];
  /** How bookings are framed in the profile panel. */
  bookingMode: "instant" | "request" | "quote" | "mixed";
  currency: "MXN" | "USD";
};

const base = (partial: Partial<DemoSiteSettings> & Pick<DemoSiteSettings, "siteLangs" | "bookingMode" | "currency">): DemoSiteSettings => {
  const { chatConfig: chatPartial, ...rest } = partial;
  return {
    ...DEFAULT_TALENT_SITE_SWITCHES,
    ...rest,
    chatConfig: {
      ...DEFAULT_TALENT_SITE_SWITCHES.chatConfig,
      ...(chatPartial ?? {}),
    },
  };
};

/**
 * Varied settings keyed by profile code. Demos not listed keep product defaults
 * (all on) so older seeds stay valid until rebuilt.
 */
export const DEMO_SITE_SETTINGS: Readonly<Record<string, DemoSiteSettings>> = {
  // Maison v1 seed + Alba: classic beauty, bookable + chat
  "TAL-93020": base({ siteLangs: ["es", "en"], bookingMode: "instant", currency: "MXN" }),
  "TAL-93003": base({ siteLangs: ["es", "en"], bookingMode: "instant", currency: "MXN" }),
  "TAL-93002": base({ siteLangs: ["es", "en"], bookingMode: "mixed", currency: "MXN", chatEnabled: true }),
  // Linh: request-only, chat off (shows a quieter rail)
  "TAL-93103": base({
    siteLangs: ["en"],
    bookingMode: "request",
    currency: "USD",
    acceptingBookings: true,
    acceptingInquiries: true,
    chatEnabled: false,
  }),
  "TAL-93104": base({ siteLangs: ["es"], bookingMode: "request", currency: "MXN", chatEnabled: false }),
  "TAL-93105": base({ siteLangs: ["es", "en"], bookingMode: "quote", currency: "MXN", acceptingBookings: false }),
  "TAL-93106": base({ siteLangs: ["en"], bookingMode: "instant", currency: "USD" }),
  "TAL-93107": base({ siteLangs: ["en"], bookingMode: "request", currency: "USD", chatEnabled: false }),
  // Folio
  "TAL-93011": base({ siteLangs: ["es", "en"], bookingMode: "quote", currency: "MXN", acceptingBookings: false }),
  "TAL-93004": base({ siteLangs: ["es", "en"], bookingMode: "request", currency: "MXN" }),
  "TAL-93109": base({ siteLangs: ["en"], bookingMode: "quote", currency: "USD", acceptingBookings: false, chatEnabled: false }),
  "TAL-93110": base({ siteLangs: ["en", "es"], bookingMode: "request", currency: "USD" }),
  "TAL-93111": base({ siteLangs: ["es", "en"], bookingMode: "request", currency: "MXN", chatEnabled: false }),
  "TAL-93112": base({ siteLangs: ["en"], bookingMode: "quote", currency: "USD", acceptingBookings: false }),
  "TAL-93113": base({ siteLangs: ["es", "en"], bookingMode: "request", currency: "MXN" }),
  "TAL-93114": base({ siteLangs: ["es", "en"], bookingMode: "mixed", currency: "MXN" }),
  // Gridline
  "TAL-93030": base({ siteLangs: ["es", "en"], bookingMode: "instant", currency: "MXN" }),
  "TAL-93206": base({ siteLangs: ["en"], bookingMode: "request", currency: "USD", chatEnabled: false }),
  "TAL-93207": base({ siteLangs: ["en"], bookingMode: "instant", currency: "USD" }),
  "TAL-93208": base({ siteLangs: ["es"], bookingMode: "quote", currency: "MXN", acceptingBookings: false }),
  "TAL-93209": base({ siteLangs: ["es"], bookingMode: "instant", currency: "MXN" }),
  "TAL-93210": base({ siteLangs: ["en"], bookingMode: "request", currency: "USD", chatEnabled: false }),
  "TAL-93211": base({ siteLangs: ["en"], bookingMode: "quote", currency: "USD", acceptingBookings: false }),
  "TAL-93212": base({ siteLangs: ["es", "en"], bookingMode: "mixed", currency: "MXN" }),
};

export function demoSiteSettingsFor(profileCode: string): DemoSiteSettings {
  return (
    DEMO_SITE_SETTINGS[profileCode] ??
    base({ siteLangs: ["es"], bookingMode: "mixed", currency: "MXN" })
  );
}

/** Columns written to `talent_sites` on seed / rebuild. */
export function demoSiteSwitchColumns(profileCode: string): {
  accepting_bookings: boolean;
  accepting_inquiries: boolean;
  chat_enabled: boolean;
  chat_config: {
    greeting: string | null;
    browseServices: boolean;
    aiBookingAssistantEnabled: boolean;
  };
} {
  const s = demoSiteSettingsFor(profileCode);
  return {
    accepting_bookings: s.acceptingBookings,
    accepting_inquiries: s.acceptingInquiries,
    chat_enabled: s.chatEnabled,
    chat_config: {
      greeting: s.chatConfig.greeting,
      browseServices: s.chatConfig.browseServices,
      aiBookingAssistantEnabled: s.chatConfig.aiBookingAssistantEnabled,
    },
  };
}
