/**
 * Talent-level master switches on `talent_sites` (Website Settings
 * Foundation, report §1/§7/§8). Pure — safe on server and client.
 *
 * A talent with no `talent_sites` row, or a row read before the columns
 * existed, is all-on: absence never pauses a talent.
 */
export type TalentChatConfig = {
  greeting: string | null;
  browseServices: boolean;
};

export type TalentSiteSwitches = {
  acceptingBookings: boolean;
  acceptingInquiries: boolean;
  chatEnabled: boolean;
  chatConfig: TalentChatConfig;
};

export const DEFAULT_TALENT_SITE_SWITCHES: TalentSiteSwitches = {
  acceptingBookings: true,
  acceptingInquiries: true,
  chatEnabled: true,
  chatConfig: { greeting: null, browseServices: true },
};

const GREETING_MAX = 280;

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

export function parseTalentChatConfig(raw: unknown): TalentChatConfig {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const g = typeof obj.greeting === "string" ? obj.greeting.trim() : "";
  return {
    greeting: g ? g.slice(0, GREETING_MAX) : null,
    browseServices: bool(obj.browseServices, true),
  };
}

/** Read the switches from a (possibly missing) talent_sites row. */
export function parseTalentSiteSwitches(
  row: {
    accepting_bookings?: unknown;
    accepting_inquiries?: unknown;
    chat_enabled?: unknown;
    chat_config?: unknown;
  } | null | undefined,
): TalentSiteSwitches {
  if (!row) return { ...DEFAULT_TALENT_SITE_SWITCHES, chatConfig: { ...DEFAULT_TALENT_SITE_SWITCHES.chatConfig } };
  return {
    acceptingBookings: bool(row.accepting_bookings, true),
    acceptingInquiries: bool(row.accepting_inquiries, true),
    chatEnabled: bool(row.chat_enabled, true),
    chatConfig: parseTalentChatConfig(row.chat_config),
  };
}
