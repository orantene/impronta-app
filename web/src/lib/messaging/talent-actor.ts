import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getPlatformHubTenant } from "@/lib/saas/platform-hub";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

import { fail } from "./refusals";
import { inquiryIsHers, talentIdsOnInquiry, talentIsSeller, type TalentOrderLine } from "./talent-pov";

export type TalentSaleLine = TalentOrderLine & {
  proposedBy: "client" | "staff" | null;
  confirmed: boolean;
};
import type { MessagingRefusal } from "./types";

export type TalentActor = {
  ok: true;
  userId: string;
  talentProfileId: string;
  admin: SupabaseClient;
  supabase: SupabaseClient;
};

export async function loadTalentActor(): Promise<TalentActor | { ok: false; reason: MessagingRefusal }> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail("unavailable");
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) return fail("unavailable");
  if (!user) return fail("not_allowed");
  const admin = createServiceRoleClient();
  if (!admin) return fail("unavailable");
  const { data, error } = await admin.from("talent_profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (error) return fail("unavailable");
  if (!data) return fail("not_allowed");
  return {
    ok: true,
    userId: user.id,
    talentProfileId: (data as { id: string }).id,
    admin,
    supabase,
  };
}

export type OwnedTalentInquiry = {
  ok: true;
  participantId: string | null;
  participantStatus: string;
  tenantId: string;
  version: number;
  sourceContext: unknown;
  isSeller: boolean;
};

/**
 * The inquiry must list her as talent. The tenant id comes from the inquiry
 * row, never from the client. She is the seller when that tenant is the hub.
 */
export async function loadOwnedTalentInquiry(
  admin: SupabaseClient,
  talentProfileId: string,
  inquiryId: string,
): Promise<OwnedTalentInquiry | { ok: false; reason: MessagingRefusal }> {
  const { data: part, error: partErr } = await admin
    .from("inquiry_participants")
    .select("id, status")
    .eq("inquiry_id", inquiryId)
    .eq("talent_profile_id", talentProfileId)
    .eq("role", "talent")
    .neq("status", "removed")
    .maybeSingle();
  if (partErr) return fail("unavailable");
  const { data: inquiry, error } = await admin
    .from("inquiries")
    .select("id, tenant_id, version, source_context, interpreted_query")
    .eq("id", inquiryId)
    .maybeSingle();
  if (error) return fail("unavailable");
  const row = inquiry as {
    tenant_id?: string;
    version?: number;
    source_context?: unknown;
    interpreted_query?: unknown;
  } | null;
  const tenantId = row?.tenant_id ?? "";
  if (!tenantId) return fail("not_found");
  const hers = inquiryIsHers({
    profileId: talentProfileId,
    participant: Boolean(part),
    talentIds: talentIdsOnInquiry(row?.source_context, row?.interpreted_query),
  });
  if (!hers) return fail("not_found");
  const hub = await getPlatformHubTenant();
  return {
    ok: true,
    participantId: part ? (part as { id: string }).id : null,
    participantStatus: part ? (part as { status: string }).status : "none",
    tenantId,
    version: Number(row?.version ?? 0),
    sourceContext: row?.source_context ?? null,
    isSeller: talentIsSeller(tenantId, hub?.tenantId ?? null),
  };
}

/** Her conversations across tenants. A guest chat that names only her counts. */
export async function listTalentInquiryIds(
  admin: SupabaseClient,
  profileId: string,
): Promise<{ ok: true; ids: string[] } | { ok: false; reason: MessagingRefusal }> {
  const { data, error } = await admin
    .from("inquiry_participants")
    .select("inquiry_id")
    .eq("talent_profile_id", profileId)
    .eq("role", "talent")
    .neq("status", "removed");
  if (error) return fail("unavailable");
  const participantIds = new Set(
    ((data ?? []) as { inquiry_id: string }[]).map((row) => row.inquiry_id).filter(Boolean),
  );
  const [bySource, byLineup] = await Promise.all([
    admin
      .from("inquiries")
      .select("id, source_context, interpreted_query")
      .contains("source_context", { talent_ids: [profileId] }),
    admin
      .from("inquiries")
      .select("id, source_context, interpreted_query")
      .contains("interpreted_query", { talent: { selected_ids: [profileId] } }),
  ]);
  const namedRows = [
    ...((bySource.error ? [] : bySource.data ?? []) as { id: string; source_context: unknown; interpreted_query: unknown }[]),
    ...((byLineup.error ? [] : byLineup.data ?? []) as { id: string; source_context: unknown; interpreted_query: unknown }[]),
  ];
  const ids = [
    ...new Set([
      ...participantIds,
      ...namedRows
        .filter((row) =>
          inquiryIsHers({
            profileId,
            participant: participantIds.has(row.id),
            talentIds: talentIdsOnInquiry(row.source_context, row.interpreted_query),
          }),
        )
        .map((row) => row.id),
    ]),
  ];
  return { ok: true, ids };
}

export async function loadTalentSale(
  admin: SupabaseClient,
  talentProfileId: string,
  inquiryId: string,
  tenantId: string,
): Promise<
  | { ok: true; lines: TalentSaleLine[]; clientTotalCents: number; paidCents: number; currency: string; herNetCents: number | null }
  | { ok: true; empty: true }
  | { ok: false; reason: MessagingRefusal }
> {
  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, status, currency, total_cents, tenant_id")
    .eq("inquiry_id", inquiryId)
    .eq("source_channel", "messages")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (orderErr) return fail("unavailable");
  const sale = order as {
    id: string;
    status: string;
    currency: string | null;
    total_cents: number | string | null;
    tenant_id: string;
  } | null;
  if (!sale || sale.tenant_id !== tenantId) return { ok: true, empty: true };
  const { data: rows, error: lineErr } = await admin
    .from("order_lines")
    .select("id, label, units, unit_cents, talent_profile_id, talent_cost_cents, proposed_by, confirmed_at")
    .eq("order_id", sale.id)
    .order("created_at", { ascending: true });
  if (lineErr) return fail("unavailable");
  const raw = ((rows ?? []) as Array<{
    id: string;
    label: string | null;
    units: number | null;
    unit_cents: number | null;
    talent_profile_id: string | null;
    talent_cost_cents: number | null;
    proposed_by: string | null;
    confirmed_at: string | null;
  }>).map((line) => ({
    id: line.id,
    label: line.label ?? "Item",
    units: Number(line.units ?? 1),
    unitCents: Number(line.unit_cents ?? 0),
    talentProfileId: line.talent_profile_id,
    talentCostCents: Number(line.talent_cost_cents ?? 0),
    proposedBy: (line.proposed_by === "client" || line.proposed_by === "staff" ? line.proposed_by : null) as
      | "client"
      | "staff"
      | null,
    confirmed: line.confirmed_at != null,
  }));
  const { data: inquiry, error: inquiryErr } = await admin
    .from("inquiries")
    .select("current_offer_id")
    .eq("id", inquiryId)
    .maybeSingle();
  if (inquiryErr) return fail("unavailable");
  const offerId = (inquiry as { current_offer_id?: string | null } | null)?.current_offer_id ?? null;
  let offerNet: number | null = null;
  if (offerId) {
    const { data: offerLines, error: offerErr } = await admin
      .from("inquiry_offer_line_items")
      .select("talent_cost")
      .eq("offer_id", offerId)
      .eq("talent_profile_id", talentProfileId);
    if (offerErr) return fail("unavailable");
    if (offerLines && offerLines.length > 0) {
      const major = (offerLines as { talent_cost: number | null }[]).reduce((sum, row) => sum + (Number(row.talent_cost) || 0), 0);
      if (major > 0) offerNet = Math.round(major * 100);
    }
  }
  const lineNet = raw
    .filter((line) => line.talentProfileId === talentProfileId)
    .reduce((sum, line) => sum + line.talentCostCents * Math.max(1, line.units), 0);
  const clientTotal = Number(sale.total_cents ?? 0) || raw.reduce((sum, line) => sum + line.units * line.unitCents, 0);
  const paid = sale.status === "paid" || sale.status === "fulfilled" || sale.status === "partially_refunded" ? clientTotal : 0;
  return {
    ok: true,
    lines: raw,
    clientTotalCents: clientTotal,
    paidCents: paid,
    currency: sale.currency ?? "USD",
    herNetCents: offerNet ?? (lineNet > 0 ? lineNet : null),
  };
}
