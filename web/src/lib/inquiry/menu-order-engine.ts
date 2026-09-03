/**
 * Menu order engine — workspace-owned items → inquiry → offer (house lines) →
 * approve → convert → commission snapshot → payment.
 *
 * Mirrors instant-book-engine.ts but with talent_profile_ids: [] and house
 * payees. Stamps booking_sub_type='service' (immediate payout) and
 * calendar_lane='order' with starts_at/ends_at at finalization.
 *
 * Does NOT write talent_holds or talent_bookings — orders must not consume
 * appointment slots.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { submitInquiry } from "./inquiry-engine-submit";
import { createOffer, updateOfferDraft, sendOffer } from "./inquiry-engine-offers";
import { persistBookingCommissionSnapshot } from "@/lib/billing/commission-engine";
import { createBookingTransaction, requestPayment } from "@/lib/bookings/transactions";
import {
  menuOrderToOfferLineSeeds,
  type MenuOrderItemInput,
} from "@/lib/talent/menu-order-offer";
import {
  rowToOffering,
  type TalentOfferingRow,
} from "@/lib/talent/offerings-types";

async function resolveTenantStaffActor(
  admin: SupabaseClient,
  tenantId: string,
): Promise<string | null> {
  const { data: members } = await admin
    .from("agency_memberships")
    .select("profile_id, role")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .in("role", ["owner", "admin", "manager"]);
  const rows = (members ?? []) as { profile_id: string; role: string }[];
  const rank: Record<string, number> = { owner: 0, admin: 1, manager: 2 };
  rows.sort((a, b) => (rank[a.role] ?? 9) - (rank[b.role] ?? 9));
  if (rows[0]?.profile_id) return rows[0].profile_id;
  const { data: sa } = await admin
    .from("profiles")
    .select("id")
    .eq("app_role", "super_admin")
    .limit(1)
    .maybeSingle();
  return (sa?.id as string | undefined) ?? null;
}

export type MenuOrderLineInput = {
  offeringId: string;
  quantity: number;
  variantId?: string | null;
  addonIds?: string[];
};

export type MenuOrderInput = {
  tenantId: string;
  clientUserId: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string | null;
  lines: MenuOrderLineInput[];
  /** When true, skip card charge (pay in person / on collection). */
  payInPerson?: boolean;
  sourcePage?: string | null;
};

export type MenuOrderResult =
  | {
      ok: true;
      inquiryId: string;
      bookingId: string;
      offerId: string;
    }
  | {
      ok: false;
      reason:
        | "engine_error"
        | "offering_unresolvable"
        | "sold_out"
        | "empty_order"
        | "not_authenticated"
        | "commission_snapshot_failed";
      error?: string;
      offeringId?: string;
    };

const MAX_DISTINCT_LINES = 20;
const MAX_TOTAL_CENTS = 5_000_000; // $50k hard cap

export async function createMenuOrder(
  _clientSb: SupabaseClient,
  input: MenuOrderInput,
): Promise<MenuOrderResult> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "engine_error", error: "Database not available." };
  if (!input.clientUserId) return { ok: false, reason: "not_authenticated" };
  if (!input.lines.length) return { ok: false, reason: "empty_order" };
  if (input.lines.length > MAX_DISTINCT_LINES) {
    return { ok: false, reason: "engine_error", error: "Too many distinct lines." };
  }

  // Hoisted above the try: the catch must be able to compensate a reservation
  // taken further down, and a helper declared inside the try is not in scope there.
  const reserved: Array<{ offeringId: string; qty: number }> = [];
  const releaseReserved = async () => {
    const pending = reserved.splice(0, reserved.length);
    for (const r of pending) {
      const { error } = await admin.rpc("release_offering_stock", {
        p_offering_id: r.offeringId,
        p_qty: r.qty,
      });
      if (error) logServerError("menuOrder.releaseStock", error);
    }
  };

  try {
    // 1. Re-resolve every offering server-side (ids + quantities only from client).
    const resolvedInputs: MenuOrderItemInput[] = [];
    const stockNeeds: Array<{ offeringId: string; qty: number }> = [];
    // Re-derived from the TRUSTED rows below, never from the client. See the
    // clamp after the resolve loop.
    let everyLineAllowsPayInPerson = true;
    for (const line of input.lines) {
      const qty = Math.max(1, Math.min(99, Math.round(line.quantity)));
      const { data: row, error } = await admin
        .from("talent_offerings")
        .select("*")
        .eq("id", line.offeringId)
        .eq("tenant_id", input.tenantId)
        .eq("owner_kind", "workspace")
        .eq("status", "published")
        .eq("moderation_state", "approved")
        .maybeSingle();
      if (error || !row) {
        return {
          ok: false,
          reason: "offering_unresolvable",
          offeringId: line.offeringId,
          error: `Menu item ${line.offeringId} is not available.`,
        };
      }
      const offering = rowToOffering(row as TalentOfferingRow);
      if (offering.amountCents == null || offering.amountCents <= 0 || offering.priceType === "custom") {
        return {
          ok: false,
          reason: "offering_unresolvable",
          offeringId: line.offeringId,
          error: `Menu item ${line.offeringId} is not orderable at a fixed price.`,
        };
      }
      resolvedInputs.push({
        offeringId: offering.id,
        title: offering.title,
        priceType: offering.priceType,
        amountCents: offering.amountCents,
        quantity: qty,
      });
      // Stock is gated on inventoryQty ALONE, deliberately NOT on kind === "product"
      // the way instant-book does. A seat-limited class ships as kind 'package'
      // (the live "Posing course - 12 spots" is one), so a kind gate would leave
      // exactly the offering that needs enforcement unenforced.
      if (offering.inventoryQty != null) {
        stockNeeds.push({ offeringId: offering.id, qty });
      }
      if (offering.allowPayInPerson !== true) everyLineAllowsPayInPerson = false;
    }

    // PAYMENT POLICY IS SERVER-DERIVED. `input.payInPerson` is a client hint and
    // nothing more: a caller that posts `true` on a card-only item would
    // otherwise get an order stamped 'cash' / 'pay_in_person' and skip the
    // payment request entirely, silently defeating the merchant's own policy.
    // ALL lines must allow it, matching what the board renders and what the
    // Sheet will read (Front Door contract: the pipeline re-validates at submit).
    const payInPerson = input.payInPerson === true && everyLineAllowsPayInPerson;

    const seeds = menuOrderToOfferLineSeeds(resolvedInputs, input.tenantId);
    if (!seeds.length) return { ok: false, reason: "empty_order" };

    const totalCents = Math.round(
      seeds.reduce((s, li) => s + li.total_price * 100, 0),
    );
    if (totalCents <= 0 || totalCents > MAX_TOTAL_CENTS) {
      return { ok: false, reason: "engine_error", error: "Order total out of range." };
    }
    const totalDollars = totalCents / 100;

    const staffActor = await resolveTenantStaffActor(admin, input.tenantId);
    if (!staffActor) {
      return { ok: false, reason: "engine_error", error: "No staff actor for tenant." };
    }

    // Atomically reserve inventory BEFORE any inquiry/offer/charge exists, so a
    // sold-out item refuses cleanly and leaves no orphan thread. Released on every
    // later failure path in this call, including the catch.
    for (const need of stockNeeds) {
      const { data: got, error: stockErr } = await admin.rpc("reserve_offering_stock", {
        p_offering_id: need.offeringId,
        p_qty: need.qty,
      });
      if (stockErr || got !== true) {
        await releaseReserved();
        return {
          ok: false,
          reason: "sold_out",
          offeringId: need.offeringId,
          error: `Menu item ${need.offeringId} does not have ${need.qty} left.`,
        };
      }
      reserved.push(need);
    }

    // 2. Create inquiry with empty talent list + menu_order source context.
    const inq = await submitInquiry(admin, {
      contact_name: input.contactName,
      contact_email: input.contactEmail,
      contact_phone: input.contactPhone ?? null,
      event_date: null,
      event_location: null,
      source_page: input.sourcePage ?? null,
      source_channel: "menu_order",
      source_context: {
        menu_order: {
          version: 1,
          items: seeds.map((s) => ({
            offering_id: s.source_service_id,
            label: s.label,
            units: s.units,
            unit_price: s.unit_price,
            total_price: s.total_price,
            pricing_unit: s.pricing_unit,
          })),
        },
      },
      client_user_id: input.clientUserId,
      talent_profile_ids: [],
      actorUserId: input.clientUserId,
      initiator_role: "client",
      tenant_id: input.tenantId,
      source_workspace_id: input.tenantId,
      quantity: 1,
      message: `Menu order: ${seeds.map((s) => `${s.units}× ${s.label}`).join(", ")}`,
    });
    if (!(inq as { success?: boolean }).success) {
      await releaseReserved();
      return { ok: false, reason: "engine_error", error: "submit:" + JSON.stringify(inq) };
    }
    const inquiryId = (inq as { data: { inquiryId: string } }).data.inquiryId;

    // Seed the client thread with the order itself — inquiries.message alone
    // never becomes a chat bubble, so staff opening Messages only saw auto-ack
    // / offer / payment events with no line items.
    const orderBody = [
      "Menu order:",
      ...seeds.map((s) => `• ${s.units}× ${s.label}`),
    ].join("\n");
    const { error: orderMsgErr } = await admin.from("inquiry_messages").insert({
      inquiry_id: inquiryId,
      tenant_id: input.tenantId,
      thread_type: "private",
      sender_user_id: input.clientUserId,
      body: orderBody,
      message_kind: "text",
      metadata: { menu_order: true, source: "menu_board" },
    });
    if (orderMsgErr) {
      logServerError("menuOrder.orderMessage", orderMsgErr);
    }

    // 3. Offer with house lines.
    const off = await createOffer(admin, {
      inquiryId,
      tenantId: input.tenantId,
      actorUserId: staffActor,
      expectedVersion: 1,
      currencyCode: "USD",
    });
    if (!(off as { success?: boolean }).success) {
      await releaseReserved();
      return { ok: false, reason: "engine_error", error: "createOffer:" + JSON.stringify(off) };
    }
    const offerId = (off as { data: { offerId: string } }).data.offerId;

    const inqV = await admin.from("inquiries").select("version").eq("id", inquiryId).maybeSingle();
    const offV = await admin.from("inquiry_offers").select("version").eq("id", offerId).maybeSingle();
    const upd = await updateOfferDraft(admin, {
      inquiryId,
      tenantId: input.tenantId,
      offerId,
      actorUserId: staffActor,
      inquiryExpectedVersion: Number((inqV.data as { version: number } | null)?.version ?? 1),
      offerExpectedVersion: Number((offV.data as { version: number } | null)?.version ?? 1),
      total_client_price: totalDollars,
      coordinator_fee: 0,
      currency_code: "USD",
      notes: null,
      lineItems: seeds.map((s, i) => ({
        talent_profile_id: null,
        owner_tenant_id: s.owner_tenant_id,
        label: s.label,
        pricing_unit: s.pricing_unit,
        units: s.units,
        unit_price: s.unit_price,
        total_price: s.total_price,
        talent_cost: 0,
        notes: null,
        sort_order: i,
        source_service_id: s.source_service_id,
      })),
    });
    if (!(upd as { success?: boolean }).success) {
      await releaseReserved();
      return { ok: false, reason: "engine_error", error: "updateOfferDraft:" + JSON.stringify(upd) };
    }

    // 4. Send + approve (client + no talent approvals for house-only).
    const inqV2 = await admin.from("inquiries").select("version").eq("id", inquiryId).maybeSingle();
    const offV2 = await admin.from("inquiry_offers").select("version").eq("id", offerId).maybeSingle();
    const sent = await sendOffer(admin, {
      inquiryId,
      tenantId: input.tenantId,
      offerId,
      actorUserId: staffActor,
      inquiryExpectedVersion: Number((inqV2.data as { version: number } | null)?.version ?? 2),
      offerExpectedVersion: Number((offV2.data as { version: number } | null)?.version ?? 2),
    });
    if (!(sent as { success?: boolean }).success) {
      await releaseReserved();
      return { ok: false, reason: "engine_error", error: "sendOffer:" + JSON.stringify(sent) };
    }

    // Seeded approvals: only client for pure menu. Accept via RPC for client.
    const { data: clientPart } = await admin
      .from("inquiry_participants")
      .select("id")
      .eq("inquiry_id", inquiryId)
      .eq("role", "client")
      .maybeSingle();
    if (clientPart?.id) {
      const inqV3 = await admin.from("inquiries").select("version").eq("id", inquiryId).maybeSingle();
      const { error: apprErr } = await admin.rpc("engine_submit_approval", {
        p_inquiry_id: inquiryId,
        p_offer_id: offerId,
        p_participant_id: clientPart.id,
        p_actor_user_id: input.clientUserId,
        p_inquiry_expected_version: Number((inqV3.data as { version: number } | null)?.version ?? 3),
        p_decision: "accepted",
        p_notes: null,
      });
      if (apprErr) {
        // Fallback: staff-force approve path may still leave inquiry pending —
        // mark approved directly under service role if RPC fails for guest.
        logServerError("menuOrder.approval", apprErr);
        await admin
          .from("inquiries")
          .update({ status: "approved" as never, next_action_by: "coordinator" })
          .eq("id", inquiryId);
      }
    }

    // 5. Convert.
    const inqV4 = await admin.from("inquiries").select("version, status").eq("id", inquiryId).maybeSingle();
    if ((inqV4.data as { status?: string } | null)?.status !== "approved") {
      await admin
        .from("inquiries")
        .update({ status: "approved" as never })
        .eq("id", inquiryId);
    }
    const inqV5 = await admin.from("inquiries").select("version").eq("id", inquiryId).maybeSingle();
    const { data: bookingId, error: convErr } = await admin.rpc("engine_convert_to_booking", {
      p_inquiry_id: inquiryId,
      p_actor_user_id: staffActor,
      p_inquiry_expected_version: Number((inqV5.data as { version: number } | null)?.version ?? 4),
      p_override_reason: null,
    });
    if (convErr || !bookingId) {
      await releaseReserved();
      return {
        ok: false,
        reason: "engine_error",
        error: "convert:" + (convErr?.message ?? "no booking id"),
      };
    }

    // Stamp service (immediate payout) + calendar order lane + starts_at.
    const nowIso = new Date().toISOString();
    await admin
      .from("agency_bookings")
      .update({
        booking_sub_type: "service",
        calendar_lane: "order",
        starts_at: nowIso,
        ends_at: nowIso,
        owner_staff_id: staffActor,
        created_by_staff_id: staffActor,
      })
      .eq("id", bookingId);

    // 6. Commission snapshot — FATAL.
    const snap = await persistBookingCommissionSnapshot(
      admin,
      bookingId as string,
      payInPerson ? "cash" : "card",
      payInPerson ? "pay_in_person" : null,
    );
    if (!snap.ok) {
      logServerError("menuOrder.commission_snapshot", new Error(snap.reason));
      await admin.from("agency_bookings").delete().eq("id", bookingId);
      await releaseReserved();
      return {
        ok: false,
        reason: "commission_snapshot_failed",
        error: snap.reason,
      };
    }

    // 7. Payment (best-effort for request path; instant charges when not pay-in-person).
    if (!payInPerson && totalCents > 0) {
      try {
        const txn = await createBookingTransaction({
          bookingId: bookingId as string,
          sourceTenantId: input.tenantId,
          sourceInquiryId: inquiryId,
          planTier: "studio",
          grossAmountCents: totalCents,
          currency: "USD",
          payerUserId: input.clientUserId,
          payerEmail: input.contactEmail,
          createdByProfileId: staffActor,
        });
        if (txn.ok && txn.data?.id) {
          await requestPayment(txn.data.id);
        }
      } catch (payErr) {
        logServerError("menuOrder.payment", payErr);
      }
    }

    return {
      ok: true,
      inquiryId,
      bookingId: bookingId as string,
      offerId,
    };
  } catch (err) {
    logServerError("menuOrder", err);
    await releaseReserved();
    return {
      ok: false,
      reason: "engine_error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
