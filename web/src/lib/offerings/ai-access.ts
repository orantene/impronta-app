/**
 * F3 (TUL-1273 #2): ONE rule for what an AI assistant may do on a site, so the
 * llms.txt text, the catalog APIs and the booking tools cannot disagree.
 *
 * Two powers, never conflated:
 *   - READ the catalog: what the public site already shows (guest-sellable
 *     services, the page's own price words). Always allowed; it is public.
 *   - BOOK through an assistant: hand a person a confirm link. Only when the
 *     owner turned the switch on. Default OFF. A business has no booking tool
 *     yet, so its switch is always off and says so.
 *
 * PURE.
 */

export type AiAccessSubject = "talent" | "business";

export type AiAccess = {
  /** An assistant may read the public catalog. */
  readCatalog: true;
  /** An assistant may start a booking hand-off. */
  bookViaAssistant: boolean;
};

export function resolveAiAccess(input: {
  subject: AiAccessSubject;
  /** The owner's "booking through AI assistants" switch; absent counts as OFF. */
  bookingSwitchOn?: boolean | null;
}): AiAccess {
  return {
    readCatalog: true,
    bookViaAssistant: input.subject === "talent" && input.bookingSwitchOn === true,
  };
}

/** The machine-readable block every catalog response carries. */
export function aiAccessJson(access: AiAccess): { read_catalog: true; book_via_assistant: boolean; booking_note: string } {
  return {
    read_catalog: access.readCatalog,
    book_via_assistant: access.bookViaAssistant,
    booking_note: access.bookViaAssistant
      ? "request_booking returns a link the person opens to confirm; nothing is booked by the assistant."
      : "Booking through AI assistants is off. Read the services and send the person to the site to book.",
  };
}
