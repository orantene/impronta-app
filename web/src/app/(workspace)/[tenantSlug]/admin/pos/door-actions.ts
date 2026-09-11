"use server";

/**
 * Door mode's OWN server actions: tonight's list, and selling a ticket
 * through the counter's money path.
 *
 * WHAT IS NOT HERE, ON PURPOSE. Admitting is not. The scan goes to Sessions'
 * `scanAdmission` and the tap goes to Events' `admitAtDoor`
 * (`admin/_door-actions.ts`), exactly as the events door does; both land on
 * `check_in` under the row lock and `doorAdmits` is the only predicate that
 * turns a screen green. A second admit path in this file would be a second
 * authority on entitlement, which is the one thing that module's header says
 * must never grow.
 *
 * WHY THE WALK-UP GOES THROUGH THE COUNTER AND NOT `sellAtDoor`. Events'
 * `sellAtDoor` records door money ON THE ADMISSION (`door_amount_cents`) with
 * no order, no transaction and no drawer: it is a note that money changed
 * hands, kept so the night adds up. This mode is the point of sale, and money
 * taken at the point of sale is real money: an order, a paid
 * `booking_transactions` row stamped with the open shift, a receipt code, and
 * admissions minted by `mintAdmissionsForPaidOrder` off the paid order. So a
 * walk-up here is a draft order with one tiered line, collected in cash by
 * `startCollection` (which holds the tier's pool before any money moves), and
 * only THEN admitted with `admitAtDoor`. The counter's report, the shift's
 * expected cash and the door's list all read the same rows.
 *
 * TWO STEPS, NOT ONE, so the collection key can be derived. `startCollection`
 * requires an idempotency key naming the attempt, and the counter derives it
 * from (order, version, method, amount) so a second tap replays the first.
 * That needs the order to exist before the operator confirms cash, hence
 * `posDoorOpenTicketSale` (draft + line) and `posDoorCollectTicket` (money,
 * mint, name, admit) as two actions with the sale's id and version between them.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { userHasCapability } from "@/lib/access";
import { ensureCustomer } from "@/lib/customers/ensure-customer";
import { mintAdmissionsForPaidOrder } from "@/lib/events/mint-on-paid";
import { addLine, createDraftOrder, loadPosSale } from "@/lib/pos/draft";
import { finalizeOrCancel } from "@/lib/pos/finalize";
import { startCollection } from "@/lib/pos/collection";
import { loadDoorTonight, type DoorTonightResult } from "@/lib/pos/door-tonight";
import { signAdmissionToken } from "@/lib/sessions/admission-token";
import type { DoorOutcome } from "@/lib/sessions/door";

import { admitAtDoor } from "../_door-actions";

const uuid = z.string().uuid();

async function staff() {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false as const, error: guard.error };
  const allowed = await userHasCapability("booking.payment.request", guard.tenantId);
  if (!allowed) return { ok: false as const, error: "not_allowed" };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, error: "unavailable" };
  return { ok: true as const, tenantId: guard.tenantId, userId: guard.user.id, admin };
}

// ── Tonight ─────────────────────────────────────────────────────────────

export type { DoorTonightSession } from "@/lib/pos/door-tonight";

/** Tonight's sessions, re-read on demand (the page loads them once on the server). */
export async function posDoorTonight(): Promise<DoorTonightResult> {
  const g = await staff();
  if (!g.ok) return { ok: false, error: g.error };
  return loadDoorTonight(g.admin, g.tenantId);
}

// ── Selling a ticket through the counter ────────────────────────────────

export type DoorTicketSale = {
  orderId: string;
  version: number;
  currency: string;
  totalCents: number;
  label: string;
};

export type OpenTicketSaleResult =
  | { ok: true; sale: DoorTicketSale }
  | { ok: false; reason?: unknown; error?: unknown };

/**
 * Step one: a draft order with ONE unit of one tier of one session, priced
 * by the engine (`addLine` reads the variant's own amount and label). The
 * tier must belong to the session's event, which `addLine` enforces by
 * refusing a variant of another offering.
 */
export async function posDoorOpenTicketSale(input: {
  sessionId: string;
  variantId: string;
  /** Tickets of this tier (E02's quantity). Defaults to one. */
  units?: number;
}): Promise<OpenTicketSaleResult> {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({ sessionId: uuid, variantId: uuid, units: z.number().int().positive().max(50).optional() })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  const { admin, tenantId } = g;

  const { data: session, error: sErr } = await admin
    .from("sessions")
    .select("id, offering_id, event_id")
    .eq("id", parsed.data.sessionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (sErr) {
    logServerError("pos.door.open/session", sErr);
    return { ok: false as const, error: "unavailable" };
  }
  const offeringId = (session as { offering_id?: string | null } | null)?.offering_id ?? null;
  if (!session || !offeringId) return { ok: false as const, reason: "not_found", error: "no session" };

  const draft = await createDraftOrder(admin, { tenantId, actorUserId: g.userId, context: "door" });
  if (!draft.ok) return draft;
  const added = await addLine(admin, {
    tenantId,
    orderId: draft.orderId,
    expectedVersion: 1,
    line: { offeringId, units: parsed.data.units ?? 1, sessionId: parsed.data.sessionId, variantId: parsed.data.variantId },
  });
  if (!added.ok) {
    // A refused line leaves no half-sale behind for the Orders screen to find.
    await finalizeOrCancel(admin, { tenantId, orderId: draft.orderId });
    return added;
  }
  const { data: order, error: oErr } = await admin
    .from("orders")
    .select("id, version, currency, total_cents")
    .eq("id", draft.orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (oErr || !order) {
    logServerError("pos.door.open/order", oErr ?? new Error("no order"));
    return { ok: false as const, error: "unavailable" };
  }
  const { data: line, error: lErr } = await admin
    .from("order_lines")
    .select("label")
    .eq("order_id", draft.orderId)
    .limit(1)
    .maybeSingle();
  if (lErr) logServerError("pos.door.open/line", lErr);
  const row = order as { id: string; version: number | string; currency: string; total_cents: number | string };
  return {
    ok: true as const,
    sale: {
      orderId: row.id,
      version: Number(row.version) || 1,
      currency: row.currency,
      totalCents: Number(row.total_cents) || 0,
      label: (line as { label?: string | null } | null)?.label ?? "",
    },
  };
}

/**
 * Another tier on the same sale (E02's basket): the same `addLine`, the same
 * session, a different variant. Quantity changes and removals go through the
 * counter's own `posUpdateLine` / `posRemoveLine`, which need no variant.
 */
export async function posDoorAddTicketLine(input: {
  orderId: string;
  sessionId: string;
  variantId: string;
  units: number;
  expectedVersion: number;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({
      orderId: uuid,
      sessionId: uuid,
      variantId: uuid,
      units: z.number().int().positive().max(50),
      expectedVersion: z.number().int().positive(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  const { admin, tenantId } = g;
  const { data: session, error: sErr } = await admin
    .from("sessions")
    .select("id, offering_id")
    .eq("id", parsed.data.sessionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (sErr) {
    logServerError("pos.door.addLine/session", sErr);
    return { ok: false as const, error: "unavailable" };
  }
  const offeringId = (session as { offering_id?: string | null } | null)?.offering_id ?? null;
  if (!session || !offeringId) return { ok: false as const, reason: "not_found", error: "no session" };
  return addLine(admin, {
    tenantId,
    orderId: parsed.data.orderId,
    expectedVersion: parsed.data.expectedVersion,
    line: { offeringId, units: parsed.data.units, sessionId: parsed.data.sessionId, variantId: parsed.data.variantId },
  });
}

export type DoorSaleLine = {
  id: string;
  variantId: string | null;
  label: string;
  units: number;
  unitCents: number;
  totalCents: number;
};

export type DoorSaleView = DoorTicketSale & { lines: DoorSaleLine[] };

/** The open sale as the basket draws it: lines with their labels and units, and the version every write needs. */
export async function posDoorReadSale(orderId: string): Promise<{ ok: true; sale: DoorSaleView } | { ok: false; reason?: unknown; error?: unknown }> {
  const g = await staff();
  if (!g.ok) return g;
  if (!uuid.safeParse(orderId).success) return { ok: false as const, error: "invalid" };
  const loaded = await loadPosSale(g.admin, { tenantId: g.tenantId, orderId });
  if (!loaded.ok) return { ok: false as const, reason: loaded.reason, error: loaded.reason };
  const sale = loaded.sale;
  return {
    ok: true as const,
    sale: {
      orderId: sale.orderId,
      version: sale.version,
      currency: sale.currency,
      totalCents: sale.totalCents,
      label: sale.lines[0]?.label ?? "",
      lines: sale.lines.map((l) => ({
        id: l.id,
        variantId: l.variantId,
        label: l.label,
        units: l.units,
        unitCents: l.unitCents,
        totalCents: l.totalCents,
      })),
    },
  };
}

/**
 * Naming a ticket (E13): the holder's name on ONE admission of this tenant.
 * A name already on the row is kept unless `replace` is asked for, and a
 * dead row (refunded, void) is refused: naming it would make it look valid.
 */
export async function posDoorNameTicket(input: { admissionId: string; holderName: string; replace?: boolean }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({ admissionId: uuid, holderName: z.string().trim().min(1).max(120), replace: z.boolean().optional() })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  const { admin, tenantId } = g;
  const { data: row, error: rErr } = await admin
    .from("admissions")
    .select("id, holder_name, status")
    .eq("id", parsed.data.admissionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (rErr) {
    logServerError("pos.door.name/read", rErr);
    return { ok: false as const, error: "unavailable" };
  }
  const found = row as { id: string; holder_name: string | null; status: string } | null;
  if (!found) return { ok: false as const, reason: "not_found", error: "not_found" };
  if (found.status !== "valid") return { ok: false as const, reason: "not_valid", error: "not_valid" };
  if (found.holder_name && !parsed.data.replace) return { ok: false as const, reason: "already_named", error: "already_named" };
  const { error: uErr } = await admin
    .from("admissions")
    .update({ holder_name: parsed.data.holderName })
    .eq("id", found.id)
    .eq("tenant_id", tenantId);
  if (uErr) {
    logServerError("pos.door.name/write", uErr);
    return { ok: false as const, error: "unavailable" };
  }
  return { ok: true as const, admissionId: found.id, holderName: parsed.data.holderName };
}

/**
 * The tickets minted off one paid order, signed: E06 after a sale, E07's
 * "try issuing again" re-read, E09's order card. Read through the real rows,
 * never from a success line.
 */
async function issuedTicketsFor(
  admin: SupabaseClient,
  tenantId: string,
  orderId: string,
): Promise<{ ok: true; tickets: DoorIssuedTicket[] } | { ok: false; error: string }> {
  const { data: lines, error: lErr } = await admin
    .from("order_lines")
    .select("id, label")
    .eq("order_id", orderId)
    .eq("tenant_id", tenantId);
  if (lErr) {
    logServerError("pos.door.issued/lines", lErr);
    return { ok: false, error: "unavailable" };
  }
  const labelByLine = new Map(((lines ?? []) as Array<{ id: string; label: string | null }>).map((l) => [l.id, l.label]));
  const lineIds = [...labelByLine.keys()];
  const { data: minted, error: mErr } = lineIds.length
    ? await admin
        .from("admissions")
        .select("id, holder_name, party_size, token_version, session_id, order_line_id, line_seq, status, admitted_count")
        .eq("tenant_id", tenantId)
        .in("order_line_id", lineIds)
        .order("line_seq", { ascending: true })
    : { data: [], error: null };
  if (mErr) {
    logServerError("pos.door.issued/admissions", mErr);
    return { ok: false, error: "unavailable" };
  }
  const rows = (minted ?? []) as Array<{
    id: string;
    holder_name: string | null;
    party_size: number | string;
    token_version: number | string;
    order_line_id: string | null;
    line_seq: number | string | null;
    status: string;
    admitted_count: number | string;
  }>;
  return {
    ok: true,
    tickets: rows.map((r) => ({
      admissionId: r.id,
      holderName: r.holder_name,
      partySize: Number(r.party_size) || 1,
      code: signAdmissionToken(r.id, Number(r.token_version) || 1),
      tierLabel: r.order_line_id ? (labelByLine.get(r.order_line_id) ?? null) : null,
      lineSeq: r.line_seq === null ? null : Number(r.line_seq),
      status: r.status,
      admittedCount: Number(r.admitted_count) || 0,
    })),
  };
}

export async function posDoorIssuedTickets(orderId: string) {
  const g = await staff();
  if (!g.ok) return g;
  if (!uuid.safeParse(orderId).success) return { ok: false as const, error: "invalid" };
  return issuedTicketsFor(g.admin, g.tenantId, orderId);
}

export async function posDoorCancelTicketSale(orderId: string, expectedVersion?: number) {
  const g = await staff();
  if (!g.ok) return g;
  if (!uuid.safeParse(orderId).success) return { ok: false as const, error: "invalid" };
  return finalizeOrCancel(g.admin, { tenantId: g.tenantId, orderId, expectedVersion });
}

export type DoorIssuedTicket = {
  admissionId: string;
  holderName: string | null;
  partySize: number;
  /** The signed code the holder types or scans at the gate; null only when the signing secret is unset. */
  code: string | null;
  /** The tier, as the order line named it (E06: "General admission · Tomás"). */
  tierLabel: string | null;
  /** 1-based position on the order, the number after the dash in "#AB12-1". */
  lineSeq: number | null;
  status: string;
  admittedCount: number;
};

export type CollectTicketResult =
  | {
      ok: true;
      orderId: string;
      amountCents: number;
      changeCents: number;
      receiptCode: string | null;
      tickets: DoorIssuedTicket[];
      /** Present when `admitNow` was asked: the gate's verdict per ticket. */
      admitted: Array<{ admissionId: string; outcome: DoorOutcome }> | null;
    }
  | { ok: false; reason?: unknown; error?: unknown };

/**
 * Step two: cash in, admissions minted, named, and (for a walk-up) admitted.
 *
 * The money path is the counter's, unchanged: `startCollection` with the
 * derived key, the buyer's contact, the tender, and the mint hook. What this
 * adds after the order is paid is door business: the minted rows are read
 * back (tenant-scoped, by this order's lines), given the holder's name when
 * they have none (the engine mints unnamed rows off a POS order because the
 * counter never asks), and each is signed into the code the holder will
 * present. `admitNow` then taps each row through `admitAtDoor`, the same
 * action the events door uses, which re-checks tenant and night before
 * `check_in` decides under the lock.
 */
export async function posDoorCollectTicket(input: {
  orderId: string;
  sessionId: string;
  expectedVersion: number;
  amountCents: number;
  tenderedCents: number;
  idempotencyKey: string;
  holderName?: string;
  email?: string;
  phone?: string;
  /** One name per ticket, in order (E04); a blank leaves that ticket unnamed. */
  attendeeNames?: string[];
  admitNow: boolean;
}): Promise<CollectTicketResult> {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({
      orderId: uuid,
      sessionId: uuid,
      expectedVersion: z.number().int().positive(),
      amountCents: z.number().int().nonnegative(),
      tenderedCents: z.number().int().nonnegative(),
      idempotencyKey: z.string().min(8).max(80),
      holderName: z.string().trim().max(120).optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      attendeeNames: z.array(z.string().trim().max(120)).max(50).optional(),
      admitNow: z.boolean(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  const { admin, tenantId } = g;
  const p = parsed.data;

  const collected = await startCollection(
    admin,
    {
      tenantId,
      orderId: p.orderId,
      actorUserId: g.userId,
      method: "cash",
      contact: { email: p.email, phone: p.phone, displayName: p.holderName },
      successUrl: "",
      cancelUrl: "",
      amountCents: p.amountCents > 0 ? p.amountCents : undefined,
      tenderedCents: Math.max(p.tenderedCents, p.amountCents),
      idempotencyKey: p.idempotencyKey,
      expectedVersion: p.expectedVersion,
    },
    {
      ensureCustomer: (c) => ensureCustomer(c, { admin }),
      onOrderPaid: (ctx) => mintAdmissionsForPaidOrder(admin, ctx).then(() => undefined),
    },
  );
  if (!collected.ok) return collected;
  if (collected.method !== "cash") return { ok: false as const, error: "unavailable" };

  // The rows the mint wrote for THIS order, read back through the real reader
  // rather than trusted from the hook's return: a success line is not a ticket.
  const issued = await issuedTicketsFor(admin, tenantId, p.orderId);
  if (!issued.ok) return { ok: false as const, error: issued.error };
  let tickets = issued.tickets;

  // Naming the tickets (E04, E13). Only rows the mint left unnamed, only this
  // order's rows, only when a name was typed: never overwrite a holder. The
  // per-attendee names go on in line order; the buyer's name covers the rest.
  const buyer = p.holderName?.trim() || null;
  const names = p.attendeeNames ?? [];
  const toName = tickets
    .map((t, i) => ({ id: t.admissionId, name: (names[i]?.trim() || buyer) ?? null, unnamed: !t.holderName }))
    .filter((x): x is { id: string; name: string; unnamed: true } => x.unnamed && Boolean(x.name));
  if (toName.length > 0) {
    let failed = false;
    for (const x of toName) {
      const { error: nErr } = await admin.from("admissions").update({ holder_name: x.name }).eq("tenant_id", tenantId).eq("id", x.id);
      if (nErr) {
        logServerError("pos.door.collect/name", nErr);
        failed = true;
      }
    }
    if (!failed) tickets = tickets.map((t) => ({ ...t, holderName: t.holderName ?? toName.find((x) => x.id === t.admissionId)?.name ?? null }));
  }

  const { data: receipt, error: rErr } = await admin
    .from("orders")
    .select("receipt_code")
    .eq("id", p.orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (rErr) logServerError("pos.door.collect/receipt", rErr);
  const receiptCode = (receipt as { receipt_code?: string | null } | null)?.receipt_code ?? null;

  let admitted: Array<{ admissionId: string; outcome: DoorOutcome }> | null = null;
  if (p.admitNow) {
    admitted = [];
    for (const t of tickets) {
      const { outcome } = await admitAtDoor(t.admissionId, p.sessionId);
      admitted.push({ admissionId: t.admissionId, outcome });
    }
  }

  return {
    ok: true as const,
    orderId: p.orderId,
    amountCents: collected.amountCents,
    changeCents: collected.changeCents,
    receiptCode,
    tickets,
    admitted,
  };
}
