"use server";

import { loadTalentActor } from "@/lib/messaging/talent-actor";
import { logServerError } from "@/lib/server/safe-error";

import { loadTalentAgenda } from "./load";
import { agendaItemFromSnapshot, agendaWindowAround } from "./record-item";
import type { TalentAgendaItem } from "./types";

/**
 * F60: one agenda item for the booking record when the layout snapshot does
 * not have it yet (a booking saved a moment ago). Same reader as the agenda
 * (`loadTalentAgenda`), narrowed to a day either side of the booking; the
 * booking is looked up by her own profile id, so another talent's id is null.
 */
export async function loadTalentAgendaRecordItem(bookingId: string): Promise<TalentAgendaItem | null> {
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return null;
  const actor = await loadTalentActor();
  if (!actor.ok) return null;
  const { data, error } = await actor.supabase
    .from("talent_bookings")
    .select("starts_at")
    .eq("id", bookingId)
    .eq("talent_profile_id", actor.talentProfileId)
    .maybeSingle();
  if (error) {
    logServerError("talent-agenda.recordItem", error);
    return null;
  }
  const window = agendaWindowAround((data as { starts_at?: string } | null)?.starts_at ?? "");
  if (!window) return null;
  const agenda = await loadTalentAgenda(actor.talentProfileId, window);
  return agendaItemFromSnapshot(agenda.items, bookingId);
}
