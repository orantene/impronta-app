/**
 * Client-side Details tab data loader.
 *
 * Spec: web/docs/inquiry-engine-spec-2026-05-14.md §6.4 + §12
 * Plan: web/docs/client-execution-plan-2026-05-14.md Phase C
 *
 * Returns the canonical job-record shape the client's Details tab
 * renders. Pulls from:
 *   • public.inquiries (flat columns + interpreted_query + source_context)
 *   • public.inquiry_participants (talent lineup, client-safe fields)
 *   • public.inquiry_offers (current offer state, client-visible fields only)
 *   • public.inquiry_events (activity feed, client-visible events only)
 *   • public.profiles (coordinator name)
 *   • public.talent_profiles (talent display)
 *
 * Permission boundary: the loader explicitly filters out internal-only
 * fields (talent private rates, coordinator commission, staff notes,
 * internal activity events). Server actions that mutate must still
 * gate by RLS.
 */

import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

// ─── Output shape ───────────────────────────────────────────────────────────

export type ClientInquiryDetails = {
  /** The inquiry id this row represents. */
  id: string;
  tenant_id: string;
  status: string;
  /** When the inquiry was first submitted. */
  created_at: string;
  /** Last update timestamp (any column or join). */
  updated_at: string;

  // ─── Section: Job identity ─────────────────────────────────────────────
  job: {
    /** Project title (intent.client.job_name) or fall back to brief excerpt. */
    title: string | null;
    /** Coarse-grained source label for the activity surface. */
    source_channel: string | null;
    /** Optional rich source context (jsonb). */
    source_context: Record<string, unknown>;
  };

  // ─── Section: Requester / Client ─────────────────────────────────────
  contact: {
    name: string | null;
    email: string | null;
    phone: string | null;
    company: string | null;
    /** Booking-for selector — myself / brand / venue / etc. */
    booking_for: string | null;
  };

  // ─── Section: Schedule ────────────────────────────────────────────────
  schedule: {
    event_date: string | null; // YYYY-MM-DD
    start_time: string | null;
    duration: string | null;
    date_status: string | null; // exact / flexible / not_sure / ...
  };

  // ─── Section: Location ────────────────────────────────────────────────
  location: {
    venue_name: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
    /** confirmed / unconfirmed / online / not_sure */
    status: string | null;
    notes: string | null;
    /** Google Place id when populated (Phase B-4 follow-up). */
    google_place_id: string | null;
    latitude: number | null;
    longitude: number | null;
  };

  // ─── Section: Coordinator ─────────────────────────────────────────────
  coordinator: {
    /** Whether one has been assigned yet. */
    assigned: boolean;
    user_id: string | null;
    name: string | null;
    /** Avatar URL (when profiles.avatar_url is set). */
    avatar_url: string | null;
    /** When the coordinator first picked this up. */
    assigned_at: string | null;
  };

  // ─── Section: Talent lineup ───────────────────────────────────────────
  talent: {
    /** Active or invited talent on the inquiry. Excludes removed/declined. */
    selected: Array<{
      participant_id: string;
      talent_profile_id: string | null;
      name: string;
      profile_code: string | null;
      photo_url: string | null;
      status: string; // invited / active / declined / replacement_sourcing / removed
    }>;
    /** How the client wanted talent picked (intent.talent.selection_mode). */
    selection_mode: string | null;
    /** Free-form notes about the talent ask. */
    notes: string | null;
    /** Number of talent needed when selection_mode='agency_recommends'. */
    count_needed: number | null;
  };

  // ─── Section: Budget ──────────────────────────────────────────────────
  budget: {
    preference: string | null;
    amount: number | null;
    currency: string | null;
    notes: string | null;
  };

  // ─── Section: Brief & logistics ───────────────────────────────────────
  brief: {
    summary: string | null;
    role_expectations: string[];
    wardrobe_notes: string | null;
    equipment_notes: string | null;
    travel_notes: string | null;
    media_usage: string | null;
    special_requirements: string | null;
  };

  // ─── Section: Files & links ───────────────────────────────────────────
  attachments: {
    files: Array<{ name: string; url: string; type?: string }>;
    links: string[];
  };

  // ─── Section: Offer summary (client-safe, NO private rates) ──────────
  offer: {
    /** Has any non-rejected offer been drafted/sent? */
    exists: boolean;
    id: string;
    status: string;
    /** Total the client would pay (line-item private rates intentionally hidden). */
    total_client_price: number;
    currency: string;
    /** Timestamp when the offer was sent to the client. */
    sent_at: string | null;
    /** Set on the offer row when it expires. */
    expires_at: string | null;
    /** Coordinator's note attached to the offer. */
    notes: string | null;
    /** Phase E — version stamps used by the engine's optimistic-locking. */
    offer_version: number;
    inquiry_version: number;
    /** Set when a client previously rejected an offer (history surface). */
    rejection_reason: string | null;
    rejection_reason_text: string | null;
    /** Line items — client-safe shape (label + units + total). NO talent_cost. */
    lines: Array<{
      id: string;
      label: string | null;
      pricing_unit: string;
      units: number;
      unit_price: number;
      total_price: number;
      talent_name: string | null;
    }>;
  } | null;

  // ─── Section: Recent activity (client-visible events only) ───────────
  activity: Array<{
    id: string;
    event_type: string;
    actor_name: string | null;
    actor_role: string | null;
    created_at: string;
  }>;
};

// ─── Client-visible activity event allow-list ───────────────────────────────
// Spec §13 — client should see real progress, not internal noise.
// Anything not in this list is filtered out.
const CLIENT_VISIBLE_EVENT_TYPES = new Set<string>([
  "INQUIRY_SUBMITTED",
  "INQUIRY_MOVED_TO_COORDINATION",
  "COORDINATOR_ASSIGNED",
  "COORDINATOR_ACCEPTED",
  "ROSTER_TALENT_INVITED",
  "ROSTER_TALENT_ACCEPTED",
  "ROSTER_TALENT_DECLINED",
  "OFFER_CREATED",
  "OFFER_SENT",
  "OFFER_CLIENT_REJECTED",
  "OFFER_CLIENT_ACCEPTED",
  "APPROVAL_SUBMITTED",
  "APPROVALS_COMPLETED",
  "INQUIRY_CONVERTED_TO_BOOKING",
  "BOOKING_CONFIRMED",
  "INQUIRY_FROZEN",
  "INQUIRY_UNFROZEN",
  "INQUIRY_ARCHIVED",
]);

// ─── Loader ─────────────────────────────────────────────────────────────────

export async function loadClientInquiryDetails(
  tenantId: string,
  inquiryId: string,
): Promise<ClientInquiryDetails | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;

    // Pull the inquiry row + interpreted_query (the rich InquiryIntent
    // payload) + source_context in one shot. RLS gates this to the
    // owning client.
    const { data: inq, error: inqErr } = await supabase
      .from("inquiries")
      .select(
        `
        id, tenant_id, status, version, created_at, updated_at,
        contact_name, contact_email, contact_phone, company,
        event_date, event_location, quantity, message,
        source_channel, source_context, interpreted_query,
        coordinator_id, coordinator_assigned_at,
        current_offer_id
      `,
      )
      .eq("id", inquiryId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (inqErr) {
      logServerError("client.inquiryDetails.inquiry", inqErr);
      return null;
    }
    if (!inq) return null;

    type Iq = {
      requester?: Record<string, unknown>;
      client?: { job_name?: string; booking_for?: string; same_as_requester?: boolean };
      location?: {
        venue_name?: string;
        address?: string;
        country?: string;
        google_place_id?: string;
        latitude?: number;
        longitude?: number;
        status?: string;
        notes?: string;
        city?: string;
      };
      date?: { start_time?: string; duration?: string; status?: string };
      talent?: { selection_mode?: string; notes?: string; count_needed?: number };
      budget?: { preference?: string; amount?: number; currency?: string; notes?: string };
      brief?: {
        summary?: string;
        role_expectations?: string[];
        wardrobe_notes?: string;
        equipment_notes?: string;
        travel_notes?: string;
        media_usage?: string;
        special_requirements?: string;
      };
      files?: Array<{ name: string; url: string; type?: string }>;
      links?: string[];
    };
    const iq = (inq.interpreted_query ?? {}) as Iq;

    // Parallel fan-out for the side data.
    const admin = createServiceRoleClient();
    const readClient = admin ?? supabase;
    const [participantsRes, offerRes, coordRes, eventsRes, attachmentsRes] = await Promise.all([
      // Talent lineup — visible-to-client subset
      readClient
        .from("inquiry_participants")
        .select(
          "id, talent_profile_id, role, status, talent_profiles!talent_profile_id (id, display_name, first_name, last_name, profile_code)",
        )
        .eq("inquiry_id", inquiryId)
        .eq("tenant_id", tenantId)
        .eq("role", "talent")
        .neq("status", "removed")
        .order("sort_order", { ascending: true }),
      // Current offer (if any) — client-safe fields only.
      // NOTE: explicitly NOT selecting talent_cost, coordinator_fee, or
      // internal split — those stay on the staff side.
      inq.current_offer_id
        ? readClient
            .from("inquiry_offers")
            .select(
              `id, status, version, total_client_price, currency_code,
               notes, valid_until, sent_at,
               rejection_reason, rejection_reason_text,
               inquiry_offer_line_items (
                 id, label, pricing_unit, units, unit_price, total_price,
                 sort_order,
                 talent_profiles!talent_profile_id ( display_name, first_name, last_name )
               )`,
            )
            .eq("id", inq.current_offer_id)
            .eq("tenant_id", tenantId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      // Coordinator profile
      inq.coordinator_id
        ? readClient
            .from("profiles")
            .select("id, display_name, avatar_url")
            .eq("id", inq.coordinator_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      // Recent activity
      readClient
        .from("inquiry_events")
        .select("id, event_type, actor_user_id, actor_role, created_at")
        .eq("inquiry_id", inquiryId)
        .order("created_at", { ascending: false })
        .limit(50),
      // Files uploaded after submission (coordinator-side or client-side
      // via the composer paperclip). Distinct from iq.files which only
      // carries the original submission attachments.
      readClient
        .from("inquiry_attachments")
        .select("id, filename, mime_type, storage_path, byte_size, created_at")
        .eq("inquiry_id", inquiryId)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true }),
    ]);

    // Filter activity to client-visible events. Resolve actor display names.
    type EventRow = {
      id: string;
      event_type: string;
      actor_user_id: string | null;
      actor_role: string | null;
      created_at: string;
    };
    const allEvents = (eventsRes.data ?? []) as EventRow[];
    const visibleEvents = allEvents
      .filter((e) => CLIENT_VISIBLE_EVENT_TYPES.has(e.event_type))
      .slice(0, 20);

    const actorIds = [
      ...new Set(visibleEvents.map((e) => e.actor_user_id).filter(Boolean) as string[]),
    ];
    const actorNameMap = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: actorProfiles } = await readClient
        .from("profiles")
        .select("id, display_name")
        .in("id", actorIds);
      for (const p of (actorProfiles ?? []) as { id: string; display_name: string | null }[]) {
        if (p.display_name) actorNameMap.set(p.id, p.display_name);
      }
    }

    // Resolve talent display + photo (lite — no signed URL fetch, leave for Phase D).
    type ParticipantRow = {
      id: string;
      talent_profile_id: string | null;
      role: string;
      status: string;
      talent_profiles: {
        id: string;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        profile_code: string | null;
      } | null;
    };
    const parts = (participantsRes.data ?? []) as unknown as ParticipantRow[];
    const talentLineup = parts.map((p) => {
      const tp = p.talent_profiles;
      const name =
        tp?.display_name?.trim()
        || `${tp?.first_name ?? ""} ${tp?.last_name ?? ""}`.trim()
        || "Unnamed talent";
      return {
        participant_id: p.id,
        talent_profile_id: p.talent_profile_id,
        name,
        profile_code: tp?.profile_code ?? null,
        photo_url: null, // Phase D will pipe through media
        status: p.status,
      };
    });

    type OfferLineRow = {
      id: string;
      label: string | null;
      pricing_unit: string;
      units: number;
      unit_price: number;
      total_price: number;
      sort_order: number | null;
      talent_profiles: {
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
      } | null;
    };
    type OfferRow = {
      id: string;
      status: string;
      version: number;
      total_client_price: number;
      currency_code: string;
      notes: string | null;
      valid_until: string | null;
      sent_at: string | null;
      rejection_reason: string | null;
      rejection_reason_text: string | null;
      inquiry_offer_line_items: OfferLineRow[] | null;
    };
    const offerRow = offerRes.data as OfferRow | null;
    const offer = offerRow
      ? {
          exists: true,
          id: offerRow.id,
          status: offerRow.status,
          total_client_price: Number(offerRow.total_client_price) || 0,
          currency: offerRow.currency_code,
          sent_at: offerRow.sent_at,
          expires_at: offerRow.valid_until,
          notes: offerRow.notes,
          offer_version: offerRow.version,
          inquiry_version: Number(inq.version),
          rejection_reason: offerRow.rejection_reason,
          rejection_reason_text: offerRow.rejection_reason_text,
          lines: (offerRow.inquiry_offer_line_items ?? [])
            .slice()
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            .map((ln) => ({
              id: ln.id,
              label: ln.label,
              pricing_unit: ln.pricing_unit,
              units: Number(ln.units) || 0,
              unit_price: Number(ln.unit_price) || 0,
              total_price: Number(ln.total_price) || 0,
              talent_name:
                ln.talent_profiles?.display_name?.trim()
                || `${ln.talent_profiles?.first_name ?? ""} ${ln.talent_profiles?.last_name ?? ""}`.trim()
                || null,
            })),
        }
      : null;

    const coord = coordRes.data as { id: string; display_name: string | null; avatar_url: string | null } | null;

    // Merge submission-time files (iq.files) with post-submission uploads
    // (inquiry_attachments). Generate 1-hour signed URLs for the storage
    // rows — bucket is private so we can't link to raw URLs.
    type AttachmentRow = {
      id: string;
      filename: string;
      mime_type: string | null;
      storage_path: string;
      byte_size: number | null;
      created_at: string;
    };
    const attachmentRows = (attachmentsRes.data ?? []) as AttachmentRow[];
    const signedFiles: Array<{ name: string; url: string; type?: string }> = [];
    if (attachmentRows.length > 0 && admin) {
      const paths = attachmentRows.map((a) => a.storage_path);
      const { data: signedList } = await admin.storage
        .from("inquiry-files")
        .createSignedUrls(paths, 60 * 60); // 1 hour
      if (signedList) {
        for (const row of attachmentRows) {
          const sig = signedList.find((s) => s.path === row.storage_path);
          if (sig?.signedUrl) {
            signedFiles.push({
              name: row.filename,
              url: sig.signedUrl,
              type: row.mime_type ?? undefined,
            });
          }
        }
      }
    }
    const submissionFiles = (iq.files ?? []) as Array<{ name: string; url: string; type?: string }>;
    const mergedAttachmentFiles = [...submissionFiles, ...signedFiles];

    return {
      id: inq.id as string,
      tenant_id: inq.tenant_id as string,
      status: inq.status as string,
      created_at: inq.created_at as string,
      updated_at: inq.updated_at as string,

      job: {
        title:
          iq.client?.job_name?.trim()
          || (inq.message as string | null)?.split("\n")[0]?.slice(0, 80)
          || null,
        source_channel: (inq.source_channel as string | null) ?? null,
        source_context: (inq.source_context ?? {}) as Record<string, unknown>,
      },

      contact: {
        name: (inq.contact_name as string | null) ?? null,
        email: (inq.contact_email as string | null) ?? null,
        phone: (inq.contact_phone as string | null) ?? null,
        company: (inq.company as string | null) ?? null,
        booking_for: iq.client?.booking_for ?? null,
      },

      schedule: {
        event_date: (inq.event_date as string | null) ?? null,
        start_time: iq.date?.start_time ?? null,
        duration: iq.date?.duration ?? null,
        date_status: iq.date?.status ?? null,
      },

      location: {
        venue_name: iq.location?.venue_name ?? null,
        address: iq.location?.address ?? null,
        city: iq.location?.city ?? (inq.event_location as string | null) ?? null,
        country: iq.location?.country ?? null,
        status: iq.location?.status ?? null,
        notes: iq.location?.notes ?? null,
        google_place_id: iq.location?.google_place_id ?? null,
        latitude: iq.location?.latitude ?? null,
        longitude: iq.location?.longitude ?? null,
      },

      coordinator: {
        assigned: !!coord,
        user_id: coord?.id ?? null,
        name: coord?.display_name ?? null,
        avatar_url: coord?.avatar_url ?? null,
        assigned_at: (inq.coordinator_assigned_at as string | null) ?? null,
      },

      talent: {
        selected: talentLineup,
        selection_mode: iq.talent?.selection_mode ?? null,
        notes: iq.talent?.notes ?? null,
        count_needed: iq.talent?.count_needed ?? (inq.quantity as number | null) ?? null,
      },

      budget: {
        preference: iq.budget?.preference ?? null,
        amount: iq.budget?.amount ?? null,
        currency: iq.budget?.currency ?? null,
        notes: iq.budget?.notes ?? null,
      },

      brief: {
        summary: iq.brief?.summary ?? (inq.message as string | null) ?? null,
        role_expectations: iq.brief?.role_expectations ?? [],
        wardrobe_notes: iq.brief?.wardrobe_notes ?? null,
        equipment_notes: iq.brief?.equipment_notes ?? null,
        travel_notes: iq.brief?.travel_notes ?? null,
        media_usage: iq.brief?.media_usage ?? null,
        special_requirements: iq.brief?.special_requirements ?? null,
      },

      attachments: {
        files: mergedAttachmentFiles,
        links: iq.links ?? [],
      },

      offer,

      activity: visibleEvents.map((e) => ({
        id: e.id,
        event_type: e.event_type,
        actor_name: e.actor_user_id ? (actorNameMap.get(e.actor_user_id) ?? null) : null,
        actor_role: e.actor_role,
        created_at: e.created_at,
      })),
    };
  } catch (err) {
    logServerError("client.inquiryDetails", err);
    return null;
  }
}
