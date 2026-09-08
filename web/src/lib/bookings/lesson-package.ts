/**
 * C39 — lesson package drawdown on the existing booking.
 * Unused remaining units are the refundable balance; this module does not
 * invent a second commercial record.
 */

import { logServerError } from "@/lib/server/safe-error";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type LessonPackageRow = {
  id: string;
  tenantId: string;
  bookingId: string;
  originalUnits: number;
  remainingUnits: number;
};

function mapRow(row: {
  id: string;
  tenant_id: string;
  booking_id: string;
  original_units: number;
  remaining_units: number;
}): LessonPackageRow {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    bookingId: row.booking_id,
    originalUnits: Number(row.original_units) || 0,
    remainingUnits: Number(row.remaining_units) || 0,
  };
}

export async function createLessonPackage(
  admin: Admin,
  input: { tenantId: string; bookingId: string; units: number },
): Promise<{ ok: true; pack: LessonPackageRow } | { ok: false; reason: "invalid" | "unavailable"; error: string }> {
  if (!input.tenantId || !input.bookingId || !Number.isInteger(input.units) || input.units < 1) {
    return { ok: false, reason: "invalid", error: "A package needs at least one lesson." };
  }
  const { data, error } = await admin
    .from("lesson_packages")
    .insert({
      tenant_id: input.tenantId,
      booking_id: input.bookingId,
      original_units: input.units,
      remaining_units: input.units,
    })
    .select("id, tenant_id, booking_id, original_units, remaining_units")
    .single();
  if (error || !data) {
    logServerError("lessonPackage.create", error);
    return { ok: false, reason: "unavailable", error: "Could not open the package." };
  }
  return { ok: true, pack: mapRow(data as Parameters<typeof mapRow>[0]) };
}

export async function drawdownLesson(
  admin: Admin,
  input: { tenantId: string; packageId: string },
): Promise<
  | { ok: true; pack: LessonPackageRow }
  | { ok: false; reason: "not_found" | "wrong_tenant" | "exhausted" | "unavailable"; error: string }
> {
  const { data, error } = await admin
    .from("lesson_packages")
    .select("id, tenant_id, booking_id, original_units, remaining_units")
    .eq("id", input.packageId)
    .maybeSingle();
  if (error) {
    logServerError("lessonPackage.drawdown.load", error);
    return { ok: false, reason: "unavailable", error: "Could not draw down the package." };
  }
  if (!data) return { ok: false, reason: "not_found", error: "That package is not on this workspace." };
  const row = data as Parameters<typeof mapRow>[0];
  if (row.tenant_id !== input.tenantId) {
    return { ok: false, reason: "wrong_tenant", error: "That package is not on this workspace." };
  }
  if (Number(row.remaining_units) < 1) {
    return { ok: false, reason: "exhausted", error: "This package has no lessons left." };
  }
  const next = Number(row.remaining_units) - 1;
  const { error: upd } = await admin
    .from("lesson_packages")
    .update({ remaining_units: next, updated_at: new Date().toISOString() })
    .eq("id", input.packageId)
    .eq("tenant_id", input.tenantId)
    .eq("remaining_units", row.remaining_units);
  if (upd) {
    logServerError("lessonPackage.drawdown.update", upd);
    return { ok: false, reason: "unavailable", error: "Could not draw down the package." };
  }
  return { ok: true, pack: mapRow({ ...row, remaining_units: next }) };
}

export function unusedRefundableUnits(pack: LessonPackageRow): number {
  return Math.max(0, pack.remainingUnits);
}
