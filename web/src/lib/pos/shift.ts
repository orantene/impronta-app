import "server-only";

/**
 * POS shift cash-up (P5-05).
 *
 * Open and close live on `/admin/pos`. They are not a tenth navigation
 * destination. Navigating away does not close a shift.
 *
 * Cash collection still works with no open shift. When a shift is open,
 * cash allocations stamp `booking_transactions.metadata.shift_id`.
 */

import { logServerError } from "@/lib/server/safe-error";

type Admin = {
  // Tests inject a fake PostgREST builder. Same seam as POS collection.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

function num(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function asMeta(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
    return {};
  }
  if (typeof raw === "object") return raw as Record<string, unknown>;
  return {};
}

export type PosShiftRow = {
  id: string;
  tenantId: string;
  status: "open" | "closed";
  version: number;
  openedBy: string | null;
  closedBy: string | null;
  openedAt: string | null;
  closedAt: string | null;
  openingCashCents: number;
  closingCashCents: number | null;
  expectedCashCents: number | null;
  varianceCents: number | null;
};

type ShiftDbRow = {
  id: string;
  tenant_id: string;
  status: string;
  version: number;
  opened_by: string | null;
  closed_by: string | null;
  opened_at: string | null;
  closed_at: string | null;
  opening_cash_cents: number | string;
  closing_cash_cents: number | string | null;
  expected_cash_cents: number | string | null;
};

function mapShift(row: ShiftDbRow, extras?: { varianceCents?: number | null }): PosShiftRow {
  const closing = row.closing_cash_cents == null ? null : num(row.closing_cash_cents);
  const expected = row.expected_cash_cents == null ? null : num(row.expected_cash_cents);
  const variance =
    extras?.varianceCents !== undefined
      ? extras.varianceCents
      : closing != null && expected != null
        ? closing - expected
        : null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    status: row.status === "closed" ? "closed" : "open",
    version: Number(row.version) || 1,
    openedBy: row.opened_by,
    closedBy: row.closed_by,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    openingCashCents: num(row.opening_cash_cents),
    closingCashCents: closing,
    expectedCashCents: expected,
    varianceCents: variance,
  };
}

export type CurrentShiftResult =
  | { ok: true; shift: PosShiftRow | null }
  | { ok: false; reason: "unavailable"; error: string };

export async function currentShift(
  admin: Admin,
  input: { tenantId: string },
): Promise<CurrentShiftResult> {
  const { data, error } = await admin
    .from("pos_shifts")
    .select(
      "id, tenant_id, status, version, opened_by, closed_by, opened_at, closed_at, opening_cash_cents, closing_cash_cents, expected_cash_cents",
    )
    .eq("tenant_id", input.tenantId)
    .eq("status", "open")
    .maybeSingle();
  if (error) {
    logServerError("pos.currentShift", error);
    return { ok: false, reason: "unavailable", error: "Could not read the shift." };
  }
  if (!data) return { ok: true, shift: null };
  return { ok: true, shift: mapShift(data as ShiftDbRow) };
}

export type OpenShiftResult =
  | { ok: true; shift: PosShiftRow }
  | {
      ok: false;
      reason: "already_open" | "amount" | "unavailable";
      error: string;
    };

export async function openShift(
  admin: Admin,
  input: { tenantId: string; actorUserId: string; openingCashCents: number },
): Promise<OpenShiftResult> {
  if (!Number.isInteger(input.openingCashCents) || input.openingCashCents < 0) {
    return { ok: false, reason: "amount", error: "Opening cash must be zero or more." };
  }
  const existing = await currentShift(admin, { tenantId: input.tenantId });
  if (!existing.ok) return existing;
  if (existing.shift) {
    return { ok: false, reason: "already_open", error: "A shift is already open." };
  }
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("pos_shifts")
    .insert({
      tenant_id: input.tenantId,
      status: "open",
      version: 1,
      opened_by: input.actorUserId,
      opened_at: now,
      opening_cash_cents: input.openingCashCents,
      closed_by: null,
      closed_at: null,
      closing_cash_cents: null,
      expected_cash_cents: null,
      updated_at: now,
    })
    .select(
      "id, tenant_id, status, version, opened_by, closed_by, opened_at, closed_at, opening_cash_cents, closing_cash_cents, expected_cash_cents",
    )
    .single();
  if (error || !data) {
    logServerError("pos.openShift", error);
    return { ok: false, reason: "unavailable", error: "Could not open the shift." };
  }
  return { ok: true, shift: mapShift(data as ShiftDbRow) };
}

export type CloseShiftResult =
  | { ok: true; shift: PosShiftRow }
  | {
      ok: false;
      reason: "not_found" | "already_closed" | "version_conflict" | "amount" | "unavailable";
      error: string;
    };

async function expectedCashForShift(
  admin: Admin,
  input: { tenantId: string; shiftId: string; openingCashCents: number },
): Promise<{ ok: true; expectedCents: number } | { ok: false }> {
  const { data, error } = await admin
    .from("booking_transactions")
    .select("gross_amount_cents, metadata, status, source_tenant_id")
    .eq("source_tenant_id", input.tenantId)
    .eq("status", "paid");
  if (error) {
    logServerError("pos.closeShift.tenders", error);
    return { ok: false };
  }
  let allocated = 0;
  for (const raw of data ?? []) {
    const row = raw as { gross_amount_cents?: number | string; metadata?: unknown };
    const meta = asMeta(row.metadata);
    if (meta.shift_id !== input.shiftId) continue;
    if (meta.paid_via !== "cash") continue;
    allocated += num(row.gross_amount_cents);
  }
  return { ok: true, expectedCents: input.openingCashCents + allocated };
}

export async function closeShift(
  admin: Admin,
  input: {
    tenantId: string;
    actorUserId: string;
    closingCashCents: number;
    expectedVersion?: number;
  },
): Promise<CloseShiftResult> {
  if (!Number.isInteger(input.closingCashCents) || input.closingCashCents < 0) {
    return { ok: false, reason: "amount", error: "Counted cash must be zero or more." };
  }
  const { data: open, error } = await admin
    .from("pos_shifts")
    .select(
      "id, tenant_id, status, version, opened_by, closed_by, opened_at, closed_at, opening_cash_cents, closing_cash_cents, expected_cash_cents",
    )
    .eq("tenant_id", input.tenantId)
    .eq("status", "open")
    .maybeSingle();
  if (error) {
    logServerError("pos.closeShift.load", error);
    return { ok: false, reason: "unavailable", error: "Could not close the shift." };
  }
  if (!open) return { ok: false, reason: "not_found", error: "No shift is open." };
  const row = open as ShiftDbRow;
  if (row.status !== "open") {
    return { ok: false, reason: "already_closed", error: "That shift is already closed." };
  }
  if (input.expectedVersion != null && input.expectedVersion !== row.version) {
    return { ok: false, reason: "version_conflict", error: "The shift changed. Reload and try again." };
  }

  const expected = await expectedCashForShift(admin, {
    tenantId: input.tenantId,
    shiftId: row.id,
    openingCashCents: num(row.opening_cash_cents),
  });
  if (!expected.ok) {
    return { ok: false, reason: "unavailable", error: "Could not total the drawer." };
  }

  const now = new Date().toISOString();
  const { error: updError } = await admin
    .from("pos_shifts")
    .update({
      status: "closed",
      closed_at: now,
      closed_by: input.actorUserId,
      closing_cash_cents: input.closingCashCents,
      expected_cash_cents: expected.expectedCents,
      version: row.version + 1,
      updated_at: now,
    })
    .eq("id", row.id)
    .eq("status", "open")
    .eq("version", row.version);
  if (updError) {
    logServerError("pos.closeShift.update", updError);
    return { ok: false, reason: "unavailable", error: "Could not close the shift." };
  }
  return {
    ok: true,
    shift: mapShift(
      {
        ...row,
        status: "closed",
        closed_at: now,
        closed_by: input.actorUserId,
        closing_cash_cents: input.closingCashCents,
        expected_cash_cents: expected.expectedCents,
        version: row.version + 1,
      },
      { varianceCents: input.closingCashCents - expected.expectedCents },
    ),
  };
}
