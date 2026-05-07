// Phase 3.12 / Messages — Slice B data loaders.
//
// Per-inquiry detail loaders used by the right pane: lineup, offer ledger,
// attachments, booking transactions. Server-only — these run inside the
// page server component or via server actions.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type InquiryLineupParticipant = {
  id: string;
  inquiryId: string;
  talentProfileId: string | null;
  userId: string | null;
  role: string;
  status: "pending" | "accepted" | "declined" | "removed" | string;
  acceptedAt: string | null;
  removedAt: string | null;
  declineReason: string | null;
  declineReasonText: string | null;
  sortOrder: number;
  requirementGroupId: string | null;
  createdAt: string;

  // Joined talent identity
  talentDisplayName: string | null;
  talentInitials: string;
  talentProfileCode: string | null;
  talentPhotoUrl: string | null;
};

export type InquiryOfferLineItem = {
  id: string;
  offerId: string;
  talentProfileId: string | null;
  label: string;
  pricingUnit: string;
  units: number;
  unitPrice: number;
  totalPrice: number;
  talentCost: number | null;
  notes: string | null;
  sortOrder: number;
  // Joined talent identity (for line-item rendering)
  talentDisplayName: string | null;
};

export type InquiryOffer = {
  id: string;
  inquiryId: string;
  version: number;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired" | "withdrawn" | string;
  totalClientPrice: number | null;
  coordinatorFee: number | null;
  currencyCode: string;
  notes: string | null;
  validUntil: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  rejectionReason: string | null;
  rejectionReasonText: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  lineItems: InquiryOfferLineItem[];
};

export type InquiryOfferHistoryEntry = {
  id: string;
  version: number;
  status: string;
  totalClientPrice: number | null;
  currencyCode: string;
  sentAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
};

export type InquiryAttachment = {
  id: string;
  inquiryId: string;
  uploadedBy: string | null;
  uploadedByName: string | null;
  storagePath: string;
  filename: string;
  mimeType: string | null;
  byteSize: number | null;
  description: string | null;
  visibility: "staff" | "shared";
  createdAt: string;
};

export type InquiryBookingTransaction = {
  id: string;
  bookingId: string | null;
  payerEmail: string | null;
  payoutReceiverDisplayName: string | null;
  grossAmountCents: number;
  platformFeeCents: number;
  netAmountCents: number;
  currency: string;
  provider: string | null;
  providerReference: string | null;
  status: string;
  paidAt: string | null;
  payoutCompletedAt: string | null;
  refundedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  createdAt: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.trim().split(/\s+/).filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
}

/**
 * Resolve "card" variant photos for a list of talent ids.
 * Falls back through the service-role client when needed (mirrors the
 * roster loader pattern in _data-bridge.ts).
 */
async function resolveTalentPhotos(
  supabase: SupabaseClient,
  talentIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (talentIds.length === 0) return out;
  const admin = createServiceRoleClient();
  const mediaClient = admin ?? supabase;
  const { data: mediaRows } = await mediaClient
    .from("media_assets")
    .select("owner_talent_profile_id, storage_path, variant_kind")
    .in("owner_talent_profile_id", talentIds)
    .in("variant_kind", ["card", "public_watermarked", "gallery", "portfolio", "original"])
    .is("deleted_at", null);
  const BUCKET = "media-public";
  // Prefer card; fall back through the same chain the public profile uses.
  const RANK: Record<string, number> = {
    card: 0, public_watermarked: 1, gallery: 2, portfolio: 3, original: 4,
  };
  const bestRank = new Map<string, number>();
  for (const m of (mediaRows ?? []) as { owner_talent_profile_id: string; storage_path: string; variant_kind: string }[]) {
    const r = RANK[m.variant_kind] ?? 99;
    const cur = bestRank.get(m.owner_talent_profile_id) ?? 99;
    if (r < cur) {
      const { data: urlData } = mediaClient.storage.from(BUCKET).getPublicUrl(m.storage_path);
      out.set(m.owner_talent_profile_id, urlData.publicUrl);
      bestRank.set(m.owner_talent_profile_id, r);
    }
  }
  return out;
}

// ─── Lineup ───────────────────────────────────────────────────────────────────

export async function loadInquiryLineup(
  tenantId: string,
  inquiryId: string,
): Promise<InquiryLineupParticipant[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("inquiry_participants")
      .select(`
        id,
        inquiry_id,
        talent_profile_id,
        user_id,
        role,
        status,
        accepted_at,
        removed_at,
        decline_reason,
        decline_reason_text,
        sort_order,
        requirement_group_id,
        created_at,
        talent_profiles:talent_profile_id (
          id,
          display_name,
          first_name,
          last_name,
          profile_code
        )
      `)
      .eq("tenant_id", tenantId)
      .eq("inquiry_id", inquiryId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      logServerError("messages.loadInquiryLineup", error);
      return [];
    }

    type Row = {
      id: string;
      inquiry_id: string;
      talent_profile_id: string | null;
      user_id: string | null;
      role: string;
      status: string;
      accepted_at: string | null;
      removed_at: string | null;
      decline_reason: string | null;
      decline_reason_text: string | null;
      sort_order: number;
      requirement_group_id: string | null;
      created_at: string;
      talent_profiles: unknown;
    };
    const rows = (data ?? []) as Row[];

    // Resolve "card" variant photos via media_assets.
    const photoByTalent = await resolveTalentPhotos(
      supabase,
      rows.map((r) => r.talent_profile_id).filter((x): x is string => !!x),
    );

    return rows.map((r): InquiryLineupParticipant => {
      const tp = (Array.isArray(r.talent_profiles) ? r.talent_profiles[0] : r.talent_profiles) as
        | {
            id?: string;
            display_name?: string | null;
            first_name?: string | null;
            last_name?: string | null;
            profile_code?: string | null;
          }
        | null;
      const fullName =
        tp?.display_name ||
        [tp?.first_name, tp?.last_name].filter(Boolean).join(" ").trim() ||
        null;
      return {
        id: r.id,
        inquiryId: r.inquiry_id,
        talentProfileId: r.talent_profile_id,
        userId: r.user_id,
        role: r.role,
        status: r.status,
        acceptedAt: r.accepted_at,
        removedAt: r.removed_at,
        declineReason: r.decline_reason,
        declineReasonText: r.decline_reason_text,
        sortOrder: r.sort_order,
        requirementGroupId: r.requirement_group_id,
        createdAt: r.created_at,
        talentDisplayName: fullName,
        talentInitials: initials(fullName ?? "?"),
        talentProfileCode: tp?.profile_code ?? null,
        talentPhotoUrl: r.talent_profile_id ? photoByTalent.get(r.talent_profile_id) ?? null : null,
      };
    });
  } catch (err) {
    logServerError("messages.loadInquiryLineup", err);
    return [];
  }
}

// ─── Offer ────────────────────────────────────────────────────────────────────

export async function loadInquiryCurrentOffer(
  tenantId: string,
  inquiryId: string,
): Promise<InquiryOffer | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;

    // Fetch the inquiry to get current_offer_id.
    const { data: inquiryRow, error: inquiryErr } = await supabase
      .from("inquiries")
      .select("current_offer_id")
      .eq("tenant_id", tenantId)
      .eq("id", inquiryId)
      .maybeSingle();

    if (inquiryErr || !inquiryRow) return null;
    const offerId = (inquiryRow as { current_offer_id: string | null }).current_offer_id;

    // If no current offer, fall back to the most recent offer for this inquiry.
    type OfferRow = {
      id: string;
      inquiry_id: string;
      version: number;
      status: string;
      total_client_price: number | null;
      coordinator_fee: number | null;
      currency_code: string;
      notes: string | null;
      valid_until: string | null;
      sent_at: string | null;
      accepted_at: string | null;
      rejection_reason: string | null;
      rejection_reason_text: string | null;
      created_by_user_id: string | null;
      created_at: string;
      updated_at: string;
    };
    let offer: OfferRow | null = null;

    if (offerId) {
      const { data, error } = await supabase
        .from("inquiry_offers")
        .select(`
          id, inquiry_id, version, status, total_client_price, coordinator_fee,
          currency_code, notes, valid_until, sent_at, accepted_at,
          rejection_reason, rejection_reason_text, created_by_user_id,
          created_at, updated_at
        `)
        .eq("id", offerId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) logServerError("messages.loadInquiryCurrentOffer.byId", error);
      offer = (data as OfferRow | null) ?? null;
    }

    if (!offer) {
      const { data, error } = await supabase
        .from("inquiry_offers")
        .select(`
          id, inquiry_id, version, status, total_client_price, coordinator_fee,
          currency_code, notes, valid_until, sent_at, accepted_at,
          rejection_reason, rejection_reason_text, created_by_user_id,
          created_at, updated_at
        `)
        .eq("tenant_id", tenantId)
        .eq("inquiry_id", inquiryId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) logServerError("messages.loadInquiryCurrentOffer.fallback", error);
      offer = (data as OfferRow | null) ?? null;
    }

    if (!offer) return null;

    // Line items.
    const { data: lineRows } = await supabase
      .from("inquiry_offer_line_items")
      .select(`
        id, offer_id, talent_profile_id, label, pricing_unit,
        units, unit_price, total_price, talent_cost, notes, sort_order,
        talent_profiles:talent_profile_id ( display_name, first_name, last_name )
      `)
      .eq("tenant_id", tenantId)
      .eq("offer_id", offer.id)
      .order("sort_order", { ascending: true });

    const lineItems: InquiryOfferLineItem[] = ((lineRows ?? []) as Array<{
      id: string;
      offer_id: string;
      talent_profile_id: string | null;
      label: string;
      pricing_unit: string;
      units: number;
      unit_price: number;
      total_price: number;
      talent_cost: number | null;
      notes: string | null;
      sort_order: number;
      talent_profiles: unknown;
    }>).map((r) => {
      const tp = (Array.isArray(r.talent_profiles) ? r.talent_profiles[0] : r.talent_profiles) as
        | { display_name?: string | null; first_name?: string | null; last_name?: string | null }
        | null;
      const fullName =
        tp?.display_name ||
        [tp?.first_name, tp?.last_name].filter(Boolean).join(" ").trim() ||
        null;
      return {
        id: r.id,
        offerId: r.offer_id,
        talentProfileId: r.talent_profile_id,
        label: r.label,
        pricingUnit: r.pricing_unit,
        units: Number(r.units ?? 0),
        unitPrice: Number(r.unit_price ?? 0),
        totalPrice: Number(r.total_price ?? 0),
        talentCost: r.talent_cost == null ? null : Number(r.talent_cost),
        notes: r.notes,
        sortOrder: r.sort_order,
        talentDisplayName: fullName,
      };
    });

    return {
      id: offer.id,
      inquiryId: offer.inquiry_id,
      version: offer.version,
      status: offer.status,
      totalClientPrice: offer.total_client_price == null ? null : Number(offer.total_client_price),
      coordinatorFee:   offer.coordinator_fee   == null ? null : Number(offer.coordinator_fee),
      currencyCode: offer.currency_code,
      notes: offer.notes,
      validUntil: offer.valid_until,
      sentAt: offer.sent_at,
      acceptedAt: offer.accepted_at,
      rejectionReason: offer.rejection_reason,
      rejectionReasonText: offer.rejection_reason_text,
      createdByUserId: offer.created_by_user_id,
      createdAt: offer.created_at,
      updatedAt: offer.updated_at,
      lineItems,
    };
  } catch (err) {
    logServerError("messages.loadInquiryCurrentOffer", err);
    return null;
  }
}

export async function loadInquiryOfferHistory(
  tenantId: string,
  inquiryId: string,
): Promise<InquiryOfferHistoryEntry[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("inquiry_offers")
      .select("id, version, status, total_client_price, currency_code, sent_at, accepted_at, created_at")
      .eq("tenant_id", tenantId)
      .eq("inquiry_id", inquiryId)
      .order("version", { ascending: false })
      .limit(20);
    if (error) {
      logServerError("messages.loadInquiryOfferHistory", error);
      return [];
    }
    return ((data ?? []) as Array<{
      id: string; version: number; status: string;
      total_client_price: number | null; currency_code: string;
      sent_at: string | null; accepted_at: string | null; created_at: string;
    }>).map((r) => ({
      id: r.id,
      version: r.version,
      status: r.status,
      totalClientPrice: r.total_client_price == null ? null : Number(r.total_client_price),
      currencyCode: r.currency_code,
      sentAt: r.sent_at,
      acceptedAt: r.accepted_at,
      createdAt: r.created_at,
    }));
  } catch (err) {
    logServerError("messages.loadInquiryOfferHistory", err);
    return [];
  }
}

// ─── Attachments ──────────────────────────────────────────────────────────────

export async function loadInquiryAttachments(
  tenantId: string,
  inquiryId: string,
): Promise<InquiryAttachment[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("inquiry_attachments")
      .select(`
        id, inquiry_id, uploaded_by, storage_path, filename, mime_type,
        byte_size, description, visibility, created_at,
        profiles:uploaded_by ( display_name )
      `)
      .eq("tenant_id", tenantId)
      .eq("inquiry_id", inquiryId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      logServerError("messages.loadInquiryAttachments", error);
      return [];
    }

    return ((data ?? []) as Array<{
      id: string;
      inquiry_id: string;
      uploaded_by: string;
      storage_path: string;
      filename: string;
      mime_type: string | null;
      byte_size: number | null;
      description: string | null;
      visibility: "staff" | "shared";
      created_at: string;
      profiles: unknown;
    }>).map((r) => {
      const profile = (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles) as
        | { display_name?: string | null } | null;
      return {
        id: r.id,
        inquiryId: r.inquiry_id,
        uploadedBy: r.uploaded_by,
        uploadedByName: profile?.display_name ?? null,
        storagePath: r.storage_path,
        filename: r.filename,
        mimeType: r.mime_type,
        byteSize: r.byte_size,
        description: r.description,
        visibility: r.visibility,
        createdAt: r.created_at,
      };
    });
  } catch (err) {
    logServerError("messages.loadInquiryAttachments", err);
    return [];
  }
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export async function loadInquiryBookingTransactions(
  tenantId: string,
  inquiryId: string,
): Promise<InquiryBookingTransaction[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("booking_transactions")
      .select(`
        id, booking_id, payer_email, payout_receiver_display_name,
        gross_amount_cents, platform_fee_cents, net_amount_cents, currency,
        provider, provider_reference, status, paid_at, payout_completed_at,
        refunded_at, failed_at, failure_reason, created_at
      `)
      .eq("source_tenant_id", tenantId)
      .eq("source_inquiry_id", inquiryId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      logServerError("messages.loadInquiryBookingTransactions", error);
      return [];
    }

    return ((data ?? []) as Array<{
      id: string;
      booking_id: string | null;
      payer_email: string | null;
      payout_receiver_display_name: string | null;
      gross_amount_cents: number;
      platform_fee_cents: number;
      net_amount_cents: number;
      currency: string;
      provider: string | null;
      provider_reference: string | null;
      status: string;
      paid_at: string | null;
      payout_completed_at: string | null;
      refunded_at: string | null;
      failed_at: string | null;
      failure_reason: string | null;
      created_at: string;
    }>).map((r) => ({
      id: r.id,
      bookingId: r.booking_id,
      payerEmail: r.payer_email,
      payoutReceiverDisplayName: r.payout_receiver_display_name,
      grossAmountCents: Number(r.gross_amount_cents),
      platformFeeCents: Number(r.platform_fee_cents),
      netAmountCents: Number(r.net_amount_cents),
      currency: r.currency,
      provider: r.provider,
      providerReference: r.provider_reference,
      status: r.status,
      paidAt: r.paid_at,
      payoutCompletedAt: r.payout_completed_at,
      refundedAt: r.refunded_at,
      failedAt: r.failed_at,
      failureReason: r.failure_reason,
      createdAt: r.created_at,
    }));
  } catch (err) {
    logServerError("messages.loadInquiryBookingTransactions", err);
    return [];
  }
}

// ─── Roster picker for AddTalentPicker drawer ────────────────────────────────

export type AddTalentPickerRow = {
  id: string;
  displayName: string;
  initials: string;
  primaryRole: string | null;
  homeCity: string | null;
  photoUrl: string | null;
  alreadyOnLineup: boolean;
};

export async function loadAddTalentPickerRows(
  tenantId: string,
  inquiryId: string,
): Promise<AddTalentPickerRow[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    // Roster.
    const { data: rosterRows } = await supabase
      .from("agency_talent_roster")
      .select(`
        talent_profile_id,
        status,
        talent_profiles:talent_profile_id (
          id, display_name, first_name, last_name,
          home_city_text,
          talent_profile_taxonomy ( taxonomy_terms ( name ), relationship_type ),
          talent_service_areas ( city, service_kind )
        )
      `)
      .eq("tenant_id", tenantId)
      .neq("status", "removed")
      .limit(500);

    // Existing participants (mark them as alreadyOnLineup).
    const { data: existing } = await supabase
      .from("inquiry_participants")
      .select("talent_profile_id")
      .eq("tenant_id", tenantId)
      .eq("inquiry_id", inquiryId)
      .is("removed_at", null);

    const onLineup = new Set<string>();
    for (const e of (existing ?? []) as { talent_profile_id: string | null }[]) {
      if (e.talent_profile_id) onLineup.add(e.talent_profile_id);
    }

    type Row = {
      talent_profile_id: string;
      status: string;
      talent_profiles: unknown;
    };
    const rows = (rosterRows ?? []) as Row[];

    // Resolve "card" variant photos via media_assets.
    const photoByTalent = await resolveTalentPhotos(
      supabase,
      rows.map((r) => r.talent_profile_id).filter((x): x is string => !!x),
    );

    return rows.map((r): AddTalentPickerRow => {
      const tp = (Array.isArray(r.talent_profiles) ? r.talent_profiles[0] : r.talent_profiles) as
        | {
            id?: string;
            display_name?: string | null;
            first_name?: string | null;
            last_name?: string | null;
            home_city_text?: string | null;
            talent_profile_taxonomy?: Array<{
              taxonomy_terms: unknown;
              relationship_type: string | null;
            }>;
            talent_service_areas?: Array<{ city: string | null; service_kind: string | null }>;
          }
        | null;

      const fullName =
        tp?.display_name ||
        [tp?.first_name, tp?.last_name].filter(Boolean).join(" ").trim() ||
        "Unnamed";

      const primaryTaxonomy = (tp?.talent_profile_taxonomy ?? []).find(
        (t) => t.relationship_type === "primary_role",
      );
      const term = primaryTaxonomy
        ? (Array.isArray(primaryTaxonomy.taxonomy_terms)
            ? primaryTaxonomy.taxonomy_terms[0]
            : primaryTaxonomy.taxonomy_terms)
        : null;
      const primaryRole =
        ((term as { name?: string | null } | null)?.name as string | undefined) ?? null;

      const homeCityFromAreas = (tp?.talent_service_areas ?? []).find(
        (a) => a.service_kind === "home_base",
      )?.city ?? null;
      const homeCity = tp?.home_city_text ?? homeCityFromAreas ?? null;

      return {
        id: r.talent_profile_id,
        displayName: fullName,
        initials: initials(fullName),
        primaryRole,
        homeCity,
        photoUrl: photoByTalent.get(r.talent_profile_id) ?? null,
        alreadyOnLineup: onLineup.has(r.talent_profile_id),
      };
    });
  } catch (err) {
    logServerError("messages.loadAddTalentPickerRows", err);
    return [];
  }
}
