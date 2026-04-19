import type { SupabaseClient } from "@supabase/supabase-js";
import { loadRecentActivityPanelData } from "./workspace-v3-panel-data";
import type {
  BookingPanelData,
  CoordinatorsPanelData,
  OffersApprovalsPanelData,
  RequirementGroupsPanelData,
} from "./workspace-v3-panel-types";
import type {
  BookingDrillPayload,
  CoordinatorsDrillPayload,
  DrillApprovalRow,
  DrillKey,
  DrillOfferRow,
  DrillParticipant,
  DrillPayload,
  GroupsDrillGroup,
  GroupsDrillPayload,
  OffersDrillPayload,
  TimelineDrillPayload,
} from "./workspace-v3-drill-types";

/**
 * Admin Workspace V3 — drill-down data loaders (spec §5.3).
 *
 * Every loader accepts the already-resolved panel payload for the drill's
 * own panel, then enriches it with the extra detail the sheet needs. This
 * keeps page.tsx's data path linear: panels → drill (if open) → render.
 *
 * Queries here stay scoped to the one drill being opened. A closed drill
 * produces zero queries.
 */

export async function loadDrillPayload(
  supabase: SupabaseClient,
  inquiryId: string,
  drill: DrillKey,
  context: {
    requirementGroupsPanel: RequirementGroupsPanelData;
    offersApprovalsPanel: OffersApprovalsPanelData;
    coordinatorsPanel: CoordinatorsPanelData;
    bookingPanel: BookingPanelData;
    bookings: {
      id: string;
      booking_talent?:
        | {
            talent_profile_id: string | null;
            talent_name_snapshot: string | null;
            profile_code_snapshot: string | null;
            talent_profiles: { profile_code: string; display_name: string | null } | null;
          }[]
        | null;
    }[];
    currentOfferId: string | null;
  },
): Promise<DrillPayload | null> {
  switch (drill) {
    case "groups":
      return await buildGroupsDrill(supabase, inquiryId, context);
    case "offers":
      return await buildOffersDrill(
        supabase,
        inquiryId,
        context.currentOfferId,
        context.offersApprovalsPanel,
      );
    case "coordinators":
      return buildCoordinatorsDrill(context.coordinatorsPanel);
    case "booking":
      return buildBookingDrill(context.bookingPanel, context.bookings);
    case "timeline":
      return await buildTimelineDrill(supabase, inquiryId);
    default:
      return null;
  }
}

async function buildGroupsDrill(
  supabase: SupabaseClient,
  inquiryId: string,
  context: {
    requirementGroupsPanel: RequirementGroupsPanelData;
    currentOfferId: string | null;
  },
): Promise<GroupsDrillPayload> {
  // Pull active-role participants for this inquiry, scoped to the ones we care
  // about (invited/active — declined/removed are filtered out because M4.2's
  // selected_count uses the same filter).
  const { data: parts } = await supabase
    .from("inquiry_participants")
    .select(
      "id, talent_profile_id, status, sort_order, requirement_group_id, talent_profiles(profile_code, display_name)",
    )
    .eq("inquiry_id", inquiryId)
    .eq("role", "talent")
    .in("status", ["invited", "active"])
    .order("sort_order", { ascending: true });

  // Supabase types the embedded relation as an array shape even though the FK
  // is 1:1 — normalize via `unknown` cast then pick the first (or only) row.
  const rowsRaw = (parts ?? []) as unknown as {
    id: string;
    talent_profile_id: string;
    status: DrillParticipant["status"];
    sort_order: number | null;
    requirement_group_id: string | null;
    talent_profiles:
      | { profile_code: string; display_name: string | null }
      | { profile_code: string; display_name: string | null }[]
      | null;
  }[];
  const rows = rowsRaw.map((r) => ({
    ...r,
    talent_profiles: Array.isArray(r.talent_profiles)
      ? (r.talent_profiles[0] ?? null)
      : r.talent_profiles,
  })) as {
    id: string;
    talent_profile_id: string;
    status: DrillParticipant["status"];
    sort_order: number | null;
    requirement_group_id: string | null;
    talent_profiles: { profile_code: string; display_name: string | null } | null;
  }[];

  // Approval state on the current offer, keyed by participant_id.
  let approvalByParticipant = new Map<string, DrillParticipant["approvalStatus"]>();
  if (context.currentOfferId) {
    const { data: approvals } = await supabase
      .from("inquiry_approvals")
      .select("participant_id, status")
      .eq("offer_id", context.currentOfferId);
    approvalByParticipant = new Map(
      ((approvals ?? []) as { participant_id: string; status: string }[])
        .filter((a) => ["pending", "accepted", "rejected"].includes(a.status))
        .map((a) => [a.participant_id, a.status as DrillParticipant["approvalStatus"]]),
    );
  }

  const toParticipant = (r: (typeof rows)[number]): DrillParticipant => ({
    participantId: r.id,
    talentProfileId: r.talent_profile_id,
    displayName: r.talent_profiles?.display_name ?? null,
    profileCode: r.talent_profiles?.profile_code ?? "",
    status: r.status,
    sortOrder: r.sort_order ?? 0,
    approvalStatus: approvalByParticipant.get(r.id) ?? null,
  });

  const byGroup = new Map<string, DrillParticipant[]>();
  const orphans: DrillParticipant[] = [];
  for (const row of rows) {
    const p = toParticipant(row);
    if (row.requirement_group_id) {
      const arr = byGroup.get(row.requirement_group_id) ?? [];
      arr.push(p);
      byGroup.set(row.requirement_group_id, arr);
    } else {
      // Transitional: legacy rows with NULL requirement_group_id. Surfaced as
      // "orphans" so staff can reassign before M5.6 flips NOT NULL.
      orphans.push(p);
    }
  }

  const groups: GroupsDrillGroup[] = context.requirementGroupsPanel.groups.map((g) => ({
    ...g,
    participants: byGroup.get(g.id) ?? [],
  }));

  return {
    kind: "groups",
    groups,
    summary: context.requirementGroupsPanel,
    orphans,
  };
}

async function buildOffersDrill(
  supabase: SupabaseClient,
  inquiryId: string,
  currentOfferId: string | null,
  summary: OffersApprovalsPanelData,
): Promise<OffersDrillPayload> {
  const { data: offerRows } = await supabase
    .from("inquiry_offers")
    .select(
      "id, version, status, created_at, updated_at, sent_at, accepted_at, total_client_price, coordinator_fee, currency_code",
    )
    .eq("inquiry_id", inquiryId)
    .order("version", { ascending: false });

  const offers: DrillOfferRow[] = ((offerRows ?? []) as {
    id: string;
    version: number;
    status: string;
    created_at: string;
    updated_at: string;
    sent_at: string | null;
    accepted_at: string | null;
    total_client_price: number | string;
    coordinator_fee: number | string;
    currency_code: string | null;
  }[]).map((r) => ({
    id: r.id,
    version: r.version,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    sentAt: r.sent_at,
    acceptedAt: r.accepted_at,
    totalClientPrice: Number(r.total_client_price) || 0,
    coordinatorFee: Number(r.coordinator_fee) || 0,
    currencyCode: r.currency_code ?? "MXN",
    isCurrent: r.id === currentOfferId,
  }));

  let currentOfferApprovals: DrillApprovalRow[] = [];
  if (currentOfferId) {
    const { data: apRows } = await supabase
      .from("inquiry_approvals")
      .select("id, participant_id, status")
      .eq("offer_id", currentOfferId);
    const participantIds = Array.from(
      new Set(((apRows ?? []) as { participant_id: string }[]).map((r) => r.participant_id)),
    );
    let nameByPart = new Map<string, { displayName: string | null; profileCode: string }>();
    if (participantIds.length > 0) {
      const { data: partRows } = await supabase
        .from("inquiry_participants")
        .select("id, talent_profiles(profile_code, display_name)")
        .in("id", participantIds);
      const partRowsNorm = ((partRows ?? []) as unknown as {
        id: string;
        talent_profiles:
          | { profile_code: string; display_name: string | null }
          | { profile_code: string; display_name: string | null }[]
          | null;
      }[]).map((p) => ({
        id: p.id,
        talent_profiles: Array.isArray(p.talent_profiles)
          ? (p.talent_profiles[0] ?? null)
          : p.talent_profiles,
      }));
      for (const p of partRowsNorm) {
        nameByPart.set(p.id, {
          displayName: p.talent_profiles?.display_name ?? null,
          profileCode: p.talent_profiles?.profile_code ?? "",
        });
      }
    }
    currentOfferApprovals = ((apRows ?? []) as {
      id: string;
      participant_id: string;
      status: string;
    }[])
      .filter((a) => ["pending", "accepted", "rejected"].includes(a.status))
      .map((a) => {
        const name = nameByPart.get(a.participant_id);
        return {
          id: a.id,
          participantId: a.participant_id,
          displayName: name?.displayName ?? null,
          profileCode: name?.profileCode ?? "",
          status: a.status as DrillApprovalRow["status"],
        };
      });
  }

  return {
    kind: "offers",
    summary,
    offers,
    currentOfferApprovals,
  };
}

function buildCoordinatorsDrill(
  summary: CoordinatorsPanelData,
): CoordinatorsDrillPayload {
  return { kind: "coordinators", summary };
}

function buildBookingDrill(
  summary: BookingPanelData,
  bookings: {
    id: string;
    booking_talent?:
      | {
          talent_profile_id: string | null;
          talent_name_snapshot: string | null;
          profile_code_snapshot: string | null;
          talent_profiles: { profile_code: string; display_name: string | null } | null;
        }[]
      | null;
  }[],
): BookingDrillPayload {
  const talent: BookingDrillPayload["talent"] = [];
  for (const b of bookings) {
    for (const bt of b.booking_talent ?? []) {
      talent.push({
        bookingId: b.id,
        displayName:
          bt.talent_profiles?.display_name ?? bt.talent_name_snapshot ?? null,
        profileCode:
          bt.talent_profiles?.profile_code ?? bt.profile_code_snapshot ?? null,
      });
    }
  }
  return { kind: "booking", summary, talent };
}

async function buildTimelineDrill(
  supabase: SupabaseClient,
  inquiryId: string,
): Promise<TimelineDrillPayload> {
  // Cap the timeline to a recent window. Full historical timeline lives in
  // the audit log; this sheet is about "what happened lately".
  const { events } = await loadRecentActivityPanelData(supabase, inquiryId, 100);
  const { count } = await supabase
    .from("inquiry_events")
    .select("id", { count: "exact", head: true })
    .eq("inquiry_id", inquiryId);
  return {
    kind: "timeline",
    events,
    totalCount: typeof count === "number" ? count : events.length,
  };
}
