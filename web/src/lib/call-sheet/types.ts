/**
 * Call sheet — shared types.
 *
 * Mirrors the JSONB shape stored on `agency_bookings.call_sheet_payload`
 * per migration 20260513171018. All fields optional; the editor
 * degrades gracefully on missing data.
 */

export interface CallSheetTalentEntry {
  talent_profile_id: string;
  call_time: string | null;   // "HH:MM" 24h
  wrap_time: string | null;
  role: string | null;        // free text — "lead", "supporting", etc.
  notes: string | null;
}

export interface CallSheetContact {
  name: string;
  role: string;               // "Coordinator", "Photographer", "MUA", etc.
  phone: string | null;
  email: string | null;
}

export interface CallSheetPayload {
  general_call_time: string | null;
  general_wrap_time: string | null;
  venue: string | null;
  venue_address: string | null;
  parking_note: string | null;
  holding_area: string | null;
  hmua_call_time: string | null;
  talents: CallSheetTalentEntry[];
  contacts: CallSheetContact[];
  transport_note: string | null;
  weather_note: string | null;
  internal_note: string | null;
}

export const EMPTY_CALL_SHEET: CallSheetPayload = {
  general_call_time: null,
  general_wrap_time: null,
  venue: null,
  venue_address: null,
  parking_note: null,
  holding_area: null,
  hmua_call_time: null,
  talents: [],
  contacts: [],
  transport_note: null,
  weather_note: null,
  internal_note: null,
};

/** Sanitize an arbitrary JSON value back into a typed CallSheetPayload
 *  with sane defaults — used when reading the JSONB column out of the
 *  DB. Never throws; always returns a usable object. */
export function normalizeCallSheetPayload(raw: unknown): CallSheetPayload {
  if (!raw || typeof raw !== "object") return { ...EMPTY_CALL_SHEET };
  const r = raw as Partial<CallSheetPayload> & { talents?: unknown; contacts?: unknown };
  return {
    general_call_time: typeof r.general_call_time === "string" ? r.general_call_time : null,
    general_wrap_time: typeof r.general_wrap_time === "string" ? r.general_wrap_time : null,
    venue: typeof r.venue === "string" ? r.venue : null,
    venue_address: typeof r.venue_address === "string" ? r.venue_address : null,
    parking_note: typeof r.parking_note === "string" ? r.parking_note : null,
    holding_area: typeof r.holding_area === "string" ? r.holding_area : null,
    hmua_call_time: typeof r.hmua_call_time === "string" ? r.hmua_call_time : null,
    talents: Array.isArray(r.talents) ? r.talents.flatMap(normalizeTalentEntry) : [],
    contacts: Array.isArray(r.contacts) ? r.contacts.flatMap(normalizeContact) : [],
    transport_note: typeof r.transport_note === "string" ? r.transport_note : null,
    weather_note: typeof r.weather_note === "string" ? r.weather_note : null,
    internal_note: typeof r.internal_note === "string" ? r.internal_note : null,
  };
}

function normalizeTalentEntry(raw: unknown): CallSheetTalentEntry[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as Partial<CallSheetTalentEntry>;
  if (typeof r.talent_profile_id !== "string" || !r.talent_profile_id) return [];
  return [{
    talent_profile_id: r.talent_profile_id,
    call_time: typeof r.call_time === "string" ? r.call_time : null,
    wrap_time: typeof r.wrap_time === "string" ? r.wrap_time : null,
    role: typeof r.role === "string" ? r.role : null,
    notes: typeof r.notes === "string" ? r.notes : null,
  }];
}

function normalizeContact(raw: unknown): CallSheetContact[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as Partial<CallSheetContact>;
  if (typeof r.name !== "string" || !r.name.trim()) return [];
  return [{
    name: r.name.trim(),
    role: typeof r.role === "string" ? r.role : "",
    phone: typeof r.phone === "string" ? r.phone : null,
    email: typeof r.email === "string" ? r.email : null,
  }];
}
