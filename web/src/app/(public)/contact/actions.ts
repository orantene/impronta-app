"use server";

/**
 * Contact-page inquiry action.
 *
 * This is the REAL inquiry entry point behind the public /contact page (the
 * homepage hero "Start an inquiry" CTA + the Contact nav both land here). It
 * reuses the SAME canonical guest path the public directory uses
 * (`submitGuestInquiry` → `submitInquiry` engine) — no new inquiry primitive.
 *
 * The only difference vs. the directory guest submit is that a contact-page
 * inquiry carries NO talent ("I have a general question / brief for the
 * agency"). `submitInquiry` already supports `talent_profile_ids: []`: it seats
 * the agency coordinator-of-record, creates the default requirement group, and
 * records the inquiry as a `mode: "category"` (agency-recommends) request. So
 * this stays inside the binding rule that all inquiry creation flows through
 * `submitInquiry`.
 *
 * Guest-safe by construction:
 *   • `actorUserId: null` → the engine skips the user permission check (public
 *     storefront path) and rate-limits off `guest_session_id` instead.
 *   • The `x-impronta-guest` header + `impronta_guest` cookie are injected by
 *     middleware on every request, so an unauthenticated visitor always has a
 *     session key. We `ensure_guest_session` (idempotent, SECURITY DEFINER) so
 *     even a first-time visitor who lands straight on /contact gets a row.
 *   • Tenant is resolved from the middleware-injected active-tenant header via
 *     `getPublicTenantScope()` — same as the directory form.
 */

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { buildInquiryContext } from "@/lib/inquiries";
import { ensureGuestClientByEmail } from "@/lib/inquiry/guest-client";
import { getPublicSettings } from "@/lib/public-settings";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { createTranslator } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import { logAnalyticsEventServer } from "@/lib/analytics/server-log";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";
import { submitInquiry } from "@/lib/inquiry/inquiry-engine";
import { getPublicTenantScope, getPublicHostContext } from "@/lib/saas/scope";

const GUEST_HEADER = "x-impronta-guest";

export type ContactInquiryState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success"; email: string | null };

export async function submitContactInquiry(
  _prev: ContactInquiryState,
  formData: FormData,
): Promise<ContactInquiryState> {
  const t = createTranslator(await getRequestLocale());

  const publicSettings = await getPublicSettings();
  if (!publicSettings.inquiriesOpen) {
    return { status: "error", error: t("public.forms.inquiry.inquiriesClosed") };
  }

  const pub = createPublicSupabaseClient();
  const admin = createServiceRoleClient();
  if (!admin || !pub) {
    return { status: "error", error: t("public.forms.inquiry.supabaseNotConfigured") };
  }

  const guestKey = (await headers()).get(GUEST_HEADER);
  if (!guestKey) {
    return { status: "error", error: t("public.forms.inquiry.sessionUnavailable") };
  }

  // Universal-connector honeypot — same shape the directory form uses. Bots
  // fill every input; a populated hidden `website` field means a bot. Pretend
  // success (return a success state) so the automation doesn't learn to retry.
  const honeypot = String(formData.get("website") ?? "").trim();
  if (honeypot) {
    logServerError(
      "contact/submitContactInquiry/honeypot",
      new Error(`Honeypot tripped: ${honeypot.slice(0, 40)}`),
    );
    return { status: "success", email: null };
  }

  const contact_name = String(formData.get("contact_name") ?? "").trim();
  const contact_email = String(formData.get("contact_email") ?? "").trim();
  const contact_phone = String(formData.get("contact_phone") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!contact_name || !contact_email) {
    return { status: "error", error: t("public.forms.inquiry.nameAndEmailRequired") };
  }
  if (!message) {
    return { status: "error", error: t("public.contact.form.errorMessageRequired") };
  }

  // Tenant resolved from the middleware-injected active-tenant header. Hub /
  // marketing / app hosts return null (they don't expose this form).
  const publicScope = await getPublicTenantScope();
  if (!publicScope) {
    return { status: "error", error: t("public.forms.inquiry.sessionUnavailable") };
  }

  // Idempotently ensure the guest_sessions row exists for first-time visitors
  // who land straight on /contact (the directory pre-creates it via save/visit).
  await admin.rpc("ensure_guest_session", { p_session_key: guestKey });
  const { data: guestSession, error: guestErr } = await admin
    .from("guest_sessions")
    .select("id")
    .eq("session_key", guestKey)
    .maybeSingle();

  if (guestErr || !guestSession?.id) {
    logServerError("contact/submitContactInquiry/guestSession", guestErr);
    return { status: "error", error: t("public.errors.inquiry") };
  }

  const interpreted_query = buildInquiryContext({
    rawQuery: message,
    selectedTalents: [],
    sourcePage: "/contact",
    submittedVia: "guest",
  });

  // F3 — origin hostname + source workspace for attribution.
  const hostCtx = await getPublicHostContext();
  const originDomain = hostCtx.hostname ?? null;
  const sourceWorkspaceId =
    hostCtx.kind === "agency" || hostCtx.kind === "hub" ? hostCtx.tenantId : null;

  const guestClient = await ensureGuestClientByEmail({
    email: contact_email,
    name: contact_name,
    company: "",
    phone: contact_phone,
  });

  // Canonical guest inquiry submit — identical engine call to the directory
  // guest path, but with zero talent (a general/agency inquiry). The engine
  // seats the agency coordinator-of-record and creates the default requirement
  // group. `actorUserId: null` is the public guest branch.
  const submission = await submitInquiry(admin, {
    tenant_id: publicScope.tenantId,
    contact_name,
    contact_email: contact_email.toLowerCase(),
    contact_phone: contact_phone || null,
    company: null,
    event_date: null,
    event_location: null,
    quantity: null,
    message: message || null,
    event_type_id: null,
    raw_ai_query: message || null,
    interpreted_query,
    source_page: "/contact",
    source_channel: "contact_guest",
    origin_domain: originDomain,
    source_workspace_id: sourceWorkspaceId,
    trust_level_at_submission: "basic",
    client_user_id: guestClient.clientUserId,
    talent_profile_ids: [],
    actorUserId: null, // guest path
    guest_session_id: guestSession.id,
    initiator_role: "client",
    initiator_user_id: guestClient.clientUserId,
  });

  if (!submission.success || !submission.data?.inquiryId) {
    logServerError("contact/submitContactInquiry/v2", new Error(JSON.stringify(submission)));
    return { status: "error", error: t("public.errors.inquiry") };
  }

  const locale = await getRequestLocale();
  await logAnalyticsEventServer({
    name: PRODUCT_ANALYTICS_EVENTS.submit_inquiry,
    payload: {
      locale,
      inquiry_type: "contact_guest",
      source_page: "/contact",
    },
    path: "/contact",
    locale,
  });

  revalidatePath("/contact");
  return { status: "success", email: contact_email.toLowerCase() };
}
