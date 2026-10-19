"use server";

import { resolveDashboardIdentity } from "@/lib/impersonation/dashboard-identity";
import { effectiveReadContext, type EffectiveReadContext } from "@/lib/impersonation/effective-read";
import { loadTalentActor } from "@/lib/messaging/talent-actor";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";

import { loadTalentAgenda } from "./load";
import { resolveRecordTarget, type RecordTargetDb } from "./resolve-record-target";
import { agendaItemFromSnapshot, agendaWindowAround } from "./record-item";
import { readTimelessBookingStub, type StubDb } from "./booking-stub";
import type { TalentAgendaItem } from "./types";

/**
 * The same effective user the talent layout reads as (a verified impersonation resolves the
 * talent being acted as). Without this the record resolved the staff session user, found no
 * talent profile, and both loaders returned null while the page itself rendered fine.
 */
async function recordReadContext(): Promise<EffectiveReadContext | undefined> {
  try {
    const session = await getCachedActorSession();
    if (!session.user) return undefined;
    const identity = await resolveDashboardIdentity().catch(() => null);
    return effectiveReadContext(session.user.id, identity);
  } catch {
    return undefined;
  }
}

/**
 * F60: one agenda item for the booking record when the layout snapshot does
 * not have it yet (a booking saved a moment ago). Same reader as the agenda
 * (`loadTalentAgenda`), narrowed to a day either side of the booking; the
 * booking is looked up by her own profile id, so another talent's id is null.
 */
export async function loadTalentAgendaRecordItem(bookingId: string): Promise<TalentAgendaItem | null> {
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return null;
  const ctx = await recordReadContext();
  const actor = await loadTalentActor(ctx);
  if (!actor.ok) return null;
  // Under impersonation the RLS client is the staff session, which cannot read her rows:
  // read through the service client, still keyed on her own talent_profile_id below.
  const readDb = ctx?.impersonated ? actor.admin : actor.supabase;
  // TUL-1244: talent_bookings, then agency bookings she is on, then an accepted offer's order id.
  const target = await resolveRecordTarget(
    { supabase: readDb as unknown as RecordTargetDb, admin: actor.admin as unknown as RecordTargetDb },
    actor.talentProfileId,
    bookingId,
  ).catch((error: unknown) => {
    logServerError("talent-agenda.recordItem", error);
    return null;
  });
  if (!target) return null;
  const window = agendaWindowAround(target.startsAt);
  if (!window) return null;
  const agenda = await loadTalentAgenda(
    actor.talentProfileId,
    window,
    ctx?.impersonated ? { supabase: actor.admin as unknown as NonNullable<NonNullable<Parameters<typeof loadTalentAgenda>[2]>["supabase"]> } : undefined,
  );
  return agendaItemFromSnapshot(agenda.items, target.bookingId);
}

/**
 * A booking with no time yet (a draft made when an offer was accepted) is not
 * in any agenda window, so the record used to fall back to a bare stub. This
 * reads what exists: the booking's own title, else the first order line's
 * label. Null when the booking is not hers.
 */
export async function loadTalentTimelessBookingStub(bookingId: string): Promise<{ title: string; service: string | null; clientName: string | null; status: string | null } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return null;
  const ctx = await recordReadContext();
  const actor = await loadTalentActor(ctx);
  if (!actor.ok) return null;
  return readTimelessBookingStub(
    { supabase: (ctx?.impersonated ? actor.admin : actor.supabase) as unknown as StubDb, admin: actor.admin as unknown as StubDb },
    actor.talentProfileId,
    bookingId,
  );
}
