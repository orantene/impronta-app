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

/**
 * A booking with no time yet (a draft made when an offer was accepted) is not
 * in any agenda window, so the record used to fall back to a bare stub. This
 * reads what exists: the booking's own title, else the first order line's
 * label. Null when the booking is not hers.
 */
export async function loadTalentTimelessBookingStub(bookingId: string): Promise<{ title: string; service: string | null } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return null;
  const actor = await loadTalentActor();
  if (!actor.ok) return null;
  const { data } = await actor.admin
    .from("agency_bookings")
    .select("order_id, tenant_id")
    .eq("id", bookingId)
    .maybeSingle();
  const row = data as { order_id?: string | null; tenant_id?: string | null } | null;
  const { data: own } = await actor.supabase
    .from("talent_bookings")
    .select("title")
    .eq("id", bookingId)
    .eq("talent_profile_id", actor.talentProfileId)
    .maybeSingle();
  const title = ((own as { title?: string | null } | null)?.title ?? "").trim();
  let service: string | null = title || null;
  if (!service && row?.order_id) {
    const { data: line } = await actor.admin
      .from("order_lines")
      .select("label")
      .eq("order_id", row.order_id)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    service = ((line as { label?: string | null } | null)?.label ?? "").trim() || null;
  }
  if (!own && !row) return null;
  return { title: service ?? "", service };
}
