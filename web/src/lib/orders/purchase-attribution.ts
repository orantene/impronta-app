import "server-only";

/**
 * Order-backed purchase → Money spine attribution.
 *
 * `createPurchase` opens `agency_bookings` + `booking_transactions` and
 * (optionally) a thread, but until this module ran it never wrote
 * `booking_talent` or `inquiry_participants`, and never called
 * `persistBookingCommissionSnapshot`. Talent Money starts from
 * `booking_talent` joined to `booking_commission_snapshot`, so a paid
 * vanity CatalogBookingSheet checkout showed $0 Collected despite a
 * paid order + txn (see evidence booking 746f8850-…).
 *
 * The commission context RPC already prefers `order_lines` when
 * `agency_bookings.order_id` is set; it still needs active
 * `inquiry_participants` (snapshot PK) and — after
 * `20261231341000_commission_context_order_backed` — no longer requires
 * an accepted offer for the order-backed path.
 *
 * Idempotent: safe to call from createPurchase and again from markPaid
 * before transfers.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeBookingTalentRowTotals } from "@/lib/booking-pricing";
import { persistBookingCommissionSnapshot } from "@/lib/billing/commission-engine";
import { resolveOwningPartyForTalent } from "@/lib/inquiry/owning-party-resolver";
import { centsToTotalClientRevenue } from "@/lib/money/total-client-revenue";
import { logServerError } from "@/lib/server/safe-error";

export type AttributePurchaseInput = {
  readonly tenantId: string;
  readonly bookingId: string;
  readonly orderId: string;
  /** Thread inquiry when openThread succeeded; otherwise we open one. */
  readonly inquiryId: string | null;
  readonly contact?: {
    readonly displayName?: string | null;
    readonly email?: string | null;
    readonly phone?: string | null;
  };
};

export type AttributePurchaseResult =
  | { ok: true; inquiryId: string; talentLegs: number; snapshotOk: boolean }
  | { ok: false; error: string };

type OrderLinePayee = {
  talent_profile_id: string | null;
  owner_tenant_id: string | null;
  total_cents: number;
  talent_cost_cents: number;
};

async function ensureInquiryForAttribution(
  admin: SupabaseClient,
  input: AttributePurchaseInput,
): Promise<string | null> {
  if (input.inquiryId) {
    const { error: linkErr } = await admin
      .from("agency_bookings")
      .update({ source_inquiry_id: input.inquiryId })
      .eq("id", input.bookingId)
      .is("source_inquiry_id", null);
    if (linkErr) logServerError("orders.attribute/link-inquiry", linkErr);
    return input.inquiryId;
  }

  const { data: inqRow, error: inqErr } = await admin
    .from("inquiries")
    .insert({
      tenant_id: input.tenantId,
      source_workspace_id: input.tenantId,
      contact_name:
        input.contact?.displayName ?? input.contact?.email ?? "Guest",
      contact_email: input.contact?.email ?? "",
      contact_phone: input.contact?.phone ?? null,
    })
    .select("id")
    .single();

  if (inqErr || !inqRow) {
    logServerError("orders.attribute/inquiry", inqErr);
    return null;
  }

  const inquiryId = (inqRow as { id: string }).id;

  const { error: orderLinkErr } = await admin
    .from("orders")
    .update({ inquiry_id: inquiryId })
    .eq("id", input.orderId)
    .is("inquiry_id", null);
  if (orderLinkErr) logServerError("orders.attribute/order-inquiry", orderLinkErr);

  const { error: bookingLinkErr } = await admin
    .from("agency_bookings")
    .update({ source_inquiry_id: inquiryId })
    .eq("id", input.bookingId);
  if (bookingLinkErr) {
    logServerError("orders.attribute/booking-inquiry", bookingLinkErr);
    return null;
  }

  return inquiryId;
}

async function ensureDefaultRequirementGroup(
  admin: SupabaseClient,
  input: { inquiryId: string; tenantId: string; quantity: number },
): Promise<string | null> {
  const { data: existing, error: readErr } = await admin
    .from("inquiry_requirement_groups")
    .select("id")
    .eq("inquiry_id", input.inquiryId)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (readErr) {
    logServerError("orders.attribute/req-group.read", readErr);
    return null;
  }
  if (existing) return (existing as { id: string }).id;

  const { data: created, error: insErr } = await admin
    .from("inquiry_requirement_groups")
    .insert({
      inquiry_id: input.inquiryId,
      tenant_id: input.tenantId,
      role_key: "talent",
      quantity_required: Math.max(input.quantity, 1),
      sort_order: 0,
    })
    .select("id")
    .single();
  if (insErr || !created) {
    logServerError("orders.attribute/req-group.insert", insErr);
    return null;
  }
  return (created as { id: string }).id;
}

async function ensureTalentParticipant(
  admin: SupabaseClient,
  input: {
    inquiryId: string;
    tenantId: string;
    talentProfileId: string;
    sortOrder: number;
    requirementGroupId: string;
  },
): Promise<boolean> {
  const { data: existing, error: readErr } = await admin
    .from("inquiry_participants")
    .select("id, status")
    .eq("inquiry_id", input.inquiryId)
    .eq("role", "talent")
    .eq("talent_profile_id", input.talentProfileId)
    .in("status", ["active", "invited"])
    .order("status", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (readErr) {
    logServerError("orders.attribute/participant.read", readErr);
    return false;
  }

  const owning =
    (await resolveOwningPartyForTalent(
      admin,
      input.talentProfileId,
      input.tenantId,
    )) ?? { type: "workspace" as const, id: input.tenantId };

  if (existing) {
    const row = existing as { id: string; status: string };
    if (row.status === "active") return true;
    const { error: upErr } = await admin
      .from("inquiry_participants")
      .update({
        status: "active",
        owning_party_type: owning.type,
        owning_party_id: owning.id,
      })
      .eq("id", row.id);
    if (upErr) {
      logServerError("orders.attribute/participant.activate", upErr);
      return false;
    }
    return true;
  }

  const { error: insErr } = await admin.from("inquiry_participants").insert({
    inquiry_id: input.inquiryId,
    tenant_id: input.tenantId,
    talent_profile_id: input.talentProfileId,
    role: "talent",
    status: "active",
    sort_order: input.sortOrder,
    owning_party_type: owning.type,
    owning_party_id: owning.id,
    requirement_group_id: input.requirementGroupId,
  });
  if (insErr) {
    logServerError("orders.attribute/participant.insert", insErr);
    return false;
  }
  return true;
}

async function ensureHouseParticipant(
  admin: SupabaseClient,
  input: {
    inquiryId: string;
    tenantId: string;
    ownerTenantId: string;
    sortOrder: number;
    requirementGroupId: string;
  },
): Promise<boolean> {
  const { data: existing, error: readErr } = await admin
    .from("inquiry_participants")
    .select("id, status")
    .eq("inquiry_id", input.inquiryId)
    .eq("role", "house")
    .eq("owning_party_id", input.ownerTenantId)
    .in("status", ["active", "invited"])
    .limit(1)
    .maybeSingle();

  if (readErr) {
    logServerError("orders.attribute/house.read", readErr);
    return false;
  }

  if (existing) {
    const row = existing as { id: string; status: string };
    if (row.status === "active") return true;
    const { error: upErr } = await admin
      .from("inquiry_participants")
      .update({ status: "active" })
      .eq("id", row.id);
    if (upErr) {
      logServerError("orders.attribute/house.activate", upErr);
      return false;
    }
    return true;
  }

  const { error: insErr } = await admin.from("inquiry_participants").insert({
    inquiry_id: input.inquiryId,
    tenant_id: input.tenantId,
    role: "house",
    status: "active",
    sort_order: input.sortOrder,
    owning_party_type: "workspace",
    owning_party_id: input.ownerTenantId,
    requirement_group_id: input.requirementGroupId,
  });
  if (insErr) {
    logServerError("orders.attribute/house.insert", insErr);
    return false;
  }
  return true;
}

async function ensureTalentLeg(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    bookingId: string;
    talentProfileId: string;
    sortOrder: number;
    clientChargeMajor: number;
    talentCostMajor: number;
  },
): Promise<boolean> {
  const { data: leg, error: readErr } = await admin
    .from("booking_talent")
    .select("id")
    .eq("booking_id", input.bookingId)
    .eq("talent_profile_id", input.talentProfileId)
    .limit(1)
    .maybeSingle();

  if (readErr) {
    logServerError("orders.attribute/leg.read", readErr);
    return false;
  }

  const totals = computeBookingTalentRowTotals(
    1,
    input.talentCostMajor,
    input.clientChargeMajor,
  );

  if (leg) {
    const { error: upErr } = await admin
      .from("booking_talent")
      .update({
        talent_cost_rate: input.talentCostMajor,
        client_charge_rate: input.clientChargeMajor,
        talent_cost_total: totals.talent_cost_total,
        client_charge_total: totals.client_charge_total,
        gross_profit: totals.gross_profit,
      })
      .eq("id", (leg as { id: string }).id);
    if (upErr) {
      logServerError("orders.attribute/leg.update", upErr);
      return false;
    }
    return true;
  }

  const { error: insErr } = await admin.from("booking_talent").insert({
    tenant_id: input.tenantId,
    booking_id: input.bookingId,
    talent_profile_id: input.talentProfileId,
    sort_order: input.sortOrder,
    units: 1,
    pricing_unit: "event",
    talent_cost_rate: input.talentCostMajor,
    client_charge_rate: input.clientChargeMajor,
    talent_cost_total: totals.talent_cost_total,
    client_charge_total: totals.client_charge_total,
    gross_profit: totals.gross_profit,
  });
  if (insErr) {
    logServerError("orders.attribute/leg.insert", insErr);
    return false;
  }
  return true;
}

/**
 * Write booking_talent + inquiry_participants and persist the commission
 * snapshot for an order-backed booking.
 */
export async function attributePurchaseBooking(
  admin: SupabaseClient,
  input: AttributePurchaseInput,
): Promise<AttributePurchaseResult> {
  const { data: lines, error: linesErr } = await admin
    .from("order_lines")
    .select("talent_profile_id, owner_tenant_id, total_cents, talent_cost_cents")
    .eq("order_id", input.orderId)
    .order("sort_order", { ascending: true });

  if (linesErr) {
    logServerError("orders.attribute/lines", linesErr);
    return { ok: false, error: "Could not load order lines for attribution." };
  }

  const payees = (lines ?? []) as OrderLinePayee[];
  const talentTotals = new Map<
    string,
    { clientCents: number; talentCostCents: number }
  >();
  const houseOwners = new Set<string>();

  for (const line of payees) {
    if (line.talent_profile_id) {
      const prev = talentTotals.get(line.talent_profile_id) ?? {
        clientCents: 0,
        talentCostCents: 0,
      };
      prev.clientCents += Number(line.total_cents) || 0;
      prev.talentCostCents += Number(line.talent_cost_cents) || 0;
      talentTotals.set(line.talent_profile_id, prev);
    } else if (line.owner_tenant_id) {
      houseOwners.add(line.owner_tenant_id);
    }
  }

  if (talentTotals.size === 0 && houseOwners.size === 0) {
    return {
      ok: true,
      inquiryId: input.inquiryId ?? "",
      talentLegs: 0,
      snapshotOk: true,
    };
  }

  const inquiryId = await ensureInquiryForAttribution(admin, input);
  if (!inquiryId) {
    return { ok: false, error: "Could not open the attribution inquiry." };
  }

  const requirementGroupId = await ensureDefaultRequirementGroup(admin, {
    inquiryId,
    tenantId: input.tenantId,
    quantity: Math.max(talentTotals.size, 1),
  });
  if (!requirementGroupId) {
    return { ok: false, error: "Could not open the attribution roster group." };
  }

  let sort = 0;
  let talentLegs = 0;

  for (const [talentProfileId, totals] of talentTotals) {
    if (
      !(await ensureTalentParticipant(admin, {
        inquiryId,
        tenantId: input.tenantId,
        talentProfileId,
        sortOrder: sort++,
        requirementGroupId,
      }))
    ) {
      return { ok: false, error: "Could not attribute the talent roster." };
    }
    if (
      !(await ensureTalentLeg(admin, {
        tenantId: input.tenantId,
        bookingId: input.bookingId,
        talentProfileId,
        sortOrder: talentLegs,
        clientChargeMajor: centsToTotalClientRevenue(totals.clientCents),
        talentCostMajor: centsToTotalClientRevenue(totals.talentCostCents),
      }))
    ) {
      return { ok: false, error: "Could not attribute the talent leg." };
    }
    talentLegs += 1;
  }

  for (const ownerTenantId of houseOwners) {
    if (
      !(await ensureHouseParticipant(admin, {
        inquiryId,
        tenantId: input.tenantId,
        ownerTenantId,
        sortOrder: sort++,
        requirementGroupId,
      }))
    ) {
      return { ok: false, error: "Could not attribute the house lane." };
    }
  }

  const commission = await persistBookingCommissionSnapshot(
    admin,
    input.bookingId,
  );
  if (!commission.ok) {
    logServerError(
      "orders.attribute/snapshot",
      `${commission.reason}${commission.detail ? `: ${commission.detail}` : ""}`,
    );
    return {
      ok: false,
      error: "Could not snapshot the commission for this order.",
    };
  }

  return { ok: true, inquiryId, talentLegs, snapshotOk: true };
}
