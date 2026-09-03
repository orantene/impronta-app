"use server";

/**
 * admin-reservation-rules.ts — the write half of workspace Settings →
 * Reservations.
 *
 * AUTH. `requireWorkspaceStaffAction()` resolves the caller's tenant from the
 * session; `tenantId` comes from that scope and NEVER from client input, so a
 * workspace can only ever change its own venue. The venue id IS client input,
 * so every statement in `lib/reservations/store.ts` carries the resolved
 * tenant alongside it — guessing a venue id from another workspace matches no
 * row.
 *
 * A KNOWN WEAKNESS, STATED RATHER THAN HIDDEN. This uses the same default
 * staff gate every other settings page uses, which is role-blind: a viewer
 * passes it. That is wrong here in a way it is not for most settings, because
 * these fields include the deposit, the no-show fee and the cancellation
 * window — money policy. The proper fix is a capability, and capabilities are
 * being touched right now by the operational-roles slice; adding a second,
 * different answer in parallel is how a permission model ends up with two.
 * Raised with the Director rather than solved here.
 *
 * Validation is server-side and total: the form's own bounds are a display
 * concern, and anything reaching this file is untrusted.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import {
  deactivateServiceWindow,
  saveServiceWindow,
  saveVenueServiceRules,
} from "@/lib/reservations/store";

export type ActionResult = { ok: true } | { ok: false; error: string };

const bandSchema = z.object({
  minParty: z.number().int().min(1).max(1000),
  maxParty: z.number().int().min(1).max(1000),
  turnMinutes: z.number().int().min(5).max(1440),
});

/**
 * A threshold is a number or an explicit null meaning NEVER ASK. `.nullable()`
 * without `.optional()` is deliberate: the form must be able to send null to
 * turn a card-on-file requirement back off, and an absent field would be
 * indistinguishable from "leave it as it is".
 */
const thresholdSchema = z.number().int().min(1).max(1000).nullable();

const rulesSchema = z.object({
  venueId: z.string().uuid(),
  isActive: z.boolean(),
  partySizeMin: z.number().int().min(1).max(1000),
  partySizeMax: z.number().int().min(1).max(1000),
  horizonDays: z.number().int().min(1).max(365),
  minNoticeMinutes: z.number().int().min(0).max(525_600),
  turnTimeBands: z.array(bandSchema).max(20),
  defaultTurnMinutes: z.number().int().min(15).max(720),
  allowPublicUpsize: z.boolean(),
  cardOnFileFromParty: thresholdSchema,
  noShowFeeCents: z.number().int().min(0).max(100_000_000),
  noShowFeeBasis: z.enum(["per_person", "per_party"]),
  noShowGraceMinutes: z.number().int().min(0).max(240),
  depositFromParty: thresholdSchema,
  depositCentsPerPerson: z.number().int().min(0).max(100_000_000),
  freeCancelHours: z.number().min(0).max(720),
  waitlistEnabled: z.boolean(),
  walkinsEnabled: z.boolean(),
  notesEnabled: z.boolean(),
});

export async function saveReservationRules(input: unknown): Promise<ActionResult> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = rulesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Some of those values are out of range." };
  }
  const { venueId, ...patch } = parsed.data;

  // Two cross-field rules the column CHECKs cannot express as one message.
  if (patch.partySizeMax < patch.partySizeMin) {
    return { ok: false, error: "The largest party cannot be smaller than the smallest." };
  }
  const sorted = [...patch.turnTimeBands].sort((a, b) => a.minParty - b.minParty);
  for (const band of sorted) {
    if (band.maxParty < band.minParty) {
      return { ok: false, error: "A turn time band ends before it starts." };
    }
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.minParty <= sorted[i - 1]!.maxParty) {
      // Refused rather than resolved by order: "first match wins" would make a
      // turn time depend on how the rows happen to be sorted.
      return { ok: false, error: "Two turn time bands cover the same party size." };
    }
  }

  try {
    const result = await saveVenueServiceRules(auth.tenantId, venueId, {
      ...patch,
      turnTimeBands: sorted,
    });
    if (!result.ok) return result;
    revalidatePath("/[tenantSlug]/admin/settings/reservations", "page");
    return { ok: true };
  } catch (err) {
    logServerError("admin-reservation-rules.saveReservationRules", err);
    return { ok: false, error: "Could not save the reservation rules." };
  }
}

const windowSchema = z.object({
  venueId: z.string().uuid(),
  id: z.string().uuid().optional(),
  key: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/),
  labelEn: z.string().min(1).max(60),
  labelEs: z.string().max(60),
  localTimeMin: z.number().int().min(0).max(1439),
  durationMinutes: z.number().int().min(15).max(1440),
  weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  lastSeatingOffsetMin: z.number().int().min(0).max(1440).nullable(),
  seatingStepMinutes: z.number().int().min(5).max(120),
  turnMinutesOverride: z.number().int().min(5).max(1440).nullable(),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(999),
});

export async function saveReservationWindow(input: unknown): Promise<ActionResult> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = windowSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "That service window is not valid." };
  }
  const d = parsed.data;

  // An empty weekday list is refused by the column too, but the message here is
  // the one an operator can act on: a window open on no day produces no times
  // and nothing else in the product would say why.
  if (d.weekdays.length === 0) {
    return { ok: false, error: "Choose at least one day this service runs." };
  }
  if (d.endsOn !== null && d.endsOn < d.startsOn) {
    return { ok: false, error: "That service ends before it starts." };
  }

  try {
    const result = await saveServiceWindow(auth.tenantId, d.venueId, {
      id: d.id,
      key: d.key,
      // Spanish is stored only when it was actually written; a blank falls back
      // to the default rather than shipping an empty string as a translation.
      label: d.labelEs.trim() ? { en: d.labelEn, es: d.labelEs } : { en: d.labelEn },
      localTimeMin: d.localTimeMin,
      durationMinutes: d.durationMinutes,
      weekdays: [...new Set(d.weekdays)].sort((a, b) => a - b),
      lastSeatingOffsetMin: d.lastSeatingOffsetMin,
      seatingStepMinutes: d.seatingStepMinutes,
      turnMinutesOverride: d.turnMinutesOverride,
      startsOn: d.startsOn,
      endsOn: d.endsOn,
      isActive: d.isActive,
      sortOrder: d.sortOrder,
    });
    if (!result.ok) return { ok: false, error: result.error };
    revalidatePath("/[tenantSlug]/admin/settings/reservations", "page");
    return { ok: true };
  } catch (err) {
    logServerError("admin-reservation-rules.saveReservationWindow", err);
    return { ok: false, error: "Could not save the service window." };
  }
}

export async function closeReservationWindow(input: unknown): Promise<ActionResult> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = z
    .object({ venueId: z.string().uuid(), windowId: z.string().uuid() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "That service window is not valid." };

  try {
    // Deactivate, never delete: the row is the record of what was offered while
    // it was live, and a reservation taken inside it still points at that time.
    const result = await deactivateServiceWindow(
      auth.tenantId,
      parsed.data.venueId,
      parsed.data.windowId,
    );
    if (!result.ok) return { ok: false, error: result.error };
    revalidatePath("/[tenantSlug]/admin/settings/reservations", "page");
    return { ok: true };
  } catch (err) {
    logServerError("admin-reservation-rules.closeReservationWindow", err);
    return { ok: false, error: "Could not close the service window." };
  }
}
