"use server";

/**
 * guest-full-thread-actions.ts — U1 (Mini→Full Messages expansion).
 *
 * One server action, `getGuestFullThread`, that backs the guest-accessible
 * full-window conversation route at /c/[inquiryId]. It REUSES the existing
 * ownership-gated read (`getGuestThreadMessages` from ./guest-chat-actions) and
 * only THEN resolves the header brand — so a non-owner learns nothing about the
 * inquiry (the gate refuses before any brand read happens).
 *
 * ┌─ SECURITY ───────────────────────────────────────────────────────────────┐
 * │ The guest's identity is the `x-impronta-guest` cookie, resolved           │
 * │ server-side inside getGuestThreadMessages (NEVER a client argument). This  │
 * │ action adds NO new ownership path: it calls getGuestThreadMessages first,  │
 * │ and if that returns a failure we forward it verbatim. The follow-up brand  │
 * │ + owning-client read is service-role but tenant-SCOPED via                 │
 * │ tenantScopedQuery, and only runs once ownership has already been proven.   │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * Contract types are imported from the pure-types module
 * @/lib/inquiry/guest-chat-contract — this file ADDS none.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { logServerError } from "@/lib/server/safe-error";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { getGuestThreadMessages } from "./guest-chat-actions";
import type {
  GuestChatFailure,
  GuestFullThreadBrand,
  GuestThreadMessage,
  GuestThreadStatus,
  GetGuestFullThreadResult,
} from "@/lib/inquiry/guest-chat-contract";

function fail(code: GuestChatFailure["code"], message: string): GuestChatFailure {
  return { ok: false, code, message };
}

/**
 * Pull a logo URL out of agency_branding.theme_json the SAME way the talent page
 * does (it reads `brandingTheme.logo_url`). theme_json is opaque JSON; we narrow
 * defensively and return null on anything unexpected. House rule: a null logo is
 * fine — the view falls back to the accent circle, never a gray initials box.
 */
function logoUrlFromThemeJson(themeJson: unknown): string | null {
  if (!themeJson || typeof themeJson !== "object") return null;
  const candidate = (themeJson as Record<string, unknown>).logo_url;
  return typeof candidate === "string" && candidate.trim() ? candidate : null;
}

/**
 * Resolve the tenantSlug + clientUserId for a given inquiry using a
 * service-role read (no guest cookie required). Used by the /c/[inquiryId]
 * page to check whether the current signed-in user is the owning client —
 * BEFORE falling through to the guest cookie path. Returns null when the
 * inquiry cannot be found or the tenant is unavailable.
 *
 * SECURITY: this exposes no user data; it only returns the UUID of the
 * inquiry's client_user_id so the page can compare it to the session. No
 * message content or PII is returned.
 */
export async function resolveSignedInClientRedirect(inquiryId: string): Promise<{
  tenantSlug: string;
  clientUserId: string | null;
} | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  try {
    const { data: row, error } = await admin
      .from("inquiries")
      .select("tenant_id, client_user_id")
      .eq("id", inquiryId)
      .maybeSingle();
    if (error || !row) return null;
    const tenantId = row.tenant_id as string;
    const clientUserId = (row.client_user_id as string | null) ?? null;
    const { data: agencyRow } = await admin
      .from("agencies")
      .select("slug, status")
      .eq("id", tenantId)
      .maybeSingle();
    const agencyStatus = (agencyRow?.status as string | null) ?? null;
    if (!agencyRow || agencyStatus === "cancelled" || agencyStatus === "archived") return null;
    const tenantSlug = (agencyRow.slug as string | null)?.trim() || "";
    return { tenantSlug, clientUserId };
  } catch {
    return null;
  }
}

export async function getGuestFullThread(input: {
  inquiryId: string;
}): Promise<GetGuestFullThreadResult> {
  const inquiryId = input.inquiryId?.trim() ?? "";
  if (!inquiryId) {
    return fail("validation_failed", "Missing conversation.");
  }

  // ── 1. OWNERSHIP-GATED READ (reuse — do NOT re-implement the gate) ─────────
  // getGuestThreadMessages resolves the x-impronta-guest cookie, proves
  // inquiries.guest_session_id === session, and returns the guest-visible
  // messages + status + reply label. A non-owner gets a failure here and the
  // brand read below never runs — so they learn nothing about the inquiry.
  const thread = await getGuestThreadMessages({ inquiryId, afterIso: null });
  if (!thread.ok) {
    return thread;
  }

  // ── 2. Resolve the inquiry's tenant + owning client (service-role read) ────
  // Only reached AFTER ownership is proven. We need tenant_id to scope the brand
  // read and client_user_id so the PAGE can redirect a signed-in owning client
  // into the real client Messages shell.
  const admin = createServiceRoleClient();
  if (!admin) {
    return fail("db_unavailable", "Messaging is temporarily unavailable.");
  }

  const { data: inquiryRow, error: inquiryErr } = await admin
    .from("inquiries")
    .select("tenant_id, client_user_id")
    .eq("id", inquiryId)
    .maybeSingle();
  if (inquiryErr || !inquiryRow) {
    logServerError("guest-full-thread-actions.loadInquiry", inquiryErr);
    // Ownership already passed; a read miss here is a soft infra error, not a
    // 404 (the conversation exists — getGuestThreadMessages just read it).
    return fail("engine_error", "Could not load the conversation.");
  }
  const tenantId = inquiryRow.tenant_id as string;
  const clientUserId = (inquiryRow.client_user_id as string | null) ?? null;

  // ── 3. Brand resolve — agency + branding + (optional) talent, tenant-scoped ─
  // agencies(display_name, slug, status); agency_branding(primary→accent color,
  // theme_json→logo_url); inquiry_participants talent display_name. All reads go
  // through tenantScopedQuery so the service-role client can't drift cross-tenant.
  // tenantScopedQuery returns the native (loosely-typed) postgrest builders, so
  // .maybeSingle() yields `{}` — narrow each row through a local shape, mirroring
  // the `as unknown as RawMessageRow` casts in guest-chat-actions.ts.
  // `agencies` IS the tenant table (PK = id; it has NO tenant_id column), so it
  // is scoped by id directly — NOT via tenantScopedQuery, which would inject a
  // non-existent `tenant_id` filter, return null, and make EVERY /c page 404
  // (false "tenant_unavailable"). Mirrors resolveSignedInClientRedirect's read.
  const { data: agencyData } = await admin
    .from("agencies")
    .select("display_name, slug, status")
    .eq("id", tenantId)
    .maybeSingle();
  const agencyRow = agencyData as {
    display_name: string | null;
    slug: string | null;
    status: string | null;
  } | null;

  // A cancelled/archived tenant has no live brand surface — treat as gone.
  const agencyStatus = (agencyRow?.status as string | null) ?? null;
  if (!agencyRow || agencyStatus === "cancelled" || agencyStatus === "archived") {
    return fail("tenant_unavailable", "This workspace is no longer available.");
  }
  const agencyName = (agencyRow.display_name as string | null)?.trim() || "the team";
  const tenantSlug = (agencyRow.slug as string | null)?.trim() || "";

  const brandingQ = tenantScopedQuery(admin, "agency_branding", tenantId);
  const { data: brandingData } = await brandingQ
    .select("primary_color, accent_color, theme_json")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const brandingRow = brandingData as {
    primary_color: string | null;
    accent_color: string | null;
    theme_json: unknown;
  } | null;
  // Mirror the page: primary first, then accent. Null lets the view fall back to
  // its neutral DEFAULT_ACCENT token (never black/gold — house rule).
  const accentColor =
    (brandingRow?.primary_color as string | null) ??
    (brandingRow?.accent_color as string | null) ??
    null;
  const logoUrl = logoUrlFromThemeJson(brandingRow?.theme_json ?? null);

  // Talent display name (best-effort) — the first talent participant on the
  // inquiry. Null on an agency-level (talent-less) chat.
  const talentQ = tenantScopedQuery(admin, "inquiry_participants", tenantId);
  const { data: talentPartData } = await talentQ
    .select("talent_profile_id")
    .eq("inquiry_id", inquiryId)
    .eq("role", "talent")
    .not("talent_profile_id", "is", null)
    .limit(1)
    .maybeSingle();
  const talentPart = talentPartData as { talent_profile_id: string | null } | null;
  let talentDisplayName: string | null = null;
  const talentProfileId = (talentPart?.talent_profile_id as string | null) ?? null;
  if (talentProfileId) {
    const { data: talentRow } = await admin
      .from("talent_profiles")
      .select("display_name")
      .eq("id", talentProfileId)
      .maybeSingle();
    talentDisplayName = (talentRow?.display_name as string | null)?.trim() || null;
  }

  // Guest UI locale — guests carry no LOCALE_COOKIE, so resolve from the
  // tenant's default_locale (same source the email pipeline uses). Cached 60s
  // per tenant; falls back to the platform default when no row exists.
  const localeSettings = await loadTenantLocaleSettings(tenantId);

  return {
    ok: true,
    brand: { agencyName, talentDisplayName, accentColor, logoUrl },
    tenantSlug,
    clientUserId,
    messages: thread.messages,
    threadStatus: thread.threadStatus,
    typicalReplyLabel: thread.typicalReplyLabel,
    locale: localeSettings.defaultLocale,
  };
}
