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
  try {
    return await readRecordItem(bookingId);
  } catch (error) {
    logServerError("talent-agenda.recordItem", error);
    console.error("[4114 debug] record item threw", error); // TEMP #4114 debug: remove after lh proof
    return null;
  }
}

async function readRecordItem(bookingId: string): Promise<TalentAgendaItem | null> {
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return null;
  const ctx = await recordReadContext();
  const actor = await loadTalentActor(ctx, undefined, { firstProfile: true, adminFallback: true });
  if (!actor.ok) {
    console.error("[4114 debug] actor not ok", actor.reason, "impersonated:", Boolean(ctx?.impersonated)); // TEMP #4114 debug: remove after lh proof
    return null;
  }
  // Her own rows, read through the service client keyed on HER profile ids (never a tenant):
  // the session client's row-level security is not a reliable reader for a user who is both a
  // talent and a workspace admin, nor for an impersonated one. A user can own several talent
  // profiles (hub plus workspace-owned), so each of hers is tried; the booking must be hers.
  const ids = await ownProfileIds(actor);
  for (const talentProfileId of ids) {
    // TUL-1244: talent_bookings, then agency bookings she is on, then an accepted offer's order id.
    const target = await resolveRecordTarget(
      { supabase: actor.admin as unknown as RecordTargetDb, admin: actor.admin as unknown as RecordTargetDb },
      talentProfileId,
      bookingId,
    ).catch((error: unknown) => {
      logServerError("talent-agenda.recordItem", error);
      return null;
    });
    if (!target) {
      console.error("[4114 debug] no record target for profile", talentProfileId); // TEMP #4114 debug: remove after lh proof
      continue;
    }
    const window = agendaWindowAround(target.startsAt);
    if (!window) continue;
    const agenda = await loadTalentAgenda(talentProfileId, window, {
      supabase: actor.admin as unknown as NonNullable<NonNullable<Parameters<typeof loadTalentAgenda>[2]>["supabase"]>,
    });
    const item = agendaItemFromSnapshot(agenda.items, target.bookingId);
    if (item) return item;
    console.error("[4114 debug] target found but agenda item missing", agenda.items.length); // TEMP #4114 debug: remove after lh proof
  }
  return null;
}

/** Every talent profile id the effective user owns, the actor's own first. Read only. */
async function ownProfileIds(actor: { talentProfileId: string; userId: string; admin: unknown }): Promise<string[]> {
  const out = [actor.talentProfileId];
  try {
    const res = await (actor.admin as { from(t: string): { select(c: string): { eq(c: string, v: string): PromiseLike<{ data: unknown }> } } })
      .from("talent_profiles")
      .select("id")
      .eq("user_id", actor.userId);
    for (const row of (res.data ?? []) as Array<{ id?: unknown }>) {
      if (typeof row.id === "string" && !out.includes(row.id)) out.push(row.id);
    }
  } catch {
    // keep the actor's own profile
  }
  return out;
}

/**
 * A booking with no time yet (a draft made when an offer was accepted) is not
 * in any agenda window, so the record used to fall back to a bare stub. This
 * reads what exists: the booking's own title, else the first order line's
 * label. Null when the booking is not hers.
 */
type TimelessStub = { title: string; service: string | null; clientName: string | null; status: string | null };

export async function loadTalentTimelessBookingStub(bookingId: string): Promise<TimelessStub | null> {
  try {
    return await readStub(bookingId);
  } catch (error) {
    logServerError("talent-agenda.recordStub", error);
    console.error("[4114 debug] stub threw", error); // TEMP #4114 debug: remove after lh proof
    return null;
  }
}

async function readStub(bookingId: string): Promise<TimelessStub | null> {
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return null;
  const ctx = await recordReadContext();
  const actor = await loadTalentActor(ctx, undefined, { firstProfile: true, adminFallback: true });
  if (!actor.ok) {
    console.error("[4114 debug] actor not ok", actor.reason, "impersonated:", Boolean(ctx?.impersonated)); // TEMP #4114 debug: remove after lh proof
    return null;
  }
  for (const talentProfileId of await ownProfileIds(actor)) {
    const stub = await readTimelessBookingStub(
      { supabase: actor.admin as unknown as StubDb, admin: actor.admin as unknown as StubDb },
      talentProfileId,
      bookingId,
    );
    if (stub) return stub;
  }
  console.error("[4114 debug] stub not found for any of her profiles"); // TEMP #4114 debug: remove after lh proof
  return null;
}
