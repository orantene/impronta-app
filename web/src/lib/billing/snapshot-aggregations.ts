import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";

import {
  mapBookingPayoutStatus,
  type TalentSnapshotAggregateRow,
} from "@/lib/talent/earnings-types";

export type { TalentSnapshotAggregateRow } from "@/lib/talent/earnings-types";

const EUR = "EUR";

type BookingTalentJoinRow = {
  id: string;
  booking_id: string;
  tenant_id: string;
  agency_bookings: {
    id: string;
    event_date: string | null;
    starts_at: string | null;
    title: string;
    client_account_name: string | null;
    client_summary: string | null;
    payout_lifecycle: string;
    payment_status: string;
    status: string;
    source_type_snapshot: string | null;
    payment_method: string | null;
    source_inquiry_id: string | null;
  };
  agencies: {
    id: string;
    slug: string;
    display_name: string;
  } | null;
};

type SnapshotRow = {
  booking_id: string;
  participant_id: string;
  gross_cents: number;
  talent_net_cents: number;
  workspace_fee_cents: number;
  currency_code: string;
  payment_method: string;
};

type ParticipantRow = {
  id: string;
  inquiry_id: string;
  talent_profile_id: string | null;
};

function resolveWorkDateIso(booking: BookingTalentJoinRow["agency_bookings"]): string | null {
  if (booking.event_date) return booking.event_date;
  if (booking.starts_at) return booking.starts_at.slice(0, 10);
  return null;
}

function mapBookingSource(
  sourceType: string | null,
): TalentSnapshotAggregateRow["source"] {
  const normalized = (sourceType ?? "").toLowerCase();
  if (normalized.includes("hub")) return "hub";
  if (normalized.includes("personal") || normalized.includes("freelancer")) {
    return "personal_page";
  }
  if (normalized.includes("agency") || normalized.includes("workspace")) {
    return "agency_routed";
  }
  return "unknown";
}

function resolveClientLabel(booking: BookingTalentJoinRow["agency_bookings"]): string {
  return (
    booking.client_account_name?.trim()
    || booking.client_summary?.trim()
    || booking.title?.trim()
    || "Client"
  );
}

function pickSnapshotForBooking(
  bookingId: string,
  inquiryId: string | null,
  snapshots: SnapshotRow[],
  participantIds: Set<string>,
): SnapshotRow | null {
  const forBooking = snapshots.filter((s) => s.booking_id === bookingId);
  if (forBooking.length === 0) return null;
  if (inquiryId) {
    const matched = forBooking.find((s) => participantIds.has(s.participant_id));
    if (matched) return matched;
  }
  return forBooking[0] ?? null;
}

function isEurRow(currencyCode: string, bookingId: string): boolean {
  if (currencyCode === EUR) return true;
  logServerError(
    "snapshot-aggregations/non_eur_row",
    new Error(`Excluded non-EUR snapshot for booking ${bookingId}: ${currencyCode}`),
  );
  return false;
}

/**
 * Load normalized per-booking commission rows for a talent profile.
 * Joins booking_talent → agency_bookings → booking_commission_snapshot → agencies.
 */
export async function fetchTalentSnapshotAggregateRows(
  supabase: SupabaseClient,
  opts: { talentProfileId: string; since: string; agencyFilter?: string },
): Promise<TalentSnapshotAggregateRow[]> {
  let bookingTalentQuery = supabase
    .from("booking_talent")
    .select(
      `
        id,
        booking_id,
        tenant_id,
        agency_bookings!inner (
          id,
          event_date,
          starts_at,
          title,
          client_account_name,
          client_summary,
          payout_lifecycle,
          payment_status,
          status,
          source_type_snapshot,
          payment_method,
          source_inquiry_id
        ),
        agencies!booking_talent_tenant_id_fkey (
          id,
          slug,
          display_name
        )
      `,
    )
    .eq("talent_profile_id", opts.talentProfileId);

  if (opts.agencyFilter) {
    bookingTalentQuery = bookingTalentQuery.eq("tenant_id", opts.agencyFilter);
  }

  const { data: bookingTalentRows, error: bookingTalentError } = await bookingTalentQuery;
  if (bookingTalentError) {
    logServerError("snapshot-aggregations/booking_talent", bookingTalentError);
    return [];
  }

  const rows = (bookingTalentRows ?? []) as unknown as BookingTalentJoinRow[];
  if (rows.length === 0) return [];

  const bookingIds = [...new Set(rows.map((r) => r.booking_id))];
  const inquiryIds = [
    ...new Set(
      rows
        .map((r) => r.agency_bookings.source_inquiry_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [snapshotsRes, participantsRes] = await Promise.all([
    supabase
      .from("booking_commission_snapshot")
      .select(
        "booking_id, participant_id, gross_cents, talent_net_cents, workspace_fee_cents, currency_code, payment_method",
      )
      .in("booking_id", bookingIds),
    inquiryIds.length > 0
      ? supabase
          .from("inquiry_participants")
          .select("id, inquiry_id, talent_profile_id")
          .eq("talent_profile_id", opts.talentProfileId)
          .in("inquiry_id", inquiryIds)
      : Promise.resolve({ data: [] as ParticipantRow[], error: null }),
  ]);

  if (snapshotsRes.error) {
    logServerError("snapshot-aggregations/snapshots", snapshotsRes.error);
    return [];
  }
  if (participantsRes.error) {
    logServerError("snapshot-aggregations/participants", participantsRes.error);
    return [];
  }

  const snapshots = (snapshotsRes.data ?? []) as SnapshotRow[];
  const participants = (participantsRes.data ?? []) as ParticipantRow[];

  const participantIdsByInquiry = new Map<string, Set<string>>();
  for (const p of participants) {
    const set = participantIdsByInquiry.get(p.inquiry_id) ?? new Set<string>();
    set.add(p.id);
    participantIdsByInquiry.set(p.inquiry_id, set);
  }

  const sinceMs = Date.parse(opts.since);
  const out: TalentSnapshotAggregateRow[] = [];

  for (const row of rows) {
    const booking = row.agency_bookings;
    if (booking.status === "cancelled") continue;

    const workDateIso = resolveWorkDateIso(booking);
    if (!workDateIso) continue;
    if (Date.parse(workDateIso) < sinceMs) continue;

    const inquiryId = booking.source_inquiry_id;
    const participantIds = inquiryId
      ? participantIdsByInquiry.get(inquiryId) ?? new Set<string>()
      : new Set<string>();

    const snapshot = pickSnapshotForBooking(
      row.booking_id,
      inquiryId,
      snapshots,
      participantIds,
    );
    if (!snapshot) continue;
    if (!isEurRow(snapshot.currency_code, row.booking_id)) continue;

    const agency = row.agencies;
    out.push({
      bookingId: row.booking_id,
      bookingTalentId: row.id,
      tenantId: row.tenant_id,
      agencySlug: agency?.slug ?? "",
      agencyName: agency?.display_name ?? "Agency",
      workDate: workDateIso,
      payoutDate: booking.payout_lifecycle === "paid" ? workDateIso : null,
      clientLabel: resolveClientLabel(booking),
      grossCents: snapshot.gross_cents,
      netCents: snapshot.talent_net_cents,
      workspaceFeeCents: snapshot.workspace_fee_cents,
      status: mapBookingPayoutStatus(booking),
      source: mapBookingSource(booking.source_type_snapshot),
      paymentMethod: snapshot.payment_method ?? booking.payment_method,
    });
  }

  out.sort((a, b) => b.workDate.localeCompare(a.workDate));
  return out;
}

type TenantSnapshotJoinRow = {
  booking_id: string;
  participant_id: string;
  owning_party_type: string;
  owning_party_id: string;
  gross_cents: number;
  platform_fee_cents: number;
  workspace_fee_cents: number;
  talent_net_cents: number;
  currency_code: string;
  payment_method: string;
  agency_bookings: {
    id: string;
    event_date: string | null;
    starts_at: string | null;
    created_at: string | null;
    title: string;
    client_account_name: string | null;
    client_summary: string | null;
    payout_lifecycle: string;
    payment_status: string;
    status: string;
    payment_method: string | null;
    tenant_id: string;
  };
};

export type TenantSnapshotAggregateRow = {
  bookingId: string;
  bookingTalentId: string;
  participantId: string;
  tenantId: string;
  workDate: string;
  payoutDate: string | null;
  clientLabel: string;
  talentProfileId: string | null;
  talentDisplayName: string | null;
  grossCents: number;
  platformFeeCents: number;
  workspaceFeeCents: number;
  talentNetCents: number;
  currencyCode: string;
  status: TalentSnapshotAggregateRow["status"];
  paymentMethod: string | null;
};

/**
 * Tenant-scoped snapshot rows for the admin Business Financials surface.
 *
 * Shares the same `booking_commission_snapshot` source as
 * `fetchTalentSnapshotAggregateRows`; the difference is the projection:
 * talent surface filters by `talent_profile_id`, agency surface filters
 * by the tenant's owning-party rows.
 *
 * EUR-only at v1 (matching the talent path). Non-EUR rows are logged and
 * excluded. The status filter narrows by booking lifecycle; the default
 * excludes only cancelled bookings (matching the identity-bar KPI).
 */
export async function fetchTenantSnapshotAggregateRows(
  supabase: SupabaseClient,
  opts: {
    tenantId: string;
    since: string;
    /** Optional booking-status whitelist. Default: all except cancelled. */
    statusFilter?: ReadonlyArray<"tentative" | "confirmed" | "completed" | "cancelled">;
  },
): Promise<TenantSnapshotAggregateRow[]> {
  const { data, error } = await supabase
    .from("booking_commission_snapshot")
    .select(
      `
        booking_id,
        participant_id,
        owning_party_type,
        owning_party_id,
        gross_cents,
        platform_fee_cents,
        workspace_fee_cents,
        talent_net_cents,
        currency_code,
        payment_method,
        agency_bookings!inner (
          id,
          event_date,
          starts_at,
          created_at,
          title,
          client_account_name,
          client_summary,
          payout_lifecycle,
          payment_status,
          status,
          payment_method,
          tenant_id
        )
      `,
    )
    .in("owning_party_type", ["agency", "workspace"])
    .eq("owning_party_id", opts.tenantId);

  if (error) {
    logServerError("snapshot-aggregations/tenant_rows", error);
    return [];
  }

  const rows = (data ?? []) as unknown as TenantSnapshotJoinRow[];
  if (rows.length === 0) return [];

  // Pull participants for talent join (display name + profile id). One
  // additional round-trip rather than a deeply-nested select that
  // sometimes confuses RLS plan selection.
  const participantIds = [...new Set(rows.map((r) => r.participant_id))];
  const { data: pData, error: pError } = await supabase
    .from("inquiry_participants")
    .select("id, talent_profile_id, talent_profiles!inquiry_participants_talent_profile_id_fkey ( id, display_name )")
    .in("id", participantIds);

  if (pError) {
    logServerError("snapshot-aggregations/tenant_participants", pError);
  }

  type ParticipantJoin = {
    id: string;
    talent_profile_id: string | null;
    talent_profiles: { id: string; display_name: string | null } | null;
  };
  const talentByParticipant = new Map<
    string,
    { profileId: string | null; displayName: string | null }
  >();
  for (const p of ((pData ?? []) as unknown as ParticipantJoin[])) {
    talentByParticipant.set(p.id, {
      profileId: p.talent_profile_id,
      displayName: p.talent_profiles?.display_name ?? null,
    });
  }

  const sinceMs = Date.parse(opts.since);
  const statusFilter = opts.statusFilter;
  const out: TenantSnapshotAggregateRow[] = [];

  for (const row of rows) {
    const booking = row.agency_bookings;
    if (booking.tenant_id !== opts.tenantId) continue; // belt + braces
    if (booking.status === "cancelled") continue;
    if (statusFilter && !statusFilter.includes(booking.status as "confirmed")) continue;
    if (!isEurRow(row.currency_code, row.booking_id)) continue;

    const workDateIso =
      booking.event_date ?? booking.starts_at?.slice(0, 10) ?? booking.created_at?.slice(0, 10) ?? null;
    if (!workDateIso) continue;
    if (Date.parse(workDateIso) < sinceMs) continue;

    const t = talentByParticipant.get(row.participant_id);

    out.push({
      bookingId: row.booking_id,
      bookingTalentId: row.booking_id,
      participantId: row.participant_id,
      tenantId: row.owning_party_id,
      workDate: workDateIso,
      payoutDate: booking.payout_lifecycle === "paid" ? workDateIso : null,
      clientLabel: resolveClientLabel(booking as unknown as BookingTalentJoinRow["agency_bookings"]),
      talentProfileId: t?.profileId ?? null,
      talentDisplayName: t?.displayName ?? null,
      grossCents: row.gross_cents,
      platformFeeCents: row.platform_fee_cents,
      workspaceFeeCents: row.workspace_fee_cents,
      talentNetCents: row.talent_net_cents,
      currencyCode: row.currency_code,
      status: mapBookingPayoutStatus(booking),
      paymentMethod: row.payment_method ?? booking.payment_method,
    });
  }

  out.sort((a, b) => b.workDate.localeCompare(a.workDate));
  return out;
}

/** Sum talent_net_cents for a profile since the given ISO timestamp (EUR rows only). */
export async function aggregateTalentNet(opts: {
  talentProfileId: string;
  since: string;
  agencyFilter?: string;
}): Promise<number> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return 0;

  const rows = await fetchTalentSnapshotAggregateRows(supabase, opts);
  return rows.reduce((sum, row) => sum + row.netCents, 0);
}

/**
 * Sum workspace_fee_cents for a tenant since the given ISO timestamp.
 * Exported for future admin Business Financials — not consumed in Phase D.
 */
export async function aggregateAgencyEarnings(opts: {
  tenantId: string;
  since: string;
}): Promise<number> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return 0;

  const { data, error } = await supabase
    .from("booking_commission_snapshot")
    .select("workspace_fee_cents, currency_code, created_at, owning_party_id, owning_party_type")
    .gte("created_at", opts.since)
    .in("owning_party_type", ["agency", "workspace"])
    .eq("owning_party_id", opts.tenantId);

  if (error) {
    logServerError("snapshot-aggregations/agency_earnings", error);
    return 0;
  }

  return (data ?? []).reduce((sum, row) => {
    if (row.currency_code !== EUR) {
      logServerError(
        "snapshot-aggregations/agency_non_eur",
        new Error(`Excluded non-EUR agency row: ${row.currency_code}`),
      );
      return sum;
    }
    return sum + (row.workspace_fee_cents as number);
  }, 0);
}
