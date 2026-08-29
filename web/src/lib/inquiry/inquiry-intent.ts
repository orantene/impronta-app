/**
 * InquiryIntent — the canonical client-side inquiry shape.
 *
 * Spec: web/docs/inquiry-engine-spec-2026-05-14.md §11
 *
 * Every entry point (client dashboard, Discover, saved talent,
 * shortlist, public talent profile, agency site, hub site, pitch,
 * admin manual, book-again) builds an InquiryIntent and hands it
 * to createInquiryFromIntent(). The engine then adapts it into the
 * existing submitInquiry() input shape and writes the row.
 *
 * Why a separate type:
 *   • Forms operate on the rich InquiryIntent shape (7 sections,
 *     each its own object, optional fields with defaults).
 *   • The submit engine takes a flat SubmitInquiryInput shape with
 *     legacy field names (contact_name, message, raw_ai_query, etc.).
 *   • intentToSubmitInquiryInput() is the adapter that maps between
 *     them. Adapter logic stays in one place so every caller stays
 *     consistent.
 */

import type { SubmitInquiryInput } from "./inquiry-engine-submit";

// ─────────────────────────────────────────────────────────────────────────────
// Source enum — mirrors the DB enum (web/src/lib/admin/validation.ts).
// ─────────────────────────────────────────────────────────────────────────────

/** Plan §7 sources — the 10 richer provenance values. */
export const INQUIRY_INTENT_SOURCES = [
  "direct_client_dashboard",
  "discover_single_talent",
  "discover_shortlist",
  "saved_talent",
  "public_talent_profile",
  "agency_site",
  "hub_site",
  "pitch",
  "admin_created",
  "book_again",
  "offering_request",
] as const;

export type InquirySource = (typeof INQUIRY_INTENT_SOURCES)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Section types — each maps to one of the 7 spec form sections.
// ─────────────────────────────────────────────────────────────────────────────

/** §3 — Client / Requester. */
export type InquiryRequester = {
  name?: string;
  email?: string;
  phone?: string;
  user_id?: string | null;
  photo_url?: string | null;
  trust_level?: "basic" | "verified" | "silver" | "gold";
  member_level?: string;
  preferred_contact?: "email" | "phone" | "whatsapp";
};

/** §4 — Client / Company / Job. */
export type InquiryClient = {
  /** Display name of the end client (may differ from requester). */
  name?: string;
  /** Company / brand name. */
  company?: string;
  /** User-facing project title ("Hyatt Summer Opening"). */
  job_name?: string;
  /** Who the booking is for. */
  booking_for?:
    | "myself"
    | "my_company"
    | "another_client"
    | "brand"
    | "venue"
    | "agency_client";
  /** Shortcut: copy requester info into client. */
  same_as_requester?: boolean;
};

/** §5 — Location. */
export type InquiryLocation = {
  status?: "confirmed" | "unconfirmed" | "online" | "not_sure";
  venue_name?: string;
  address?: string;
  city?: string;
  area?: string;
  country?: string;
  google_place_id?: string;
  google_maps_url?: string;
  latitude?: number;
  longitude?: number;
  notes?: string;
};

/** §6 — Date / Time. */
export type InquiryDate = {
  status?: "exact" | "flexible" | "not_sure" | "multi_day" | "recurring";
  event_date?: string; // YYYY-MM-DD
  start_time?: string; // HH:MM
  /** Free-form duration ("2-4 hours", "full day", "not sure yet"). */
  duration?: string;
  notes?: string;
};

/** §7 — Selected Talent. */
export type InquiryTalent = {
  selected_ids?: string[];
  shortlist_id?: string;
  /** Taxonomy term ids — what categories of talent the client wants. */
  types_needed?: string[];
  count_needed?: number;
  selection_mode?: "agency_recommends" | "i_know_who" | "similar_to_past";
  notes?: string;
};

/** §8 — Budget / Pricing Preference. */
export type InquiryBudget = {
  preference?:
    | "agency_recommends"
    | "total_budget"
    | "per_hour"
    | "per_day"
    | "per_week"
    | "per_contract"
    | "per_talent"
    | "not_sure";
  amount?: number;
  amount_min?: number;
  amount_max?: number;
  currency?: string; // ISO 4217
  rate_type?: string;
  notes?: string;
};

/** §9 — Event Logistics / Brief. */
export type InquiryBrief = {
  /** Main "tell us what you need" text. Required for submit. */
  summary?: string;
  /** Picked from preset list: greet_guests, pose_for_photos, etc. */
  role_expectations?: string[];
  wardrobe_notes?: string;
  equipment_notes?: string;
  travel_notes?: string;
  media_usage?: string;
  special_requirements?: string;
};

export type InquiryAttachment = {
  name: string;
  url: string;
  type?: string;
  size_bytes?: number;
};

/**
 * Full InquiryIntent — the rich form-side shape.
 *
 * Every field is optional except those flagged in §17 of the spec:
 *   - requester.name
 *   - requester.email OR requester.phone
 *   - brief.summary OR talent.selected_ids (at least one)
 *   - location.city OR location.status
 *   - date.event_date OR date.status
 */
export type InquiryIntent = {
  /** Provenance — which entry point built this intent. */
  source: InquirySource;
  /**
   * Rich provenance metadata that doesn't fit a flat column.
   * Examples per source:
   *   • discover_single_talent: { talent_profile_id, discovery_search }
   *   • discover_shortlist:     { shortlist_id, talent_profile_ids }
   *   • saved_talent:           { saved_talent_ids }
   *   • public_talent_profile:  { profile_code, referrer_url }
   *   • pitch:                  { pitch_token, pitch_id }
   *   • book_again:             { rebook_of_inquiry_id, original_booking_id }
   *   • admin_created:          { acting_staff_user_id }
   */
  source_context?: Record<string, unknown>;

  requester: InquiryRequester;
  client?: InquiryClient;
  location?: InquiryLocation;
  date?: InquiryDate;
  talent?: InquiryTalent;
  budget?: InquiryBudget;
  brief?: InquiryBrief;
  files?: InquiryAttachment[];
  links?: string[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Validation — spec §17.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Missing-info flag (spec §16). Computed at validate time. Surfaced
 * in the Details tab as a prompt — NOT a form error. Submit can still
 * succeed with flags present.
 */
export type MissingInfoFlag =
  | "exact_time_missing"
  | "venue_not_confirmed"
  | "budget_not_provided"
  | "talent_count_unknown"
  | "usage_rights_unclear"
  | "wardrobe_unclear"
  | "files_not_added"
  | "on_site_contact_missing";

export type IntentValidationResult =
  | { ok: true; missingInfoFlags: MissingInfoFlag[] }
  | { ok: false; missingFields: string[]; missingInfoFlags: MissingInfoFlag[] };

/**
 * Validates an InquiryIntent for submission.
 *
 * Hard requirements (§17 required):
 *   • requester.name
 *   • requester.email OR requester.phone
 *   • brief.summary OR talent.selected_ids.length > 0
 *   • location.city OR location.status
 *   • date.event_date OR date.status
 *
 * Soft "missing info" (§16) — does not block submit; surfaced as
 * Details-tab prompts post-submit.
 */
function parseReservationFromContext(sourceContext: unknown): boolean {
  if (!sourceContext || typeof sourceContext !== "object") return false;
  const raw = (sourceContext as { reservation?: unknown }).reservation;
  if (!raw || typeof raw !== "object") return false;
  const stamp = raw as { offering_id?: unknown; starts_at?: unknown; ends_at?: unknown };
  return (
    typeof stamp.offering_id === "string" &&
    stamp.offering_id.length > 0 &&
    typeof stamp.starts_at === "string" &&
    typeof stamp.ends_at === "string"
  );
}

export function validateIntentForSubmit(
  intent: InquiryIntent,
): IntentValidationResult {
  const missing: string[] = [];

  if (!intent.requester?.name?.trim()) missing.push("requester.name");
  if (!intent.requester?.email?.trim() && !intent.requester?.phone?.trim()) {
    missing.push("requester.email_or_phone");
  }

  const reservation = parseReservationFromContext(intent.source_context);
  if (!reservation) {
    const hasBrief = !!intent.brief?.summary?.trim();
    const hasTalent = (intent.talent?.selected_ids?.length ?? 0) > 0;
    if (!hasBrief && !hasTalent) {
      missing.push("brief.summary_or_talent");
    }

    const hasLocationCity = !!intent.location?.city?.trim();
    const hasLocationStatus = !!intent.location?.status;
    if (!hasLocationCity && !hasLocationStatus) {
      missing.push("location.city_or_status");
    }

    const hasDate = !!intent.date?.event_date?.trim();
    const hasDateStatus = !!intent.date?.status;
    if (!hasDate && !hasDateStatus) {
      missing.push("date.event_date_or_status");
    }
  }

  const flags = computeMissingInfoFlags(intent);

  if (missing.length > 0) {
    return { ok: false, missingFields: missing, missingInfoFlags: flags };
  }
  return { ok: true, missingInfoFlags: flags };
}

/** Spec §16 — soft prompts that show in Details, not as form errors. */
export function computeMissingInfoFlags(intent: InquiryIntent): MissingInfoFlag[] {
  const flags: MissingInfoFlag[] = [];
  if (!intent.date?.start_time?.trim()) flags.push("exact_time_missing");
  if (intent.location?.status === "unconfirmed") flags.push("venue_not_confirmed");
  if (!intent.budget?.preference || intent.budget.preference === "not_sure") {
    flags.push("budget_not_provided");
  }
  if (
    intent.talent?.selection_mode !== "agency_recommends"
    && !(intent.talent?.count_needed && intent.talent.count_needed > 0)
    && !(intent.talent?.selected_ids && intent.talent.selected_ids.length > 0)
  ) {
    flags.push("talent_count_unknown");
  }
  if (!intent.brief?.media_usage?.trim()) flags.push("usage_rights_unclear");
  if (!intent.brief?.wardrobe_notes?.trim()) flags.push("wardrobe_unclear");
  if (!intent.files?.length) flags.push("files_not_added");
  return flags;
}

// ─────────────────────────────────────────────────────────────────────────────
// Adapter — InquiryIntent → SubmitInquiryInput.
// ─────────────────────────────────────────────────────────────────────────────

export type IntentAdapterContext = {
  /** Agency this inquiry is for. */
  tenant_id: string;
  /** Auth.users.id of the actor (null for guest paths). */
  actor_user_id: string | null;
  /** Optional guest_session_id for unauthenticated paths. */
  guest_session_id?: string | null;
  /** Hostname where the form lives — captured from request headers. */
  origin_domain?: string | null;
  /** Workspace that hosts the storefront / hub — may differ from tenant. */
  source_workspace_id?: string | null;
  /** Trust level snapshot at submit time (basic/verified/silver/gold). */
  trust_level_at_submission?: string | null;
  /**
   * For pitch / admin / book-again paths, the engine needs to know
   * which client the inquiry belongs to. For direct client paths this
   * equals actor_user_id.
   */
  client_user_id?: string | null;
};

/**
 * Maps the rich InquiryIntent shape onto the existing
 * SubmitInquiryInput shape. Centralized here so callers never assemble
 * the legacy fields by hand — every entry point produces an intent and
 * the adapter does the rest.
 */
export function intentToSubmitInquiryInput(
  intent: InquiryIntent,
  ctx: IntentAdapterContext,
): SubmitInquiryInput {
  const contact_name = intent.requester.name?.trim() ?? "";
  const contact_email = intent.requester.email?.trim() ?? "";
  const contact_phone = intent.requester.phone?.trim() || null;
  const company = intent.client?.company?.trim() || null;
  const event_date = intent.date?.event_date?.trim() || null;
  const event_location = formatEventLocation(intent.location);
  const quantity = intent.talent?.count_needed ?? null;
  const message = intent.brief?.summary?.trim() || null;

  // Pack the rich intent into the legacy raw_ai_query + interpreted_query
  // fields so the engine path stays untouched. raw_ai_query gets the
  // human-readable summary; interpreted_query carries the structured
  // intent for downstream consumers (Details tab, search, AI re-prompt).
  const interpreted_query = buildInterpretedQuery(intent);
  const raw_ai_query = intent.brief?.summary?.trim() || null;

  // initiator_role = direction of initiation. Plan §7 mapping:
  //   admin_created / pitch → admin (agency acted on behalf of recipient)
  //   everything else       → client
  //
  // Intentionally "client" for unauthenticated guests too — this is NOT a bug.
  // Guest-vs-authenticated is a separate axis carried by actorUserId /
  // guest_session_id (surfaced as is_guest in analytics + engine events).
  // The DB CHECK on inquiries.initiator_role forbids 'guest', and this matches
  // migration 20260514022934's documented backfill ("ELSE → initiator_role=
  // 'client'; conservative; matches legacy guest path"). Do not change to "guest".
  const initiator_role: SubmitInquiryInput["initiator_role"] =
    intent.source === "admin_created"
      ? "admin"
      : intent.source === "pitch"
        ? "admin"
        : "client";

  // talent_profile_ids — the canonical list comes from intent.talent.
  // For shortlist sources the IDs typically come pre-resolved from the
  // shortlist; the caller is responsible for resolving shortlist_id →
  // talent_ids before calling the adapter (cheaper than a join in here).
  const talent_profile_ids = intent.talent?.selected_ids ?? [];
  const source_context =
    talent_profile_ids.length > 0
      ? { ...(intent.source_context ?? {}), talent_ids: talent_profile_ids }
      : intent.source_context ?? null;

  return {
    tenant_id: ctx.tenant_id,
    contact_name,
    contact_email,
    contact_phone,
    company,
    event_date,
    event_location,
    quantity,
    message,
    event_type_id: null, // §6 — type lives in interpreted_query for now
    raw_ai_query,
    interpreted_query,
    source_page: sourceToPagePath(intent),
    source_channel: intent.source,
    source_context,
    origin_domain: ctx.origin_domain ?? null,
    source_workspace_id: ctx.source_workspace_id ?? null,
    trust_level_at_submission:
      ctx.trust_level_at_submission ?? intent.requester.trust_level ?? null,
    client_user_id: ctx.client_user_id ?? ctx.actor_user_id ?? null,
    talent_profile_ids,
    actorUserId: ctx.actor_user_id,
    guest_session_id: ctx.guest_session_id ?? null,
    initiator_role,
    initiator_user_id: ctx.actor_user_id ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatEventLocation(loc: InquiryLocation | undefined): string | null {
  if (!loc) return null;
  // Prefer venue + city if both present; fall back to whichever exists.
  const parts = [loc.venue_name, loc.address, loc.city, loc.area].filter(
    (s): s is string => !!s?.trim(),
  );
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

function sourceToPagePath(intent: InquiryIntent): string | null {
  // Source-context.referrer_page wins if present; otherwise derive a
  // canonical path from the source enum.
  const ref = intent.source_context?.["referrer_page"];
  if (typeof ref === "string" && ref.trim()) return ref;
  switch (intent.source) {
    case "direct_client_dashboard":
      return "/client";
    case "discover_single_talent":
    case "discover_shortlist":
      return "/client/discover";
    case "saved_talent":
      return "/client/shortlists";
    case "public_talent_profile":
      return "/t";
    case "agency_site":
      return "/directory";
    case "hub_site":
      return "/hub";
    case "pitch":
      return "/share/pitch";
    case "admin_created":
      return "admin-workspace-new-inquiry";
    case "book_again":
      return "/client/bookings";
    case "offering_request":
      return "/book";
    default:
      return null;
  }
}

function buildInterpretedQuery(intent: InquiryIntent): Record<string, unknown> {
  // Carries the structured intent for downstream consumers (AI re-prompt,
  // Details tab, search, missing-info flags). Free-shape JSON.
  return {
    schema_version: 1,
    requester: intent.requester,
    client: intent.client ?? {},
    location: intent.location ?? {},
    date: intent.date ?? {},
    talent: intent.talent ?? {},
    budget: intent.budget ?? {},
    brief: intent.brief ?? {},
    files: intent.files ?? [],
    links: intent.links ?? [],
    source: intent.source,
    source_context: intent.source_context ?? {},
  };
}
