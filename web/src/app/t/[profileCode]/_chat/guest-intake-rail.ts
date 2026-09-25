/**
 * The guest progress rail. It names the next fact this trade still needs.
 * A booked inquiry already has its day, even when the draft date field is empty.
 */

import type { GuestChipValue } from "@/lib/inquiry/guest-chat-contract";
import type { InquiryIntent } from "@/lib/inquiry/inquiry-intent";

export type IntakeTrade = "beauty" | "chef" | "massage" | "agency";

export type RailFactId =
  | "day"
  | "hour"
  | "date"
  | "guests"
  | "allergies"
  | "kitchen"
  | "duration"
  | "place"
  | "people";

export type IntakeFacts = {
  day?: string | null;
  hour?: string | null;
  guests?: number | null;
  allergies?: string | null;
  kitchen?: string | null;
  duration?: string | null;
  place?: string | null;
  people?: number | null;
  booked?: boolean;
};

export type RailStep = { id: RailFactId; filled: boolean };

const ORDER: Record<IntakeTrade, RailFactId[]> = {
  beauty: ["day", "hour"],
  chef: ["date", "guests", "allergies", "kitchen"],
  massage: ["day", "hour", "duration", "place"],
  agency: ["date", "place", "people"],
};

function filled(id: RailFactId, facts: IntakeFacts): boolean {
  if ((id === "day" || id === "date") && facts.booked) return true;
  switch (id) {
    case "day":
    case "date":
      return Boolean(facts.day?.trim());
    case "hour":
      return Boolean(facts.hour?.trim());
    case "guests":
      return facts.guests != null && facts.guests > 0;
    case "people":
      return facts.people != null && facts.people > 0;
    case "allergies":
      return Boolean(facts.allergies?.trim());
    case "kitchen":
      return Boolean(facts.kitchen?.trim());
    case "place":
      return Boolean(facts.place?.trim());
    case "duration":
      return facts.duration === "60" || facts.duration === "90";
    default:
      return false;
  }
}

/** salon_barber, spa, private chef, and an agency. Anything else stays unlabeled. */
export function intakeTradeForPreset(presetId: string | null | undefined): IntakeTrade | null {
  switch (presetId) {
    case "salon_barber":
      return "beauty";
    case "spa_wellness":
      return "massage";
    case "private_chef":
      return "chef";
    case "agency":
    case "custom":
    case "portfolio":
    case "act":
      return "agency";
    default:
      return null;
  }
}

export function intakeSteps(trade: IntakeTrade, facts: IntakeFacts): RailStep[] {
  return ORDER[trade].map((id) => ({ id, filled: filled(id, facts) }));
}

function factLabel(id: RailFactId, t: (key: string) => string): string {
  switch (id) {
    case "day":
      return t("public.guestChat.railFactDay");
    case "hour":
      return t("public.guestChat.railFactHour");
    case "date":
      return t("public.guestChat.railFactDate");
    case "guests":
      return t("public.guestChat.railFactGuests");
    case "allergies":
      return t("public.guestChat.railFactAllergies");
    case "kitchen":
      return t("public.guestChat.railFactKitchen");
    case "duration":
      return t("public.guestChat.railFactDuration");
    case "place":
      return t("public.guestChat.railFactPlace");
    case "people":
      return t("public.guestChat.railFactPeople");
  }
}

/** First visit says nothing yet. A draft names the next missing fact. */
export function intakeRailLabel(
  trade: IntakeTrade,
  facts: IntakeFacts,
  hasInquiry: boolean,
  t: (key: string) => string,
): string {
  if (!hasInquiry) return t("public.guestChat.railNothing");
  const next = nextIntakeFact(trade, facts);
  if (next === "ready") return t("public.guestChat.railReady");
  return t("public.guestChat.railMissing").replace("{fact}", factLabel(next, t));
}

/** Column helper: null trade → no rail. Keeps MiniChatPanelColumn under max-lines. */
export function resolveGuestRailLabel(
  trade: IntakeTrade | null | undefined,
  intent: InquiryIntent | null | undefined,
  captured: Partial<Record<string, GuestChipValue>> | null | undefined,
  booked: boolean,
  hasInquiry: boolean,
  t: (key: string) => string,
): string | null {
  if (!trade) return null;
  return intakeRailLabel(trade, intakeFactsFromInquiry(intent, captured, booked), hasInquiry, t);
}

/** The next missing fact, or "ready" when every fact this trade asks for is set. */
export function nextIntakeFact(trade: IntakeTrade, facts: IntakeFacts): RailFactId | "ready" {
  return intakeSteps(trade, facts).find((step) => !step.filled)?.id ?? "ready";
}

function durationToken(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (/\b90\b/.test(raw)) return "90";
  if (/\b60\b/.test(raw)) return "60";
  return null;
}

/** Read the rail from the inquiry the guest already has. Missing fields stay missing. */
export function intakeFactsFromInquiry(
  intent: InquiryIntent | null | undefined,
  captured: Partial<Record<string, GuestChipValue>> | null | undefined,
  booked: boolean,
): IntakeFacts {
  const date = captured?.date;
  const location = captured?.location;
  const head = captured?.headcount?.headcount ?? intent?.talent?.count_needed ?? null;
  const place = location?.city?.trim() || intent?.location?.venue_name?.trim() || intent?.location?.city?.trim() || null;
  return {
    booked,
    day: date?.eventDate?.trim() || intent?.date?.event_date?.trim() || null,
    hour: intent?.date?.start_time?.trim() || null,
    guests: head,
    people: head,
    allergies: intent?.brief?.special_requirements?.trim() || null,
    kitchen: place,
    place,
    duration: durationToken(intent?.date?.duration),
  };
}
