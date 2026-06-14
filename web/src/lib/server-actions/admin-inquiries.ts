"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  bookingStatusSchema,
  clientAccountTypeSchema,
  inquirySourceChannelSchema,
  inquiryStatusSchema,
  parseWithSchema,
  trimmedString,
  booleanFromEquals,
} from "@/lib/admin/validation";
import { BOOKING_AUDIT, INQUIRY_AUDIT } from "@/lib/commercial-audit-events";
import { logBookingActivity, logInquiryActivity } from "@/lib/server/commercial-audit";
import { resolveClientAccountContactForSave } from "@/lib/server/client-account-contact-validation";
import { CLIENT_ERROR, isPostgrestMissingColumnError, logServerError } from "@/lib/server/safe-error";
import { pgUuidSchema } from "@/lib/site-admin/validators";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { sendMessage as engineSendMessage } from "@/lib/inquiry/inquiry-engine-messages";
import { submitInquiry } from "@/lib/inquiry/inquiry-engine";
import { createInquiryFromIntent } from "@/lib/inquiry/inquiry-intent-engine";
import { emitFieldChange } from "@/lib/inquiry/audit-field-emit";

// Type-only import + re-export. Combined into one statement so Turbopack
// doesn't emit a runtime reference for `AdminActionState` (it was throwing
// `ReferenceError: AdminActionState is not defined` at module evaluation
// when the prior `import type ... ; export type { ... }` pair was used).
//
// A.4 INTENTIONAL DIVERGENCE: align with canonical `ServerActionResult<T>`. `AdminActionState`
// is a `useFormState` shape consumed by 15+ admin functions and 10+ form
// components; conversion requires re-binding every form action + narrowing
// site. Out of scope for the initial sweep.
export type { AdminActionState } from "@/lib/admin/admin-action-state";
import type { AdminActionState } from "@/lib/admin/admin-action-state";

const updateInquirySchema = z.object({
  inquiry_id: z.string().min(1, "Missing inquiry."),
  status: z.string().min(1, "Workflow status is required."),
  assigned_staff_id: z.string(),
  staff_notes: z.string(),
  client_account_id: z.string(),
  client_contact_id: z.string(),
  source_channel: inquirySourceChannelSchema,
  closed_reason: z.string(),
});

// Phase 3 (master plan / deep QA fix) — agency-side inquiry creation.
// The "+ New inquiry" admin drawer was previously a client-side mock store
// push; nothing ever reached the inquiries table. This is the canonical
// server action behind the drawer's submit handler.
const createAgencyInquirySchema = z.object({
  contact_name: z.string().min(1, "Client name is required."),
  contact_email: z.string().email("Enter a valid client email."),
  contact_phone: z.string().optional().default(""),
  company: z.string().optional().default(""),
  event_date: z.string().optional().default(""),
  event_location: z.string().optional().default(""),
  message: z.string().optional().default(""),
  source_channel: inquirySourceChannelSchema.optional(),
  // Optional: comma-separated talent_profile_ids to attach via inquiry_talent.
  talent_profile_ids: z.string().optional().default(""),
});

export type CreateAgencyInquiryResult =
  | { ok: true; inquiry_id: string }
  | { ok: false; error: string };

export async function createAgencyInquiry(
  input: Record<string, string | undefined>,
): Promise<CreateAgencyInquiryResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, user } = auth;

  const parsed = createAgencyInquirySchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? "Invalid inquiry data." };
  }
  const v = parsed.data;

  // event_date: empty → null. ISO YYYY-MM-DD or human dates handled
  // upstream; for now require a parseable string or pass null.
  const eventDate = v.event_date.trim() ? v.event_date.trim() : null;

  // Universal-connector P0 (2026-05-13) — admin manual creation now
  // flows through the same submitInquiry engine. Previously this was
  // a direct INSERT that bypassed the rate limiter, event emit, and
  // requirement-group creation. The admin is creating ON BEHALF of a
  // client whose identity is name+email — that client may or may not
  // have an existing auth row; client_user_id stays null and the
  // merge layer links them later by email/phone on signup.
  const inquirySubmission = await submitInquiry(supabase, {
    tenant_id: tenantId,
    contact_name: v.contact_name.trim(),
    contact_email: v.contact_email.trim().toLowerCase(),
    contact_phone: v.contact_phone.trim() || null,
    company: v.company.trim() || null,
    event_date: eventDate,
    event_location: v.event_location.trim() || null,
    message: v.message.trim() || null,
    // QA 2026-06-13: 'admin_manual' is NOT a member of the inquiry_source_channel
    // enum (valid: admin_created/admin/…) — it raised a 22P02 enum cast on every
    // insert, silently breaking the admin in-shell New-inquiry composer. Use the
    // valid 'admin_created' (same value createManualInquiry uses).
    source_channel: "admin_created",
    source_page: "admin-workspace-new-inquiry",
    client_user_id: null,
    talent_profile_ids: [],
    actorUserId: user.id,
    initiator_role: "admin",
    initiator_user_id: user.id,
  });

  if (!inquirySubmission.success || !inquirySubmission.data?.inquiryId) {
    logServerError("admin-inquiries.createAgencyInquiry.engine", new Error(JSON.stringify(inquirySubmission)));
    return { ok: false, error: CLIENT_ERROR.update };
  }
  const inquiryId = inquirySubmission.data.inquiryId;

  // Stamp assigned_staff_id post-insert. The engine doesn't set this
  // because it uses auto-coordinator-assignment from settings; admin
  // manual creation explicitly assigns the creating staff member.
  const { error: stampErr } = await supabase
    .from("inquiries")
    .update({ assigned_staff_id: user.id })
    .eq("id", inquiryId)
    .eq("tenant_id", tenantId);
  if (stampErr) logServerError("admin-inquiries.createAgencyInquiry.assignStamp", stampErr);

  // Best-effort audit log entry. Wrapped to never throw into render path.
  try {
    await logInquiryActivity(supabase, {
      inquiryId,
      actorUserId: user.id,
      eventType: INQUIRY_AUDIT.CREATED_MANUAL,
      payload: { source: "admin_workspace", contact_email: v.contact_email },
    });
  } catch (err) {
    logServerError("admin-inquiries.createAgencyInquiry.audit", err);
  }

  // Refresh the workspace so Messages + Calendar pick up the new inquiry.
  revalidatePath(`/${auth.tenantSlug}`, "layout");

  return { ok: true, inquiry_id: inquiryId };
}

const updateInquiryClientInfoSchema = z.object({
  inquiry_id: z.string().min(1, "Missing inquiry."),
  contact_name: z.string().min(1, "Client name is required."),
  contact_email: z.string().email("Enter a valid email."),
  contact_phone: z.string(),
  company: z.string(),
  client_user_id: z.string(),
});

const updateInquiryLocationSchema = z.object({
  inquiry_id: z.string().min(1, "Missing inquiry."),
  client_account_id: z.string(),
  client_contact_id: z.string(),
});

const updateInquiryRequestDetailsSchema = z.object({
  inquiry_id: z.string().min(1, "Missing inquiry."),
  raw_ai_query: z.string(),
  message: z.string(),
  event_location: z.string(),
  source_channel: inquirySourceChannelSchema,
  staff_notes: z.string(),
});

const createBookingSchema = z.object({
  inquiry_id: z.string().min(1, "Missing inquiry."),
  talent_profile_id: z.string(),
  title: z.string(),
  booking_status: bookingStatusSchema,
  starts_at: z.string(),
  ends_at: z.string(),
  notes: z.string(),
});

const createClientAccountSchema = z.object({
  name: z.string().min(1, "Location name is required."),
  account_type: clientAccountTypeSchema,
  account_type_detail: z.string(),
  primary_email: z.string(),
  primary_phone: z.string(),
  website_url: z.string(),
  location_text: z.string(),
  city: z.string(),
  country: z.string(),
  address_notes: z.string(),
  google_place_id: z.string(),
  latitude: z.string(),
  longitude: z.string(),
});

function optionalCoord(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const createClientContactSchema = z.object({
  client_account_id: z.string().min(1, "Account is required."),
  full_name: z.string().min(1, "Name is required."),
  email: z.string(),
  phone: z.string(),
  whatsapp_phone: z.string(),
  job_title: z.string(),
  notes: z.string(),
});

const assignInquirySchema = z.object({
  inquiry_id: z.string().min(1, "Missing inquiry."),
});

export async function updateInquiry(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user, tenantId } = auth;

  const channelRaw = trimmedString(formData, "source_channel");
  const channelParsed = parseWithSchema(inquirySourceChannelSchema, channelRaw);
  if ("error" in channelParsed) return { error: channelParsed.error };

  const parsed = parseWithSchema(updateInquirySchema, {
    inquiry_id: trimmedString(formData, "inquiry_id"),
    status: trimmedString(formData, "status"),
    assigned_staff_id: trimmedString(formData, "assigned_staff_id"),
    staff_notes: trimmedString(formData, "staff_notes"),
    client_account_id: trimmedString(formData, "client_account_id"),
    client_contact_id: trimmedString(formData, "client_contact_id"),
    source_channel: channelParsed.data,
    closed_reason: trimmedString(formData, "closed_reason"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const {
    inquiry_id: id,
    status,
    assigned_staff_id,
    staff_notes,
    client_account_id: accountIdStr,
    client_contact_id: contactIdStr,
    source_channel,
    closed_reason,
  } = parsed.data;

  let client_account_id = accountIdStr || null;
  let client_contact_id = contactIdStr || null;

  const { data: priorInq, error: priorInqErr } = await supabase
    .from("inquiries")
    .select("client_account_id, client_contact_id, status, assigned_staff_id, staff_notes, source_channel, closed_reason")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (priorInqErr || !priorInq) {
    logServerError("admin/updateInquiry/loadPrior", priorInqErr);
    return { error: CLIENT_ERROR.loadPage };
  }

  const inqResolved = await resolveClientAccountContactForSave(supabase, client_account_id, client_contact_id);
  if (!inqResolved.ok) return { error: inqResolved.error };
  client_account_id = inqResolved.accountId;
  client_contact_id = inqResolved.contactId;

  const patch: Record<string, unknown> = {
    status: status as never,
    assigned_staff_id: assigned_staff_id || null,
    staff_notes: staff_notes || null,
    client_account_id,
    client_contact_id,
    source_channel: source_channel as never,
    closed_reason: closed_reason || null,
    updated_at: new Date().toISOString(),
  };

  if (booleanFromEquals(formData, "refresh_account_snapshot") && client_account_id) {
    const { data: acc } = await supabase
      .from("client_accounts")
      .select("name")
      .eq("id", client_account_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (acc?.name) patch.company = acc.name;
  }

  if (booleanFromEquals(formData, "refresh_contact_snapshot") && client_contact_id) {
    const { data: c } = await supabase
      .from("client_account_contacts")
      .select("full_name, email, phone")
      .eq("id", client_contact_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (c?.full_name) patch.contact_name = c.full_name;
    if (c?.email && String(c.email).trim()) patch.contact_email = c.email;
    if (c?.phone != null) patch.contact_phone = c.phone;
  }

  const { error } = await supabase
    .from("inquiries")
    .update(patch as never)
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    logServerError("admin/updateInquiry", error);
    return { error: CLIENT_ERROR.update };
  }

  const actor = user.id;
  const refreshAccSnap = booleanFromEquals(formData, "refresh_account_snapshot");
  const refreshConSnap = booleanFromEquals(formData, "refresh_contact_snapshot");
  if (priorInq.client_account_id !== client_account_id) {
    await logInquiryActivity(supabase, {
      inquiryId: id,
      actorUserId: actor,
      eventType: INQUIRY_AUDIT.CLIENT_ACCOUNT_CHANGED,
      payload: {
        from: priorInq.client_account_id,
        to: client_account_id,
        refresh_account_snapshot: refreshAccSnap,
      },
    });
  }
  if (priorInq.client_contact_id !== client_contact_id) {
    await logInquiryActivity(supabase, {
      inquiryId: id,
      actorUserId: actor,
      eventType: INQUIRY_AUDIT.CLIENT_CONTACT_CHANGED,
      payload: {
        from: priorInq.client_contact_id,
        to: client_contact_id,
        refresh_contact_snapshot: refreshConSnap,
      },
    });
  }

  // Details v3 §4.3 — field-level audit emit (additive to inquiry_events).
  const inqPairs: Array<{
    key: string;
    group: string;
    visibility: "client_visible" | "talent_visible" | "coord_visible" | "admin_only";
    before: unknown;
    after: unknown;
  }> = [
    { key: "status",            group: "lifecycle",  visibility: "client_visible", before: priorInq.status,            after: status },
    { key: "assigned_staff_id", group: "assignment", visibility: "coord_visible",  before: priorInq.assigned_staff_id, after: assigned_staff_id || null },
    { key: "staff_notes",       group: "internal",   visibility: "admin_only",     before: priorInq.staff_notes,       after: staff_notes || null },
    { key: "source_channel",    group: "source",     visibility: "admin_only",     before: priorInq.source_channel,    after: source_channel },
    { key: "closed_reason",     group: "lifecycle",  visibility: "coord_visible",  before: priorInq.closed_reason,     after: closed_reason || null },
    { key: "client_account_id", group: "client",     visibility: "admin_only",     before: priorInq.client_account_id, after: client_account_id },
    { key: "client_contact_id", group: "client",     visibility: "admin_only",     before: priorInq.client_contact_id, after: client_contact_id },
  ];
  for (const p of inqPairs) {
    if (p.before === p.after) continue;
    await emitFieldChange(supabase, {
      inquiryId: id,
      fieldGroup: p.group,
      fieldKey: p.key,
      oldValue: p.before,
      newValue: p.after,
      visibility: p.visibility,
      actorRole: "admin",
    }).then((r) => { if (!r.ok) logServerError("admin/updateInquiry/fieldEmit", r.error); });
  }

  revalidatePath("/admin/inquiries");
  revalidatePath(`/admin/inquiries/${id}`);
  return undefined;
}

export async function updateInquiryClientInfo(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = parseWithSchema(updateInquiryClientInfoSchema, {
    inquiry_id: trimmedString(formData, "inquiry_id"),
    contact_name: trimmedString(formData, "contact_name"),
    contact_email: trimmedString(formData, "contact_email"),
    contact_phone: trimmedString(formData, "contact_phone"),
    company: trimmedString(formData, "company"),
    client_user_id: trimmedString(formData, "client_user_id"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const { inquiry_id, contact_name, contact_email, contact_phone, company, client_user_id: userIdRaw } = parsed.data;
  const client_user_id = userIdRaw || null;

  if (client_user_id) {
    const { data: prof, error: pErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", client_user_id)
      .eq("app_role", "client")
      .maybeSingle();
    if (pErr || !prof) {
      return { error: "That linked client is not a valid client user." };
    }
  }

  // Snapshot prior column values for Details v3 §4.3 field-level audit emit.
  const { data: priorCI } = await supabase
    .from("inquiries")
    .select("contact_name, contact_email, contact_phone, company, client_user_id")
    .eq("id", inquiry_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const { error } = await supabase
    .from("inquiries")
    .update({
      contact_name,
      contact_email,
      contact_phone: contact_phone || null,
      company: company || null,
      client_user_id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", inquiry_id)
    .eq("tenant_id", tenantId);

  if (error) {
    logServerError("admin/updateInquiryClientInfo", error);
    return { error: CLIENT_ERROR.update };
  }

  if (priorCI) {
    const ciPairs: Array<{
      key: string;
      group: string;
      visibility: "client_visible" | "talent_visible" | "coord_visible" | "admin_only";
      before: unknown;
      after: unknown;
    }> = [
      { key: "contact_name",  group: "client", visibility: "client_visible", before: priorCI.contact_name,  after: contact_name },
      { key: "contact_email", group: "client", visibility: "client_visible", before: priorCI.contact_email, after: contact_email },
      { key: "contact_phone", group: "client", visibility: "client_visible", before: priorCI.contact_phone, after: contact_phone || null },
      { key: "company",       group: "client", visibility: "client_visible", before: priorCI.company,       after: company || null },
      { key: "client_user_id", group: "client", visibility: "admin_only",    before: priorCI.client_user_id, after: client_user_id },
    ];
    for (const p of ciPairs) {
      if (p.before === p.after) continue;
      await emitFieldChange(supabase, {
        inquiryId: inquiry_id,
        fieldGroup: p.group,
        fieldKey: p.key,
        oldValue: p.before,
        newValue: p.after,
        visibility: p.visibility,
        actorRole: "admin",
      }).then((r) => { if (!r.ok) logServerError("admin/updateInquiryClientInfo/fieldEmit", r.error); });
    }
  }

  revalidatePath("/admin/inquiries");
  revalidatePath(`/admin/inquiries/${inquiry_id}`);
  return undefined;
}

export async function updateInquiryLocation(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user, tenantId } = auth;

  const parsed = parseWithSchema(updateInquiryLocationSchema, {
    inquiry_id: trimmedString(formData, "inquiry_id"),
    client_account_id: trimmedString(formData, "client_account_id"),
    client_contact_id: trimmedString(formData, "client_contact_id"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const { inquiry_id, client_account_id: accountRaw, client_contact_id: contactRaw } = parsed.data;

  const { data: prior, error: priorErr } = await supabase
    .from("inquiries")
    .select("client_account_id, client_contact_id")
    .eq("id", inquiry_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (priorErr || !prior) {
    logServerError("admin/updateInquiryLocation/loadPrior", priorErr);
    return { error: CLIENT_ERROR.loadPage };
  }

  const resolved = await resolveClientAccountContactForSave(supabase, accountRaw || null, contactRaw || null);
  if (!resolved.ok) return { error: resolved.error };

  const { error } = await supabase
    .from("inquiries")
    .update({
      client_account_id: resolved.accountId,
      client_contact_id: resolved.contactId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", inquiry_id)
    .eq("tenant_id", tenantId);

  if (error) {
    logServerError("admin/updateInquiryLocation", error);
    return { error: CLIENT_ERROR.update };
  }

  const actor = user.id;
  if (prior.client_account_id !== resolved.accountId) {
    await logInquiryActivity(supabase, {
      inquiryId: inquiry_id,
      actorUserId: actor,
      eventType: INQUIRY_AUDIT.CLIENT_ACCOUNT_CHANGED,
      payload: { from: prior.client_account_id, to: resolved.accountId, via: "primary_card" },
    });
  }
  if (prior.client_contact_id !== resolved.contactId) {
    await logInquiryActivity(supabase, {
      inquiryId: inquiry_id,
      actorUserId: actor,
      eventType: INQUIRY_AUDIT.CLIENT_CONTACT_CHANGED,
      payload: { from: prior.client_contact_id, to: resolved.contactId, via: "primary_card" },
    });
  }

  // Details v3 §4.3 — field-level audit emit (additive to inquiry_events).
  const locPairs: Array<{
    key: string;
    group: string;
    visibility: "client_visible" | "talent_visible" | "coord_visible" | "admin_only";
    before: unknown;
    after: unknown;
  }> = [
    { key: "client_account_id", group: "client", visibility: "admin_only", before: prior.client_account_id, after: resolved.accountId },
    { key: "client_contact_id", group: "client", visibility: "admin_only", before: prior.client_contact_id, after: resolved.contactId },
  ];
  for (const p of locPairs) {
    if (p.before === p.after) continue;
    await emitFieldChange(supabase, {
      inquiryId: inquiry_id,
      fieldGroup: p.group,
      fieldKey: p.key,
      oldValue: p.before,
      newValue: p.after,
      visibility: p.visibility,
      actorRole: "admin",
    }).then((r) => { if (!r.ok) logServerError("admin/updateInquiryLocation/fieldEmit", r.error); });
  }

  revalidatePath("/admin/inquiries");
  revalidatePath(`/admin/inquiries/${inquiry_id}`);
  return undefined;
}

export async function updateInquiryRequestDetails(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { error: auth.error };
  const { supabase, tenantId } = auth;

  const channelRaw = trimmedString(formData, "source_channel");
  const channelParsed = parseWithSchema(inquirySourceChannelSchema, channelRaw);
  if ("error" in channelParsed) return { error: channelParsed.error };

  const parsed = parseWithSchema(updateInquiryRequestDetailsSchema, {
    inquiry_id: trimmedString(formData, "inquiry_id"),
    raw_ai_query: trimmedString(formData, "raw_ai_query"),
    message: trimmedString(formData, "message"),
    event_location: trimmedString(formData, "event_location"),
    source_channel: channelParsed.data,
    staff_notes: trimmedString(formData, "staff_notes"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const { inquiry_id, raw_ai_query, message, event_location, source_channel, staff_notes } = parsed.data;

  // Snapshot prior values so we can emit a field-level audit row for
  // each changed column. Details v3 §4.3 — audit_log.visibility_scope
  // drives which roles see each change on the Details-tab activity feed.
  const { data: priorReq } = await supabase
    .from("inquiries")
    .select("raw_ai_query, message, event_location, source_channel, staff_notes")
    .eq("id", inquiry_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const { error } = await supabase
    .from("inquiries")
    .update({
      raw_ai_query: raw_ai_query || null,
      message: message || null,
      event_location: event_location || null,
      source_channel: source_channel as never,
      staff_notes: staff_notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", inquiry_id)
    .eq("tenant_id", tenantId);

  if (error) {
    logServerError("admin/updateInquiryRequestDetails", error);
    return { error: CLIENT_ERROR.update };
  }

  if (priorReq) {
    const pairs: Array<{
      key: string;
      group: string;
      visibility: "client_visible" | "talent_visible" | "coord_visible" | "admin_only";
      before: unknown;
      after: unknown;
    }> = [
      { key: "event_location", group: "location",  visibility: "client_visible", before: priorReq.event_location, after: event_location || null },
      { key: "message",         group: "brief",     visibility: "client_visible", before: priorReq.message,         after: message || null },
      { key: "raw_ai_query",    group: "brief",     visibility: "admin_only",     before: priorReq.raw_ai_query,    after: raw_ai_query || null },
      { key: "source_channel",  group: "source",    visibility: "admin_only",     before: priorReq.source_channel,  after: source_channel },
      { key: "staff_notes",     group: "internal",  visibility: "admin_only",     before: priorReq.staff_notes,     after: staff_notes || null },
    ];
    for (const p of pairs) {
      if (p.before === p.after) continue;
      await emitFieldChange(supabase, {
        inquiryId: inquiry_id,
        fieldGroup: p.group,
        fieldKey: p.key,
        oldValue: p.before,
        newValue: p.after,
        visibility: p.visibility,
        actorRole: "admin",
      }).then((r) => { if (!r.ok) logServerError("admin/updateInquiryRequestDetails/fieldEmit", r.error); });
    }
  }

  revalidatePath("/admin/inquiries");
  revalidatePath(`/admin/inquiries/${inquiry_id}`);
  return undefined;
}

export async function addInquiryTalent(
  _prev: AdminActionState,
  _formData: FormData,
): Promise<AdminActionState> {
  // inquiry_talent was dropped in migration 20260522000000_phase2_backfill_and_drop_inquiry_talent.sql.
  // All inquiries now use inquiry_participants. This action is a no-op stub.
  return { error: "Legacy roster action is disabled. Use the v2 roster participants UI." };
}

export async function removeInquiryTalent(_formData: FormData): Promise<void> {
  // inquiry_talent was dropped in migration 20260522000000_phase2_backfill_and_drop_inquiry_talent.sql.
  // This action is a no-op stub.
}

export async function moveInquiryTalent(_formData: FormData): Promise<void> {
  // inquiry_talent was dropped in migration 20260522000000_phase2_backfill_and_drop_inquiry_talent.sql.
  // This action is a no-op stub.
}

const patchInquiryEntityLinksSchema = z.object({
  inquiry_id: z.string().min(1),
  patch_mode: z.enum(["platform_client", "billing_account", "contact"]),
  client_user_id: z.string(),
  client_account_id: z.string(),
  client_contact_id: z.string(),
});

/** Targeted CRM link updates from reassignment sheets (no full Operations form). */
export async function patchInquiryEntityLinks(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user, tenantId } = auth;

  const parsed = parseWithSchema(patchInquiryEntityLinksSchema, {
    inquiry_id: trimmedString(formData, "inquiry_id"),
    patch_mode: trimmedString(formData, "patch_mode"),
    client_user_id: trimmedString(formData, "client_user_id"),
    client_account_id: trimmedString(formData, "client_account_id"),
    client_contact_id: trimmedString(formData, "client_contact_id"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const { inquiry_id: id, patch_mode } = parsed.data;

  const { data: row, error: loadErr } = await supabase
    .from("inquiries")
    .select("client_user_id, client_account_id, client_contact_id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (loadErr || !row) {
    logServerError("admin/patchInquiryEntityLinks/load", loadErr);
    return { error: CLIENT_ERROR.loadPage };
  }

  let client_user_id = row.client_user_id as string | null;
  let client_account_id = row.client_account_id as string | null;
  let client_contact_id = row.client_contact_id as string | null;
  const priorAcc = client_account_id;
  const priorCon = client_contact_id;

  if (patch_mode === "platform_client") {
    const raw = trimmedString(formData, "client_user_id");
    client_user_id = raw.length > 0 ? raw : null;
  } else if (patch_mode === "billing_account") {
    client_account_id = trimmedString(formData, "client_account_id") || null;
    let resolved = await resolveClientAccountContactForSave(supabase, client_account_id, client_contact_id);
    if (!resolved.ok) {
      resolved = await resolveClientAccountContactForSave(supabase, client_account_id, null);
    }
    if (!resolved.ok) return { error: resolved.error };
    client_account_id = resolved.accountId;
    client_contact_id = resolved.contactId;
  } else {
    const nextContact = trimmedString(formData, "client_contact_id") || null;
    const resolved = await resolveClientAccountContactForSave(supabase, client_account_id, nextContact);
    if (!resolved.ok) return { error: resolved.error };
    client_account_id = resolved.accountId;
    client_contact_id = resolved.contactId;
  }

  const patch: Record<string, unknown> = {
    client_user_id,
    client_account_id,
    client_contact_id,
    updated_at: new Date().toISOString(),
  };

  if (booleanFromEquals(formData, "refresh_account_snapshot") && client_account_id) {
    const { data: acc } = await supabase
      .from("client_accounts")
      .select("name")
      .eq("id", client_account_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (acc?.name) patch.company = acc.name;
  }
  if (booleanFromEquals(formData, "refresh_contact_snapshot") && client_contact_id) {
    const { data: c } = await supabase
      .from("client_account_contacts")
      .select("full_name, email, phone")
      .eq("id", client_contact_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (c?.full_name) patch.contact_name = c.full_name;
    if (c?.email && String(c.email).trim()) patch.contact_email = c.email;
    if (c?.phone != null) patch.contact_phone = c.phone;
  }

  const { error } = await supabase
    .from("inquiries")
    .update(patch as never)
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) {
    logServerError("admin/patchInquiryEntityLinks", error);
    return { error: CLIENT_ERROR.update };
  }

  const actor = user.id;
  const refreshAccSnap = booleanFromEquals(formData, "refresh_account_snapshot");
  const refreshConSnap = booleanFromEquals(formData, "refresh_contact_snapshot");
  if (priorAcc !== client_account_id) {
    await logInquiryActivity(supabase, {
      inquiryId: id,
      actorUserId: actor,
      eventType: INQUIRY_AUDIT.CLIENT_ACCOUNT_CHANGED,
      payload: { from: priorAcc, to: client_account_id, via: "reassign_sheet", refresh_account_snapshot: refreshAccSnap },
    });
  }
  if (priorCon !== client_contact_id) {
    await logInquiryActivity(supabase, {
      inquiryId: id,
      actorUserId: actor,
      eventType: INQUIRY_AUDIT.CLIENT_CONTACT_CHANGED,
      payload: { from: priorCon, to: client_contact_id, via: "reassign_sheet", refresh_contact_snapshot: refreshConSnap },
    });
  }

  revalidatePath("/admin/inquiries");
  revalidatePath(`/admin/inquiries/${id}`);
  return undefined;
}

export async function createBooking(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user, tenantId } = auth;

  const parsed = parseWithSchema(createBookingSchema, {
    inquiry_id: trimmedString(formData, "inquiry_id"),
    talent_profile_id: trimmedString(formData, "talent_profile_id"),
    title: trimmedString(formData, "title"),
    booking_status: trimmedString(formData, "booking_status") || "tentative",
    starts_at: trimmedString(formData, "starts_at"),
    ends_at: trimmedString(formData, "ends_at"),
    notes: trimmedString(formData, "notes"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const { inquiry_id, talent_profile_id, title, booking_status, starts_at, ends_at, notes } =
    parsed.data;

  const { data: inq, error: inqErr } = await supabase
    .from("inquiries")
    .select(
      "tenant_id, client_user_id, client_account_id, client_contact_id, contact_name, contact_email, contact_phone, company, event_type_id, event_date, event_location",
    )
    .eq("id", inquiry_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (inqErr || !inq) {
    logServerError("admin/createBooking/loadInquiry", inqErr);
    return { error: CLIENT_ERROR.loadPage };
  }

  if (!inq.tenant_id) {
    logServerError("admin/createBooking/tenant", new Error(`inquiry ${inquiry_id} has no tenant_id`));
    return { error: CLIENT_ERROR.update };
  }

  let client_account_name: string | null = null;
  let client_account_type: string | null = null;
  if (inq.client_account_id) {
    const { data: acc } = await supabase
      .from("client_accounts")
      .select("name, account_type")
      .eq("id", inq.client_account_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    client_account_name = acc?.name ?? null;
    client_account_type = acc?.account_type ?? null;
  }

  const { data: bookingRow, error: bookErr } = await supabase
    .from("agency_bookings")
    .insert({
      tenant_id: tenantId,
      source_inquiry_id: inquiry_id,
      client_user_id: inq.client_user_id,
      client_account_id: inq.client_account_id,
      client_contact_id: inq.client_contact_id,
      owner_staff_id: user.id,
      title: title || "Booking",
      status: booking_status as never,
      starts_at: starts_at.length > 0 ? starts_at : null,
      ends_at: ends_at.length > 0 ? ends_at : null,
      notes: notes || null,
      internal_notes: notes || null,
      created_by_staff_id: user.id,
      contact_name: inq.contact_name,
      contact_email: inq.contact_email,
      contact_phone: inq.contact_phone,
      client_account_name,
      client_account_type,
      event_type_id: inq.event_type_id,
      event_date: inq.event_date,
      venue_location_text: inq.event_location,
    })
    .select("id")
    .single();

  if (bookErr || !bookingRow) {
    logServerError("admin/createBooking", bookErr);
    return { error: CLIENT_ERROR.update };
  }

  if (talent_profile_id) {
    const { data: tp } = await supabase
      .from("talent_profiles")
      .select("display_name, profile_code")
      .eq("id", talent_profile_id)
      .maybeSingle();
    const { error: lineErr } = await supabase.from("booking_talent").insert({
      tenant_id: tenantId,
      booking_id: bookingRow.id,
      talent_profile_id,
      talent_name_snapshot: tp?.display_name ?? null,
      profile_code_snapshot: tp?.profile_code ?? null,
      sort_order: 0,
    });
    if (lineErr) {
      logServerError("admin/createBooking/bookingTalent", lineErr);
      return { error: CLIENT_ERROR.update };
    }
  }

  await logBookingActivity(supabase, {
    bookingId: bookingRow.id,
    actorUserId: user.id,
    eventType: BOOKING_AUDIT.CREATED_FROM_INQUIRY_QUICK,
    payload: { inquiry_id, talent_profile_id: talent_profile_id || null },
  });
  await logInquiryActivity(supabase, {
    inquiryId: inquiry_id,
    actorUserId: user.id,
    eventType: INQUIRY_AUDIT.CONVERTED_TO_BOOKING,
    payload: { booking_id: bookingRow.id, path: "quick_add" },
  });

  revalidatePath(`/admin/inquiries/${inquiry_id}`);
  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${bookingRow.id}`);
  redirect(`/admin/bookings/${bookingRow.id}`);
}

export async function createClientAccount(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user, tenantId } = auth;

  const parsed = parseWithSchema(createClientAccountSchema, {
    name: trimmedString(formData, "name"),
    account_type: trimmedString(formData, "account_type"),
    account_type_detail: trimmedString(formData, "account_type_detail"),
    primary_email: trimmedString(formData, "primary_email"),
    primary_phone: trimmedString(formData, "primary_phone"),
    website_url: trimmedString(formData, "website_url"),
    location_text: trimmedString(formData, "location_text"),
    city: trimmedString(formData, "city"),
    country: trimmedString(formData, "country"),
    address_notes: trimmedString(formData, "address_notes"),
    google_place_id: trimmedString(formData, "google_place_id"),
    latitude: trimmedString(formData, "latitude"),
    longitude: trimmedString(formData, "longitude"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const {
    name,
    account_type,
    account_type_detail,
    primary_email,
    primary_phone,
    website_url,
    location_text,
    city,
    country,
    address_notes,
    google_place_id,
    latitude: latRaw,
    longitude: lngRaw,
  } = parsed.data;

  if (account_type === "other" && !account_type_detail.trim()) {
    return { error: 'Please specify the location type when "Other" is selected.' };
  }

  const emailTrim = primary_email.trim();
  if (emailTrim && !z.string().email().safeParse(emailTrim).success) {
    return { error: "Enter a valid email or leave it blank." };
  }

  const lat = optionalCoord(latRaw);
  const lng = optionalCoord(lngRaw);

  const fullInsert = {
    tenant_id: tenantId,
    name,
    account_type: account_type as never,
    account_type_detail: account_type_detail.trim() || null,
    primary_email: emailTrim || null,
    primary_phone: primary_phone.trim() || null,
    website_url: website_url.trim() || null,
    location_text: location_text.trim() || null,
    city: city.trim() || null,
    country: country.trim() || null,
    address_notes: address_notes.trim() || null,
    google_place_id: google_place_id.trim() || null,
    latitude: lat,
    longitude: lng,
  };

  let { data: row, error } = await supabase.from("client_accounts").insert(fullInsert).select("id").single();

  if (error && isPostgrestMissingColumnError(error)) {
    logServerError("admin/createClientAccount/schema-fallback", error);
    const packedLocation = [
      location_text.trim(),
      city.trim() && `City: ${city.trim()}`,
      country.trim() && `Country: ${country.trim()}`,
      address_notes.trim(),
      google_place_id.trim() && `Google place id: ${google_place_id.trim()}`,
      lat != null && lng != null && `Coordinates: ${lat}, ${lng}`,
    ]
      .filter(Boolean)
      .join("\n");

    const slimInsert = {
      tenant_id: tenantId,
      name,
      account_type: account_type as never,
      primary_email: emailTrim || null,
      primary_phone: primary_phone.trim() || null,
      website_url: website_url.trim() || null,
      location_text: packedLocation || location_text.trim() || null,
    };
    ({ data: row, error } = await supabase.from("client_accounts").insert(slimInsert).select("id").single());
  }

  if (error || !row) {
    logServerError("admin/createClientAccount", error);
    return { error: CLIENT_ERROR.update };
  }

  const linkInquiryId = trimmedString(formData, "link_inquiry_id");
  const linkBookingId = trimmedString(formData, "link_booking_id");
  const actor = user.id;

  if (linkInquiryId) {
    const { data: priorInq, error: loadInqErr } = await supabase
      .from("inquiries")
      .select("client_account_id, client_contact_id")
      .eq("id", linkInquiryId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!loadInqErr && priorInq) {
      const resolved = await resolveClientAccountContactForSave(
        supabase,
        row.id,
        priorInq.client_contact_id,
      );
      if (resolved.ok) {
        const { error: upErr } = await supabase
          .from("inquiries")
          .update({
            client_account_id: resolved.accountId,
            client_contact_id: resolved.contactId,
            updated_at: new Date().toISOString(),
          } as never)
          .eq("id", linkInquiryId)
          .eq("tenant_id", tenantId);
        if (!upErr) {
          if (priorInq.client_account_id !== resolved.accountId) {
            await logInquiryActivity(supabase, {
              inquiryId: linkInquiryId,
              actorUserId: actor,
              eventType: INQUIRY_AUDIT.CLIENT_ACCOUNT_CHANGED,
              payload: { from: priorInq.client_account_id, to: resolved.accountId, via: "create_account_sheet" },
            });
          }
          if (priorInq.client_contact_id !== resolved.contactId) {
            await logInquiryActivity(supabase, {
              inquiryId: linkInquiryId,
              actorUserId: actor,
              eventType: INQUIRY_AUDIT.CLIENT_CONTACT_CHANGED,
              payload: { from: priorInq.client_contact_id, to: resolved.contactId, via: "create_account_sheet" },
            });
          }
          revalidatePath("/admin/inquiries");
          revalidatePath(`/admin/inquiries/${linkInquiryId}`);
        } else {
          logServerError("admin/createClientAccount/linkInquiry", upErr);
        }
      }
    } else if (loadInqErr) {
      logServerError("admin/createClientAccount/loadInquiry", loadInqErr);
    }
  }

  if (linkBookingId) {
    const { data: priorBk, error: loadBkErr } = await supabase
      .from("agency_bookings")
      .select("client_account_id, client_contact_id")
      .eq("id", linkBookingId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!loadBkErr && priorBk) {
      const resolved = await resolveClientAccountContactForSave(
        supabase,
        row.id,
        priorBk.client_contact_id,
      );
      if (resolved.ok) {
        const { error: upErr } = await supabase
          .from("agency_bookings")
          .update({
            client_account_id: resolved.accountId,
            client_contact_id: resolved.contactId,
            updated_at: new Date().toISOString(),
            updated_by_staff_id: actor,
          } as never)
          .eq("id", linkBookingId)
          .eq("tenant_id", tenantId);
        if (!upErr) {
          if (priorBk.client_account_id !== resolved.accountId) {
            await logBookingActivity(supabase, {
              bookingId: linkBookingId,
              actorUserId: actor,
              eventType: BOOKING_AUDIT.CLIENT_ACCOUNT_CHANGED,
              payload: { from: priorBk.client_account_id, to: resolved.accountId, via: "create_account_sheet" },
            });
          }
          if (priorBk.client_contact_id !== resolved.contactId) {
            await logBookingActivity(supabase, {
              bookingId: linkBookingId,
              actorUserId: actor,
              eventType: BOOKING_AUDIT.CLIENT_CONTACT_CHANGED,
              payload: { from: priorBk.client_contact_id, to: resolved.contactId, via: "create_account_sheet" },
            });
          }
          revalidatePath("/admin/bookings");
          revalidatePath(`/admin/bookings/${linkBookingId}`);
        } else {
          logServerError("admin/createClientAccount/linkBooking", upErr);
        }
      }
    } else if (loadBkErr) {
      logServerError("admin/createClientAccount/loadBooking", loadBkErr);
    }
  }

  revalidatePath("/admin/accounts");
  const submitMode = trimmedString(formData, "_submit_mode");
  if (submitMode === "sheet") {
    return { createdClientAccountId: row.id };
  }
  redirect(`/admin/accounts/${row.id}`);
}

export async function updateClientLocation(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { error: auth.error };
  const { supabase, tenantId } = auth;

  const client_account_id = trimmedString(formData, "client_account_id");
  if (!client_account_id) return { error: "Missing work location." };

  const parsed = parseWithSchema(createClientAccountSchema, {
    name: trimmedString(formData, "name"),
    account_type: trimmedString(formData, "account_type"),
    account_type_detail: trimmedString(formData, "account_type_detail"),
    primary_email: trimmedString(formData, "primary_email"),
    primary_phone: trimmedString(formData, "primary_phone"),
    website_url: trimmedString(formData, "website_url"),
    location_text: trimmedString(formData, "location_text"),
    city: trimmedString(formData, "city"),
    country: trimmedString(formData, "country"),
    address_notes: trimmedString(formData, "address_notes"),
    google_place_id: trimmedString(formData, "google_place_id"),
    latitude: trimmedString(formData, "latitude"),
    longitude: trimmedString(formData, "longitude"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const {
    name,
    account_type,
    account_type_detail,
    primary_email,
    primary_phone,
    website_url,
    location_text,
    city,
    country,
    address_notes,
    google_place_id,
    latitude: latRaw,
    longitude: lngRaw,
  } = parsed.data;

  if (account_type === "other" && !account_type_detail.trim()) {
    return { error: 'Please specify the location type when "Other" is selected.' };
  }

  const emailTrim = primary_email.trim();
  if (emailTrim && !z.string().email().safeParse(emailTrim).success) {
    return { error: "Enter a valid email or leave it blank." };
  }

  const lat = optionalCoord(latRaw);
  const lng = optionalCoord(lngRaw);

  const fullUpdate = {
    name,
    account_type: account_type as never,
    account_type_detail: account_type_detail.trim() || null,
    primary_email: emailTrim || null,
    primary_phone: primary_phone.trim() || null,
    website_url: website_url.trim() || null,
    location_text: location_text.trim() || null,
    city: city.trim() || null,
    country: country.trim() || null,
    address_notes: address_notes.trim() || null,
    google_place_id: google_place_id.trim() || null,
    latitude: lat,
    longitude: lng,
    updated_at: new Date().toISOString(),
  };

  let { error } = await supabase
    .from("client_accounts")
    .update(fullUpdate as never)
    .eq("id", client_account_id)
    .eq("tenant_id", tenantId);

  if (error && isPostgrestMissingColumnError(error)) {
    logServerError("admin/updateClientLocation/schema-fallback", error);
    const packedLocation = [
      location_text.trim(),
      city.trim() && `City: ${city.trim()}`,
      country.trim() && `Country: ${country.trim()}`,
      address_notes.trim(),
      google_place_id.trim() && `Google place id: ${google_place_id.trim()}`,
      lat != null && lng != null && `Coordinates: ${lat}, ${lng}`,
    ]
      .filter(Boolean)
      .join("\n");

    const slimUpdate = {
      name,
      account_type: account_type as never,
      primary_email: emailTrim || null,
      primary_phone: primary_phone.trim() || null,
      website_url: website_url.trim() || null,
      location_text: packedLocation || location_text.trim() || null,
      updated_at: new Date().toISOString(),
    };

    ({ error } = await supabase
      .from("client_accounts")
      .update(slimUpdate as never)
      .eq("id", client_account_id)
      .eq("tenant_id", tenantId));
  }

  if (error) {
    logServerError("admin/updateClientLocation", error);
    return { error: CLIENT_ERROR.update };
  }

  revalidatePath("/admin/accounts");
  revalidatePath(`/admin/accounts/${client_account_id}`);

  const submitMode = trimmedString(formData, "_submit_mode");
  if (submitMode === "sheet") {
    return { updatedClientAccountId: client_account_id };
  }

  redirect(`/admin/accounts/${client_account_id}`);
}

export async function createClientAccountContact(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user, tenantId } = auth;

  const parsed = parseWithSchema(createClientContactSchema, {
    client_account_id: trimmedString(formData, "client_account_id"),
    full_name: trimmedString(formData, "full_name"),
    email: trimmedString(formData, "email"),
    phone: trimmedString(formData, "phone"),
    whatsapp_phone: trimmedString(formData, "whatsapp_phone"),
    job_title: trimmedString(formData, "job_title"),
    notes: trimmedString(formData, "notes"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const { client_account_id, full_name, email, phone, whatsapp_phone, job_title, notes } =
    parsed.data;

  const linkInquiryId = trimmedString(formData, "link_inquiry_id");
  const linkBookingId = trimmedString(formData, "link_booking_id");

  const { data: inserted, error } = await supabase
    .from("client_account_contacts")
    .insert({
      tenant_id: tenantId,
      client_account_id,
      full_name,
      email: email || null,
      phone: phone || null,
      whatsapp_phone: whatsapp_phone || null,
      job_title: job_title || null,
      notes: notes || null,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    logServerError("admin/createClientAccountContact", error);
    return { error: CLIENT_ERROR.update };
  }

  const newContactId = inserted.id as string;

  const actor = user.id;

  if (linkInquiryId) {
    const { data: priorInq, error: loadInqErr } = await supabase
      .from("inquiries")
      .select("client_account_id, client_contact_id")
      .eq("id", linkInquiryId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!loadInqErr && priorInq) {
      const resolved = await resolveClientAccountContactForSave(supabase, client_account_id, newContactId);
      if (resolved.ok) {
        const { error: upErr } = await supabase
          .from("inquiries")
          .update({
            client_account_id: resolved.accountId,
            client_contact_id: resolved.contactId,
            updated_at: new Date().toISOString(),
          } as never)
          .eq("id", linkInquiryId)
          .eq("tenant_id", tenantId);
        if (!upErr) {
          if (priorInq.client_account_id !== resolved.accountId) {
            await logInquiryActivity(supabase, {
              inquiryId: linkInquiryId,
              actorUserId: actor,
              eventType: INQUIRY_AUDIT.CLIENT_ACCOUNT_CHANGED,
              payload: { from: priorInq.client_account_id, to: resolved.accountId, via: "create_contact_sheet" },
            });
          }
          if (priorInq.client_contact_id !== resolved.contactId) {
            await logInquiryActivity(supabase, {
              inquiryId: linkInquiryId,
              actorUserId: actor,
              eventType: INQUIRY_AUDIT.CLIENT_CONTACT_CHANGED,
              payload: { from: priorInq.client_contact_id, to: resolved.contactId, via: "create_contact_sheet" },
            });
          }
          revalidatePath("/admin/inquiries");
          revalidatePath(`/admin/inquiries/${linkInquiryId}`);
        } else {
          logServerError("admin/createClientAccountContact/linkInquiry", upErr);
        }
      }
    } else if (loadInqErr) {
      logServerError("admin/createClientAccountContact/loadInquiry", loadInqErr);
    }
  }

  if (linkBookingId) {
    const { data: priorBk, error: loadBkErr } = await supabase
      .from("agency_bookings")
      .select("client_account_id, client_contact_id")
      .eq("id", linkBookingId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!loadBkErr && priorBk) {
      const resolved = await resolveClientAccountContactForSave(supabase, client_account_id, newContactId);
      if (resolved.ok) {
        const { error: upErr } = await supabase
          .from("agency_bookings")
          .update({
            client_account_id: resolved.accountId,
            client_contact_id: resolved.contactId,
            updated_at: new Date().toISOString(),
            updated_by_staff_id: actor,
          } as never)
          .eq("id", linkBookingId)
          .eq("tenant_id", tenantId);
        if (!upErr) {
          if (priorBk.client_account_id !== resolved.accountId) {
            await logBookingActivity(supabase, {
              bookingId: linkBookingId,
              actorUserId: actor,
              eventType: BOOKING_AUDIT.CLIENT_ACCOUNT_CHANGED,
              payload: { from: priorBk.client_account_id, to: resolved.accountId, via: "create_contact_sheet" },
            });
          }
          if (priorBk.client_contact_id !== resolved.contactId) {
            await logBookingActivity(supabase, {
              bookingId: linkBookingId,
              actorUserId: actor,
              eventType: BOOKING_AUDIT.CLIENT_CONTACT_CHANGED,
              payload: { from: priorBk.client_contact_id, to: resolved.contactId, via: "create_contact_sheet" },
            });
          }
          revalidatePath("/admin/bookings");
          revalidatePath(`/admin/bookings/${linkBookingId}`);
        } else {
          logServerError("admin/createClientAccountContact/linkBooking", upErr);
        }
      }
    } else if (loadBkErr) {
      logServerError("admin/createClientAccountContact/loadBooking", loadBkErr);
    }
  }

  revalidatePath(`/admin/accounts/${client_account_id}`);
  revalidatePath("/admin/accounts");
  return { contactCreated: true };
}

export async function assignInquiryToCurrentStaff(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user, tenantId } = auth;

  const parsed = parseWithSchema(assignInquirySchema, {
    inquiry_id: trimmedString(formData, "inquiry_id"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const { inquiry_id } = parsed.data;
  const { data: current, error: loadErr } = await supabase
    .from("inquiries")
    .select("status")
    .eq("id", inquiry_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (loadErr || !current) {
    logServerError("admin/assignInquiryToCurrentStaff/load", loadErr);
    return { error: CLIENT_ERROR.loadPage };
  }

  const { error } = await supabase
    .from("inquiries")
    .update({
      assigned_staff_id: user.id,
      status: (current.status === "new" ? "reviewing" : current.status) as never,
      updated_at: new Date().toISOString(),
    })
    .eq("id", inquiry_id)
    .eq("tenant_id", tenantId);

  if (error) {
    logServerError("admin/assignInquiryToCurrentStaff", error);
    return { error: CLIENT_ERROR.update };
  }

  revalidatePath("/admin/inquiries");
  revalidatePath(`/admin/inquiries/${inquiry_id}`);
  return undefined;
}

const proficiencyMinSchema = z.enum([
  "beginner",
  "intermediate",
  "advanced",
  "expert",
  "master",
]);

const manualInquirySchema = z.object({
  contact_name: z.string().min(1, "Contact name is required."),
  contact_email: z.string().min(1, "Email is required."),
  contact_phone: z.string(),
  company: z.string(),
  client_user_id: z.string(),
  client_account_id: z.string(),
  client_contact_id: z.string(),
  staff_notes: z.string(),
  raw_ai_query: z.string(),
  message: z.string(),
  event_location: z.string(),
  source_channel: inquirySourceChannelSchema,
  // Phase 6.1 — optional skill targeting
  requested_skill_term_id: z.string().optional().default(""),
  requested_proficiency_min: z.string().optional().default(""),
});

/** Staff-created inquiry (phone / walk-in). Supports sheet mode via `submit_mode=sheet`. */
export async function createManualInquiry(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user, tenantId } = auth;

  const channelRaw = trimmedString(formData, "source_channel");
  const channelParsed = parseWithSchema(
    inquirySourceChannelSchema,
    channelRaw.length > 0 ? channelRaw : "phone",
  );
  if ("error" in channelParsed) return { error: channelParsed.error };

  const parsed = parseWithSchema(manualInquirySchema, {
    contact_name: trimmedString(formData, "contact_name"),
    contact_email: trimmedString(formData, "contact_email"),
    contact_phone: trimmedString(formData, "contact_phone"),
    company: trimmedString(formData, "company"),
    client_user_id: trimmedString(formData, "client_user_id"),
    client_account_id: trimmedString(formData, "client_account_id"),
    client_contact_id: trimmedString(formData, "client_contact_id"),
    staff_notes: trimmedString(formData, "staff_notes"),
    raw_ai_query: trimmedString(formData, "raw_ai_query"),
    message: trimmedString(formData, "message"),
    event_location: trimmedString(formData, "event_location"),
    source_channel: channelParsed.data,
    requested_skill_term_id: trimmedString(formData, "requested_skill_term_id"),
    requested_proficiency_min: trimmedString(formData, "requested_proficiency_min"),
  });

  if ("error" in parsed) return { error: parsed.error };

  const d = parsed.data;

  const uidRaw = trimmedString(formData, "client_user_id");
  const client_user_id: string | null = uidRaw.length > 0 ? uidRaw : null;
  if (client_user_id) {
    const { data: prof, error: pErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", client_user_id)
      .eq("app_role", "client")
      .maybeSingle();
    if (pErr || !prof) {
      return { error: "That user is not a platform client." };
    }
  }

  let client_account_id = d.client_account_id.length > 0 ? d.client_account_id : null;
  let client_contact_id = d.client_contact_id.length > 0 ? d.client_contact_id : null;

  const resolved = await resolveClientAccountContactForSave(supabase, client_account_id, client_contact_id);
  if (!resolved.ok) return { error: resolved.error };
  client_account_id = resolved.accountId;
  client_contact_id = resolved.contactId;

  let createdInquiryClientAccountName: string | null = null;
  if (client_account_id) {
    const { data: acc } = await supabase
      .from("client_accounts")
      .select("name")
      .eq("id", client_account_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    createdInquiryClientAccountName = acc?.name ?? null;
  }

  // Phase 6.1 — optional skill targeting
  const skillTermId = d.requested_skill_term_id.length > 0 ? d.requested_skill_term_id : null;
  const proficiencyRaw = d.requested_proficiency_min.length > 0 ? d.requested_proficiency_min : null;
  const proficiencyMin = proficiencyRaw && proficiencyMinSchema.safeParse(proficiencyRaw).success
    ? proficiencyRaw
    : null;

  // Phase B-3 (2026-05-14) — the previous implementation did a direct
  // INSERT into public.inquiries, bypassing the submitInquiry engine.
  // That meant no rate limiting, no roster validation, no coordinator
  // auto-assignment, no engine events except a manually-emitted one,
  // and `uses_new_engine` left unset so the row was invisible to v2
  // engine paths (createOffer, sendOffer, etc.).
  //
  // Now routes through createInquiryFromIntent — the canonical engine
  // entry point per spec §18. The intent carries the admin-specific
  // metadata (assigned_staff_id, client_account_id, skill targeting)
  // in source_context so we can still backfill it after the insert.

  const intentResult = await createInquiryFromIntent(
    supabase,
    {
      source: "admin_created",
      source_context: {
        admin_form: "createManualInquiry",
        skill_term_id: skillTermId,
        proficiency_min: proficiencyMin,
        staff_notes: d.staff_notes.length > 0 ? d.staff_notes : null,
        client_account_id,
        client_contact_id,
        legacy_source_channel: d.source_channel,
      },
      requester: {
        name: d.contact_name,
        email: d.contact_email,
        phone: d.contact_phone.length > 0 ? d.contact_phone : undefined,
        user_id: client_user_id,
      },
      client: {
        company: d.company.length > 0 ? d.company : undefined,
        booking_for: "another_client",
      },
      location: {
        status: d.event_location.length > 0 ? "unconfirmed" : "not_sure",
        city: d.event_location.length > 0 ? d.event_location : undefined,
      },
      date: { status: "not_sure" },
      talent: { selection_mode: "agency_recommends" },
      budget: { preference: "agency_recommends" },
      brief: {
        summary:
          d.message.length > 0
            ? d.message
            : d.raw_ai_query.length > 0
              ? d.raw_ai_query
              : "Admin-created inquiry (manual)",
      },
    },
    {
      tenant_id: tenantId,
      actor_user_id: user.id,
      client_user_id,
    },
  );

  if (!intentResult.ok) {
    logServerError(
      "admin/createManualInquiry.intent",
      new Error(JSON.stringify(intentResult)),
    );
    return { error: CLIENT_ERROR.update };
  }
  const inquiryId = intentResult.inquiryId;

  // Backfill admin-specific columns that submitInquiry doesn't write
  // (it focuses on the canonical client-facing fields). Stamping
  // assigned_staff_id + staff_notes + skill targeting + client_account
  // linkage keeps the legacy admin UI working unchanged.
  const adminBackfill: Record<string, unknown> = {
    assigned_staff_id: user.id,
  };
  if (d.staff_notes.length > 0) adminBackfill.staff_notes = d.staff_notes;
  if (client_account_id) adminBackfill.client_account_id = client_account_id;
  if (client_contact_id) adminBackfill.client_contact_id = client_contact_id;
  if (skillTermId) adminBackfill.requested_skill_term_id = skillTermId;
  if (proficiencyMin)
    adminBackfill.requested_proficiency_min = proficiencyMin as never;
  const { error: backfillErr } = await supabase
    .from("inquiries")
    .update(adminBackfill)
    .eq("id", inquiryId)
    .eq("tenant_id", tenantId);
  if (backfillErr) {
    logServerError("admin/createManualInquiry.backfill", backfillErr);
    // Non-fatal — inquiry exists, just missing some admin-side metadata.
  }

  await logInquiryActivity(supabase, {
    inquiryId,
    actorUserId: user.id,
    eventType: INQUIRY_AUDIT.CREATED_MANUAL,
    payload: { source_channel: d.source_channel },
  });
  // INQUIRY_SUBMITTED engine event is emitted internally by
  // submitInquiry → no need to re-emit here.

  revalidatePath("/admin/inquiries");

  const submitMode = trimmedString(formData, "submit_mode");
  if (submitMode === "sheet") {
    return {
      createdInquiryId: inquiryId,
      createdInquiryClientAccountId: client_account_id,
      createdInquiryClientAccountName,
    };
  }

  redirect(`/admin/inquiries/${inquiryId}`);
}

export async function assignInquiryToCurrentStaffForm(formData: FormData): Promise<void> {
  await assignInquiryToCurrentStaff(undefined, formData);
}

const quickInquiryStatusPeekSchema = z.object({
  inquiry_id: pgUuidSchema(),
  status: inquiryStatusSchema,
});

/** Status-only patch for inquiry list rows / quick actions (no navigation). */
export async function quickPatchInquiryStatus(formData: FormData): Promise<AdminActionState> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user, tenantId } = auth;

  const parsed = parseWithSchema(quickInquiryStatusPeekSchema, {
    inquiry_id: trimmedString(formData, "inquiry_id"),
    status: trimmedString(formData, "status"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const { inquiry_id, status } = parsed.data;

  // #10 — Safety: a raw status patch is only allowed for the manual,
  // non-commercial triage states. Default-DENY: every commercial transition MUST
  // go through the engine (sendOffer → offer_pending; submit_approval → approved/
  // rejected; convert → booked/converted), which creates the agency_bookings row +
  // commission snapshot, records approvals, emits events, and bumps the optimistic-
  // lock version. Patching e.g. status='booked' directly produces an orphan booked
  // inquiry (no booking row → breaks the consistency invariant + every payment/
  // booking view). A whitelist (not a blacklist) means a NEW commercial status can
  // never silently become hand-settable.
  const MANUAL_SAFE_STATUSES = new Set<string>([
    "new", "reviewing", "waiting_for_client", "talent_suggested", "in_progress",
    "qualified", "closed", "closed_lost", "archived", "draft", "submitted",
    "coordination", "expired",
  ]);
  if (!MANUAL_SAFE_STATUSES.has(status)) {
    return {
      error:
        "That status is set automatically — by sending an offer, the client/talent approving, or converting to a booking — and can't be set manually here.",
    };
  }

  const { data: prior, error: priorErr } = await supabase
    .from("inquiries")
    .select("status, version")
    .eq("id", inquiry_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (priorErr || !prior) {
    logServerError("admin/quickPatchInquiryStatus/load", priorErr);
    return { error: CLIENT_ERROR.loadPage };
  }

  // #10 — bump the optimistic-lock version (was skipped, so a concurrent engine
  // op couldn't tell this patch happened) AND gate the write on the version we
  // read, so a racing edit fails closed instead of silently clobbering.
  const priorVersion = (prior.version as number | null) ?? 1;
  const { data: updated, error } = await supabase
    .from("inquiries")
    .update({ status: status as never, version: (priorVersion + 1) as never, updated_at: new Date().toISOString() })
    .eq("id", inquiry_id)
    .eq("tenant_id", tenantId)
    .eq("version", priorVersion as never)
    .select("id")
    .maybeSingle();

  if (error) {
    logServerError("admin/quickPatchInquiryStatus", error);
    return { error: CLIENT_ERROR.update };
  }
  if (!updated) {
    return { error: "This inquiry changed in another tab — reload and try again." };
  }

  if (prior.status !== status) {
    await logInquiryActivity(supabase, {
      inquiryId: inquiry_id,
      actorUserId: user.id,
      eventType: INQUIRY_AUDIT.STATUS_CHANGED,
      payload: { from: prior.status, to: status, via: "list_row" },
    });
  }

  revalidatePath("/admin/inquiries");
  revalidatePath(`/admin/inquiries/${inquiry_id}`);
  return undefined;
}

type InquiryRow = {
  tenant_id: string;
  client_user_id: string | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  company: string | null;
  event_type_id: string | null;
  event_date: string | null;
  event_location: string | null;
  quantity: number | null;
  message: string | null;
  raw_ai_query: string | null;
  interpreted_query: unknown;
  source_page: string | null;
  assigned_staff_id: string | null;
  staff_notes: string | null;
  client_account_id: string | null;
  client_contact_id: string | null;
  source_channel?: string | null;
};

export async function duplicateInquiry(formData: FormData): Promise<void> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) redirect("/admin/inquiries");
  const { supabase, user, tenantId } = auth;

  const sourceId = trimmedString(formData, "source_inquiry_id");
  if (!pgUuidSchema().safeParse(sourceId).success) {
    redirect("/admin/inquiries");
  }

  const keep_client_account = booleanFromEquals(formData, "keep_client_account");
  const keep_contact = booleanFromEquals(formData, "keep_contact");
  const clear_dates = booleanFromEquals(formData, "clear_dates");
  const clear_assigned = booleanFromEquals(formData, "clear_assigned_staff");
  const clear_staff_notes = booleanFromEquals(formData, "clear_staff_notes");
  const clear_client_message = booleanFromEquals(formData, "clear_client_message");
  const refresh_snapshots_for_new_links = booleanFromEquals(formData, "refresh_snapshots_for_new_links");
  const new_client_account_id = trimmedString(formData, "new_client_account_id");
  const new_client_contact_id = trimmedString(formData, "new_client_contact_id");

  const { data: src, error } = await supabase
    .from("inquiries")
    .select("*")
    .eq("id", sourceId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error || !src) {
    redirect(`/admin/inquiries/${sourceId}?dup_err=${encodeURIComponent(CLIENT_ERROR.loadPage)}`);
  }

  const row = src as unknown as InquiryRow;
  // SaaS P1.B STEP 3: the `.eq("tenant_id", tenantId)` on the source read
  // already guarantees the row belongs to the caller's active tenant.

  let client_account_id = keep_client_account ? row.client_account_id : new_client_account_id || null;
  let client_contact_id = keep_contact ? row.client_contact_id : new_client_contact_id || null;

  const dupInqResolved = await resolveClientAccountContactForSave(supabase, client_account_id, client_contact_id);
  if (!dupInqResolved.ok) {
    redirect(`/admin/inquiries/${sourceId}?dup_err=${encodeURIComponent(dupInqResolved.error)}`);
  }
  client_account_id = dupInqResolved.accountId;
  client_contact_id = dupInqResolved.contactId;

  let company: string | null = row.company;
  let contact_name = row.contact_name;
  let contact_email = row.contact_email;
  let contact_phone = row.contact_phone;

  if (refresh_snapshots_for_new_links && !keep_client_account && client_account_id) {
    const { data: acc } = await supabase
      .from("client_accounts")
      .select("name")
      .eq("id", client_account_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (acc?.name) company = acc.name;
  }

  if (refresh_snapshots_for_new_links && !keep_contact && client_contact_id) {
    const { data: c } = await supabase
      .from("client_account_contacts")
      .select("full_name, email, phone")
      .eq("id", client_contact_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (c?.full_name) contact_name = c.full_name;
    if (c?.email && String(c.email).trim()) contact_email = c.email;
    if (c?.phone != null) contact_phone = c.phone;
  }

  const { data: created, error: insErr } = await supabase
    .from("inquiries")
    .insert({
      tenant_id: row.tenant_id,
      guest_session_id: null,
      client_user_id: row.client_user_id,
      status: "new" as never,
      contact_name,
      contact_email,
      contact_phone,
      company,
      event_type_id: row.event_type_id,
      event_date: clear_dates ? null : row.event_date,
      event_location: clear_dates ? null : row.event_location,
      quantity: clear_dates ? null : row.quantity,
      message: clear_client_message ? null : row.message,
      raw_ai_query: row.raw_ai_query,
      interpreted_query: row.interpreted_query,
      source_page: row.source_page,
      assigned_staff_id: clear_assigned ? null : row.assigned_staff_id,
      staff_notes: clear_staff_notes ? null : row.staff_notes,
      client_account_id,
      client_contact_id,
      source_channel: (row.source_channel ?? "admin") as never,
      closed_reason: null,
      duplicate_of_inquiry_id: sourceId,
    })
    .select("id")
    .single();

  if (insErr || !created) {
    logServerError("admin/duplicateInquiry", insErr);
    redirect(`/admin/inquiries/${sourceId}?dup_err=${encodeURIComponent(CLIENT_ERROR.update)}`);
  }

  await logInquiryActivity(supabase, {
    inquiryId: sourceId,
    actorUserId: user.id,
    eventType: INQUIRY_AUDIT.DUPLICATED,
    payload: { new_inquiry_id: created.id },
  });

  // inquiry_talent was dropped 2026-05-22; talent duplication is not supported for legacy inquiries.
  // v2 duplicates must copy inquiry_participants separately if needed.

  revalidatePath("/admin/inquiries");
  revalidatePath(`/admin/inquiries/${sourceId}`);
  redirect(`/admin/inquiries/${created.id}`);
}

// ─── Admin message send ───────────────────────────────────────────────────────

export type AdminSendMessageResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

/**
 * Send a message on a private or group thread as the current staff member.
 * Called from `InquiryWorkspaceDrawer` in the admin shell composer.
 */
export async function sendInquiryMessageAsAdmin(
  inquiryId: string,
  threadType: "private" | "group",
  body: string,
): Promise<AdminSendMessageResult> {
  try {
    const trimmed = body.trim();
    if (!trimmed) return { ok: false, error: "Message is empty." };
    if (trimmed.length > 10_000) return { ok: false, error: "Message is too long." };
    if (!["private", "group"].includes(threadType)) return { ok: false, error: "Invalid thread." };

    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: "Not authenticated." };
    const { supabase, tenantId, user } = auth;

    const result = await engineSendMessage(supabase, {
      inquiryId,
      tenantId,
      actorUserId: user.id,
      threadType,
      body: trimmed,
    });

    if (!result.success) {
      if (result.rateLimited) return { ok: false, error: "Sending too fast — wait a moment." };
      if (result.forbidden)   return { ok: false, error: "Not authorised to message this inquiry." };
      return { ok: false, error: result.error ?? "Failed to send." };
    }

    revalidatePath("/", "layout");
    return { ok: true, messageId: result.data?.messageId ?? "" };
  } catch (err) {
    logServerError("admin-inquiries.sendInquiryMessageAsAdmin", err);
    return { ok: false, error: "Unexpected error." };
  }
}
