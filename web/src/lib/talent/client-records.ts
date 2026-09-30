import type { TalentClientRow } from "./clients-merge";

/** Overlay row from `talent_client_records` (what the talent typed on top). */
export type ClientRecordOverlay = {
  clientKey: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  note: string | null;
  archivedAt: string | null;
};

export type ClientRecordErrorCode =
  | "forbidden"
  | "invalid_name"
  | "invalid_email"
  | "invalid_phone"
  | "too_long"
  | "not_found"
  | "unavailable"
  | "failed";

export type ClientDetailsInput = { name: string; email?: string | null; phone?: string | null };
export type ClientDetails = { name: string; email: string | null; phone: string | null };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const CLIENT_NOTE_MAX = 4000;

function clean(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s.length > 0 ? s : null;
}

export function parseClientDetails(
  input: ClientDetailsInput,
): { ok: true; value: ClientDetails } | { ok: false; code: ClientRecordErrorCode } {
  const name = clean(input.name);
  if (!name) return { ok: false, code: "invalid_name" };
  if (name.length > 200) return { ok: false, code: "too_long" };
  const email = clean(input.email);
  if (email && (email.length > 320 || !EMAIL.test(email))) return { ok: false, code: "invalid_email" };
  const phone = clean(input.phone);
  if (phone && (phone.length > 40 || !/\d/.test(phone))) return { ok: false, code: "invalid_phone" };
  return { ok: true, value: { name, email, phone } };
}

export function parseClientNote(
  note: string | null | undefined,
): { ok: true; value: string | null } | { ok: false; code: ClientRecordErrorCode } {
  const v = clean(note);
  if (v && v.length > CLIENT_NOTE_MAX) return { ok: false, code: "too_long" };
  return { ok: true, value: v };
}

export function isManualClientKey(key: string): boolean {
  return key.startsWith("record:");
}

/**
 * Lay the talent's own edits over the derived list: overrides win, archived
 * clients drop out, hand-added clients append. Pure, so the read path is
 * testable without a database.
 */
export function applyClientRecords(
  derived: TalentClientRow[],
  overlays: ClientRecordOverlay[],
): TalentClientRow[] {
  const byKey = new Map(overlays.map((o) => [o.clientKey, o]));
  const out: TalentClientRow[] = [];
  const seen = new Set<string>();
  for (const row of derived) {
    const o = byKey.get(row.id);
    seen.add(row.id);
    if (!o) {
      out.push(row);
      continue;
    }
    if (o.archivedAt) continue;
    out.push({
      ...row,
      name: o.name ?? row.name,
      email: o.email ?? row.email,
      phone: o.phone ?? row.phone,
      note: o.note,
    });
  }
  for (const o of overlays) {
    if (seen.has(o.clientKey) || o.archivedAt || !isManualClientKey(o.clientKey) || !o.name) continue;
    out.push({
      id: o.clientKey,
      name: o.name,
      lastVisit: null,
      completedCount: 0,
      visitCount: 0,
      amountOwedCents: null,
      currency: null,
      conversationHref: null,
      source: "booking",
      phone: o.phone,
      email: o.email,
      nextStartsAt: null,
      nextStatus: null,
      nextBookingHref: null,
      overdue: false,
      firstSeenAt: null,
      history: [],
      note: o.note,
      manual: true,
    });
  }
  return out;
}
