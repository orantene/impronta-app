"use server";

import { logServerError } from "@/lib/server/safe-error";

import { loadTalentAgenda } from "./load";
import { loadRecordActor } from "./record-actor";
import { resolveRecordTarget, type RecordTargetDb } from "./resolve-record-target";
import { agendaItemFromSnapshot, agendaWindowAround } from "./record-item";
import { readTimelessBookingStub, type StubDb } from "./booking-stub";
import type { TalentAgendaItem } from "./types";

/**
 * F60: one agenda item for the booking record when the layout snapshot does
 * not have it yet (a booking saved a moment ago). Same reader as the agenda
 * (`loadTalentAgenda`), narrowed to a day either side of the booking. Her own rows only:
 * the booking is resolved by HER talent_profile_id (derived server-side from the verified
 * user), so another talent's id is null. Read through the service client keyed on that id,
 * never a tenant: the session client's row-level security is not a reliable reader for a
 * user who is both a talent and a workspace admin, nor for an impersonated one.
 */
export async function loadTalentAgendaRecordItem(bookingId: string): Promise<TalentAgendaItem | null> {
  try {
    return await readRecordItem(bookingId);
  } catch (error) {
    logServerError("talent-agenda.recordItem", error);
    return null;
  }
}

async function readRecordItem(bookingId: string): Promise<TalentAgendaItem | null> {
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return null;
  const actor = await loadRecordActor();
  if (!actor.ok) return null;
  // TUL-1244: talent_bookings, then agency bookings she is on, then an accepted offer's order id.
  const target = await resolveRecordTarget(
    { supabase: actor.admin as unknown as RecordTargetDb, admin: actor.admin as unknown as RecordTargetDb },
    actor.talentProfileId,
    bookingId,
  ).catch((error: unknown) => {
    logServerError("talent-agenda.recordItem", error);
    return null;
  });
  if (!target) return null;
  const window = agendaWindowAround(target.startsAt);
  if (!window) return null;
  const agenda = await loadTalentAgenda(actor.talentProfileId, window, {
    supabase: actor.admin as unknown as NonNullable<NonNullable<Parameters<typeof loadTalentAgenda>[2]>["supabase"]>,
  });
  return agendaItemFromSnapshot(agenda.items, target.bookingId);
}

type TimelessStub = { title: string; service: string | null; clientName: string | null; status: string | null };

/**
 * A booking with no time yet (a draft made when an offer was accepted) is not
 * in any agenda window, so the record used to fall back to a bare stub. This
 * reads what exists: the booking's own title, else the first order line's
 * label. Null when the booking is not hers (see booking-stub.ts for the ownership rule).
 */
export async function loadTalentTimelessBookingStub(bookingId: string): Promise<TimelessStub | null> {
  try {
    return await readStub(bookingId);
  } catch (error) {
    logServerError("talent-agenda.recordStub", error);
    return null;
  }
}

async function readStub(bookingId: string): Promise<TimelessStub | null> {
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return null;
  const actor = await loadRecordActor();
  if (!actor.ok) return null;
  return readTimelessBookingStub(
    { supabase: actor.admin as unknown as StubDb, admin: actor.admin as unknown as StubDb },
    actor.talentProfileId,
    bookingId,
  );
}
