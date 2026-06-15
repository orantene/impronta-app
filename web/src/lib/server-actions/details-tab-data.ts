"use server";

/**
 * Details Tab data aggregator — server action that builds the
 * DetailsTabData object the canonical <DetailsTab> component consumes.
 *
 * Plan v3 (web/docs/details-tab-redesign-2026-05-13.md):
 *   §3 — 9 canonical sections
 *   §4 — role visibility matrix
 *   §6 — activity log driven by inquiry_audit_log.visibility_scope
 *   §9 — admin/coord-only Risk & Missing
 *
 * Pov is caller-passed (admin shell knows it's admin, talent shell
 * knows it's talent, etc.). We do NOT re-derive pov from the actor
 * here — that's the shell's job. We only enforce that the caller
 * has *some* read on this inquiry; RLS handles deeper authorization.
 *
 * Activity rows from inquiry_audit_log are filtered by
 * `visibility_scope`:
 *   client      → only client_visible
 *   talent      → client_visible | talent_visible
 *   coord       → client_visible | talent_visible | coord_visible
 *   talent_coord→ client_visible | talent_visible | coord_visible
 *   admin       → all (including admin_only)
 */

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import type { DetailsTabData, DetailsTabPov } from "@/components/details-tab/DetailsTab";
import {
  loadCrossTenantContext,
  describeCrossTenantContext,
} from "@/lib/inquiry/cross-tenant-context";

const ADMIN_SCOPES = new Set(["client_visible", "talent_visible", "coord_visible", "admin_only"]);
const COORD_SCOPES = new Set(["client_visible", "talent_visible", "coord_visible"]);
const TALENT_SCOPES = new Set(["client_visible", "talent_visible"]);
const CLIENT_SCOPES = new Set(["client_visible"]);

function scopesFor(pov: DetailsTabPov): Set<string> {
  switch (pov) {
    case "admin": return ADMIN_SCOPES;
    case "coord":
    case "talent_coord": return COORD_SCOPES;
    case "talent": return TALENT_SCOPES;
    case "client": return CLIENT_SCOPES;
  }
}

type InquiryRow = {
  id: string;
  tenant_id: string;
  status: string | null;
  contact_name: string | null;
  company: string | null;
  event_date: string | null;
  event_location: string | null;
  quantity: number | null;
  next_action_by: string | null;
  event_timezone: string | null;
  wardrobe_notes: string | null;
  equipment_notes: string | null;
  transport_notes: string | null;
  lodging_notes: string | null;
  meals_notes: string | null;
  access_notes: string | null;
  deadline_at: string | null;
};

type BookingRow = {
  id: string;
  title: string | null;
  status: string | null;
  event_date: string | null;
  venue_name: string | null;
  venue_location_text: string | null;
  contact_name: string | null;
  wardrobe_notes: string | null;
  equipment_notes: string | null;
  transport_notes: string | null;
  lodging_notes: string | null;
  meals_notes: string | null;
  access_notes: string | null;
  deadline_at: string | null;
  timezone: string | null;
};

type ParticipantRow = {
  role: string | null;
  status: string | null;
  user_id: string | null;
  talent_profile_id: string | null;
};

type AuditRow = {
  id: string;
  kind: string;
  actor_user_id: string | null;
  payload: Record<string, unknown> | null;
  visibility_scope: string | null;
  field_group: string | null;
  field_key: string | null;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
};

function stageLabel(status: string | null | undefined): string {
  switch (status) {
    case "new":
    case "draft":
    case "submitted": return "Inquiry";
    case "coordination":
    case "in_progress":
    case "offer_sent": return "Offer sent";
    case "approved":
    case "booked":
    case "confirmed": return "Booked";
    case "today":
    case "in_event":
    case "live": return "Today";
    case "wrapped":
    case "completed":
    case "closed": return "Wrapped";
    case "cancelled":
    case "lost": return "Cancelled";
    default: return status ? toTitle(status) : "Inquiry";
  }
}

function toTitle(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Humanize `inquiries.next_action_by`. The column stores a role
 * identifier ("coordinator" / "client" / "talent") — rendered as-is,
 * the Details-tab Section 1 just says "coordinator" which reads as
 * a label glitch. Translate into pov-appropriate call-to-action copy.
 */
function nextActionCopy(
  rawNextActionBy: string | null | undefined,
  pov: DetailsTabPov,
): string | undefined {
  if (!rawNextActionBy) return undefined;
  const key = rawNextActionBy.toLowerCase().trim();
  switch (key) {
    case "coordinator":
    case "admin":
    case "staff":
      return pov === "admin" || pov === "coord" || pov === "talent_coord"
        ? "Your move — review and respond"
        : "Coordinator is reviewing";
    case "client":
      return pov === "client" ? "Your move — review and respond" : "Waiting on client";
    case "talent":
      return pov === "talent" || pov === "talent_coord" ? "Your move — review and respond" : "Waiting on talent";
    default:
      return toTitle(key);
  }
}

function describeAuditKind(kind: string, payload: Record<string, unknown> | null): string {
  // Kept terse — DetailsTab activity rows are one-liners. We never
  // expose internal stage identifiers; humanize to verbs.
  switch (kind) {
    case "offer_created": return "Offer drafted";
    case "offer_edited": return "Offer edited";
    case "offer_sent": return "Offer sent to client";
    case "offer_accepted": return "Offer accepted";
    case "offer_countered": return "Offer countered";
    case "offer_declined": return "Offer declined";
    case "payment_requested": return "Payment requested";
    case "payment_paid": return "Payment received";
    case "payment_refunded": return "Payment refunded";
    case "talent_added": return "Talent added to lineup";
    case "talent_removed": return "Talent removed from lineup";
    case "coordinator_added": return "Coordinator joined";
    case "coordinator_removed": return "Coordinator removed";
    case "commission_split_changed": return "Commission split changed";
    case "call_sheet_changed": return "Call sheet updated";
    case "booking_wrapped": return "Booking wrapped";
    case "booking_cancelled": return "Booking cancelled";
    case "field_changed": {
      const group = payload?.field_group ? String(payload.field_group) : "";
      const key = payload?.field_key ? String(payload.field_key) : "";
      const human = key ? toTitle(key) : group ? toTitle(group) : "Field";
      return `${human} updated`;
    }
    default: return toTitle(kind);
  }
}

function toneForKind(kind: string): "info" | "warn" | "success" | undefined {
  if (kind === "offer_accepted" || kind === "payment_paid" || kind === "booking_wrapped") return "success";
  if (kind === "offer_declined" || kind === "payment_refunded" || kind === "booking_cancelled" || kind === "talent_removed") return "warn";
  return "info";
}

function formatTime(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  // 24h HH:MM. Avoids locale-derived "PM" so tab is deterministic
  // across server/client renders.
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return undefined;
    const h = String(d.getUTCHours()).padStart(2, "0");
    const m = String(d.getUTCMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  } catch { return undefined; }
}

function formatDate(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toISOString().slice(0, 10);
  } catch { return undefined; }
}

/**
 * Build the DetailsTab payload for a given inquiry + pov.
 *
 * Returns null if the inquiry is missing or the caller lacks read
 * access (RLS or explicit not-found).
 */
export async function loadDetailsTabData(
  inquiryId: string,
  pov: DetailsTabPov,
): Promise<DetailsTabData | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;

    const { data: inquiryRaw, error: inqErr } = await supabase
      .from("inquiries")
      .select(
        "id, tenant_id, status, contact_name, company, event_date, event_location, quantity, next_action_by, event_timezone, wardrobe_notes, equipment_notes, transport_notes, lodging_notes, meals_notes, access_notes, deadline_at",
      )
      .eq("id", inquiryId)
      .maybeSingle();
    if (inqErr || !inquiryRaw) {
      if (inqErr) logServerError("details-tab-data.loadInquiry", inqErr);
      return null;
    }
    const inquiry = inquiryRaw as InquiryRow;

    // Booking (may be null pre-conversion) — pulls the operational
    // logistics columns added in 20260513225052.
    const { data: bookingRaw } = await supabase
      .from("agency_bookings")
      .select("id, title, status, event_date, venue_name, venue_location_text, contact_name, wardrobe_notes, equipment_notes, transport_notes, lodging_notes, meals_notes, access_notes, deadline_at, timezone")
      .eq("tenant_id", inquiry.tenant_id)
      .eq("source_inquiry_id", inquiryId)
      .maybeSingle();
    const booking = (bookingRaw ?? null) as BookingRow | null;

    // Lineup counts — by status, only `role = 'talent'`.
    const { data: participantsRaw } = await supabase
      .from("inquiry_participants")
      .select("role, status, user_id, talent_profile_id")
      .eq("inquiry_id", inquiryId)
      .eq("tenant_id", inquiry.tenant_id);
    const participants = (participantsRaw ?? []) as ParticipantRow[];

    const talentRows = participants.filter((p) => p.role === "talent" && p.status !== "removed");
    const lineup = {
      invited: talentRows.filter((p) => p.status === "invited").length,
      // Engine flips inquiry_participants.status from 'invited' to 'active'
      // on acceptTalentInvitation. The participant_status enum has no
      // 'accepted' value — see migration 20260520101000. Counting 'active'
      // here matches the live data model; 'accepted' kept as a fallback
      // for any legacy/imported rows.
      accepted: talentRows.filter((p) => p.status === "active" || p.status === "accepted").length,
      hold: talentRows.filter((p) => p.status === "hold").length,
      declined: talentRows.filter((p) => p.status === "declined").length,
      total: talentRows.length,
    };

    // Coordinators — display names resolved from profiles for the
    // user_ids attached to coord rows.
    const coordRows = participants.filter((p) => p.role === "coordinator" && p.status !== "removed");
    const coordUserIds = [...new Set(coordRows.map((p) => p.user_id).filter(Boolean) as string[])];
    let coordinators: Array<{ name: string; role?: string }> | undefined;
    if (coordUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", coordUserIds);
      const nameMap = new Map<string, string>();
      for (const p of (profiles ?? []) as { id: string; display_name: string | null }[]) {
        if (p.display_name) nameMap.set(p.id, p.display_name);
      }
      coordinators = coordRows
        .map((c) => (c.user_id ? nameMap.get(c.user_id) ?? null : null))
        .filter((n): n is string => !!n)
        .map((name) => ({ name, role: "Coordinator" }));
    }

    // Activity — pull recent audit rows, filter by visibility_scope
    // appropriate for pov. Engine rows without a visibility_scope
    // (legacy / unscored kinds) are admin-only by default.
    const { data: auditRaw } = await supabase
      .from("inquiry_audit_log")
      .select("id, kind, actor_user_id, payload, visibility_scope, field_group, field_key, old_value, new_value, created_at")
      .eq("inquiry_id", inquiryId)
      .order("created_at", { ascending: false })
      .limit(30);
    const audit = (auditRaw ?? []) as AuditRow[];

    const allowedScopes = scopesFor(pov);
    const visibleAudit = audit.filter((row) => {
      const scope = row.visibility_scope;
      if (scope == null) return pov === "admin";
      return allowedScopes.has(scope);
    });

    const actorIds = [...new Set(visibleAudit.map((r) => r.actor_user_id).filter(Boolean) as string[])];
    const actorNameMap = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: actorProfiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", actorIds);
      for (const p of (actorProfiles ?? []) as { id: string; display_name: string | null }[]) {
        if (p.display_name) actorNameMap.set(p.id, p.display_name);
      }
    }

    const activity = visibleAudit.slice(0, 12).map((row) => ({
      id: row.id,
      actor: row.actor_user_id ? (actorNameMap.get(row.actor_user_id) ?? "Team") : "System",
      summary: describeAuditKind(row.kind, row.payload),
      ts: row.created_at,
      tone: toneForKind(row.kind),
    }));

    // Risk & Missing — admin/coord only. Cheap heuristic for now;
    // the field's contract is "human-readable strings", so the
    // engine doesn't need to produce a structured shape.
    let missingItems: string[] | undefined;
    let atRiskFlags: string[] | undefined;
    if (pov === "admin" || pov === "coord" || pov === "talent_coord") {
      const missing: string[] = [];
      if (!inquiry.event_date && !booking?.event_date) missing.push("Event date");
      if (!inquiry.event_location && !booking?.venue_location_text) missing.push("Location");
      if (!booking) missing.push("Booking not yet created");
      const tz = booking?.timezone ?? inquiry.event_timezone;
      const dl = booking?.deadline_at ?? inquiry.deadline_at;
      if (!dl) missing.push("Deadline");
      if (!tz) missing.push("Timezone");
      missingItems = missing;

      const risks: string[] = [];
      if (lineup.total === 0) risks.push("No talent invited yet");
      else if (lineup.accepted === 0 && lineup.invited > 0) risks.push("Awaiting talent confirmation");
      atRiskFlags = risks;
    }

    // Section 6 — Offer/Payment role-shaped copy. The component
    // already prints a "—" if both label + status are empty, so we
    // leave them undefined when there's nothing meaningful to show.
    let offerLabel: string | undefined;
    let offerStatus: string | undefined;
    let paymentLabel: string | undefined;
    let paymentStatus: string | undefined;
    if (booking) {
      offerStatus = booking.status === "confirmed" ? "Accepted" : booking.status ? toTitle(booking.status) : undefined;
      // Pov-shaped framing (no $$ value pulled here — that lives on
      // PaymentRequestCard and the StatusSheet; details-tab keeps it
      // at the verb level).
      if (pov === "client") {
        offerLabel = "Your offer";
        paymentLabel = "Your payment";
      } else if (pov === "talent" || pov === "talent_coord") {
        offerLabel = "Your rate";
        paymentLabel = "Your payout";
      } else {
        offerLabel = "Offer";
        paymentLabel = "Payment";
      }
    }

    const data: DetailsTabData = {
      stage: stageLabel(inquiry.status),
      nextAction: nextActionCopy(inquiry.next_action_by, pov),

      title: booking?.title ?? inquiry.company ?? inquiry.contact_name ?? "Untitled inquiry",
      brief: undefined,
      talentCount: inquiry.quantity ?? undefined,

      date: formatDate(booking?.event_date ?? inquiry.event_date),
      timezone: booking?.timezone ?? inquiry.event_timezone ?? undefined,
      deadline: formatDate(booking?.deadline_at ?? inquiry.deadline_at),

      venue: booking?.venue_name ?? undefined,
      address: booking?.venue_location_text ?? undefined,
      city: inquiry.event_location ?? undefined,
      accessNotes: booking?.access_notes ?? inquiry.access_notes ?? undefined,

      clientName: booking?.contact_name ?? inquiry.contact_name ?? undefined,
      coordinators,
      lineup,
      // D5.5 — cross-tenant context badge. Returns null on single-
      // tenant (no badge shows); pre-formatted human label on cross-
      // tenant. Pure additive — never hides anything.
      crossTenantLabel: describeCrossTenantContext(
        await loadCrossTenantContext(supabase, inquiryId),
      ),

      offerLabel,
      offerStatus,
      paymentLabel,
      paymentStatus,

      wardrobe: booking?.wardrobe_notes ?? inquiry.wardrobe_notes ?? undefined,
      equipment: booking?.equipment_notes ?? inquiry.equipment_notes ?? undefined,
      transport: booking?.transport_notes ?? inquiry.transport_notes ?? undefined,
      lodging: booking?.lodging_notes ?? inquiry.lodging_notes ?? undefined,
      meals: booking?.meals_notes ?? inquiry.meals_notes ?? undefined,
      callTime: formatTime(booking?.event_date),

      missingItems,
      atRiskFlags,

      activity,
    };

    return data;
  } catch (err) {
    logServerError("details-tab-data.loadDetailsTabData", err);
    return null;
  }
}
