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
import { requireStaff } from "@/lib/server/action-guards";
import { CLIENT_ERROR, isPostgrestMissingColumnError, logServerError } from "@/lib/server/safe-error";

export type AdminActionState =
  | {
      error?: string;
      /** Set when createClientAccount runs in sheet mode (no redirect). */
      createdClientAccountId?: string;
      /** Set when updateClientLocation runs in sheet mode (no redirect). */
      updatedClientAccountId?: string;
      /** Set when createClientAccountContact succeeds (for sheet UX). */
      contactCreated?: boolean;
      /** Manual phone / walk-in intake (sheet mode). */
      createdInquiryId?: string;
      createdInquiryClientAccountId?: string | null;
      createdInquiryClientAccountName?: string | null;
    }
  | undefined;

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

const addInquiryTalentSchema = z.object({
  inquiry_id: z.string().min(1, "Missing inquiry."),
  talent_profile_id: z.string().min(1, "Pick a talent profile."),
});

const mutateInquiryTalentSchema = z.object({
  inquiry_id: z.string().min(1, "Missing inquiry."),
  inquiry_talent_id: z.string().min(1, "Missing shortlist row."),
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
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

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
    .select("client_account_id, client_contact_id")
    .eq("id", id)
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
      .maybeSingle();
    if (acc?.name) patch.company = acc.name;
  }

  if (booleanFromEquals(formData, "refresh_contact_snapshot") && client_contact_id) {
    const { data: c } = await supabase
      .from("client_account_contacts")
      .select("full_name, email, phone")
      .eq("id", client_contact_id)
      .maybeSingle();
    if (c?.full_name) patch.contact_name = c.full_name;
    if (c?.email && String(c.email).trim()) patch.contact_email = c.email;
    if (c?.phone != null) patch.contact_phone = c.phone;
  }

  const { error } = await supabase.from("inquiries").update(patch as never).eq("id", id);

  if (error) {
    logServerError("admin/updateInquiry", error);
    return { error: CLIENT_ERROR.update };
  }

  const actor = auth.user.id;
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

  revalidatePath("/admin/inquiries");
  revalidatePath(`/admin/inquiries/${id}`);
  return undefined;
}

export async function updateInquiryClientInfo(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

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
    .eq("id", inquiry_id);

  if (error) {
    logServerError("admin/updateInquiryClientInfo", error);
    return { error: CLIENT_ERROR.update };
  }

  revalidatePath("/admin/inquiries");
  revalidatePath(`/admin/inquiries/${inquiry_id}`);
  return undefined;
}

export async function updateInquiryLocation(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

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
    .eq("id", inquiry_id);

  if (error) {
    logServerError("admin/updateInquiryLocation", error);
    return { error: CLIENT_ERROR.update };
  }

  const actor = auth.user.id;
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

  revalidatePath("/admin/inquiries");
  revalidatePath(`/admin/inquiries/${inquiry_id}`);
  return undefined;
}

export async function updateInquiryRequestDetails(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

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
    .eq("id", inquiry_id);

  if (error) {
    logServerError("admin/updateInquiryRequestDetails", error);
    return { error: CLIENT_ERROR.update };
  }

  revalidatePath("/admin/inquiries");
  revalidatePath(`/admin/inquiries/${inquiry_id}`);
  return undefined;
}

export async function addInquiryTalent(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(addInquiryTalentSchema, {
    inquiry_id: trimmedString(formData, "inquiry_id"),
    talent_profile_id: trimmedString(formData, "talent_profile_id"),
  });
  if ("error" in parsed) return { error: parsed.error };
  const { inquiry_id, talent_profile_id } = parsed.data;

  const { data: existing } = await supabase
    .from("inquiry_talent")
    .select("id")
    .eq("inquiry_id", inquiry_id)
    .eq("talent_profile_id", talent_profile_id)
    .maybeSingle();
  if (existing?.id) {
    return { error: "That talent is already on this inquiry." };
  }

  const { data: currentRows } = await supabase
    .from("inquiry_talent")
    .select("sort_order")
    .eq("inquiry_id", inquiry_id)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextSort = ((currentRows?.[0]?.sort_order as number | null) ?? -1) + 1;

  const { error } = await supabase.from("inquiry_talent").insert({
    inquiry_id,
    talent_profile_id,
    sort_order: nextSort,
    added_by_staff_id: auth.user.id,
  });

  if (error) {
    logServerError("admin/addInquiryTalent", error);
    return { error: CLIENT_ERROR.update };
  }

  revalidatePath("/admin/inquiries");
  revalidatePath(`/admin/inquiries/${inquiry_id}`);
  return undefined;
}

export async function removeInquiryTalent(formData: FormData): Promise<void> {
  const auth = await requireStaff();
  if (!auth.ok) return;
  const { supabase } = auth;

  const parsed = parseWithSchema(mutateInquiryTalentSchema, {
    inquiry_id: trimmedString(formData, "inquiry_id"),
    inquiry_talent_id: trimmedString(formData, "inquiry_talent_id"),
  });
  if ("error" in parsed) return;
  const { inquiry_id, inquiry_talent_id } = parsed.data;

  const { error } = await supabase.from("inquiry_talent").delete().eq("id", inquiry_talent_id).eq("inquiry_id", inquiry_id);
  if (error) {
    logServerError("admin/removeInquiryTalent", error);
    return;
  }

  revalidatePath("/admin/inquiries");
  revalidatePath(`/admin/inquiries/${inquiry_id}`);
}

export async function moveInquiryTalent(formData: FormData): Promise<void> {
  const auth = await requireStaff();
  if (!auth.ok) return;
  const { supabase } = auth;

  const parsed = parseWithSchema(mutateInquiryTalentSchema, {
    inquiry_id: trimmedString(formData, "inquiry_id"),
    inquiry_talent_id: trimmedString(formData, "inquiry_talent_id"),
  });
  if ("error" in parsed) return;

  const direction = trimmedString(formData, "direction");
  if (direction !== "up" && direction !== "down") return;

  const { inquiry_id, inquiry_talent_id } = parsed.data;

  const { data: rows, error } = await supabase
    .from("inquiry_talent")
    .select("id, sort_order")
    .eq("inquiry_id", inquiry_id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error || !rows) {
    logServerError("admin/moveInquiryTalent/load", error);
    return;
  }

  const index = rows.findIndex((row) => row.id === inquiry_talent_id);
  if (index < 0) return;

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= rows.length) return;

  const next = [...rows];
  const [moved] = next.splice(index, 1);
  next.splice(targetIndex, 0, moved);

  for (let i = 0; i < next.length; i += 1) {
    const row = next[i];
    if ((row.sort_order as number | null) === i) continue;
    const { error: updateErr } = await supabase.from("inquiry_talent").update({ sort_order: i }).eq("id", row.id);
    if (updateErr) {
      logServerError("admin/moveInquiryTalent/update", updateErr);
      return;
    }
  }

  revalidatePath("/admin/inquiries");
  revalidatePath(`/admin/inquiries/${inquiry_id}`);
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
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

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
    const { data: acc } = await supabase.from("client_accounts").select("name").eq("id", client_account_id).maybeSingle();
    if (acc?.name) patch.company = acc.name;
  }
  if (booleanFromEquals(formData, "refresh_contact_snapshot") && client_contact_id) {
    const { data: c } = await supabase
      .from("client_account_contacts")
      .select("full_name, email, phone")
      .eq("id", client_contact_id)
      .maybeSingle();
    if (c?.full_name) patch.contact_name = c.full_name;
    if (c?.email && String(c.email).trim()) patch.contact_email = c.email;
    if (c?.phone != null) patch.contact_phone = c.phone;
  }

  const { error } = await supabase.from("inquiries").update(patch as never).eq("id", id);
  if (error) {
    logServerError("admin/patchInquiryEntityLinks", error);
    return { error: CLIENT_ERROR.update };
  }

  const actor = auth.user.id;
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
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

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
      "client_user_id, client_account_id, client_contact_id, contact_name, contact_email, contact_phone, company, event_type_id, event_date, event_location",
    )
    .eq("id", inquiry_id)
    .maybeSingle();

  if (inqErr || !inq) {
    logServerError("admin/createBooking/loadInquiry", inqErr);
    return { error: CLIENT_ERROR.loadPage };
  }

  let client_account_name: string | null = null;
  let client_account_type: string | null = null;
  if (inq.client_account_id) {
    const { data: acc } = await supabase
      .from("client_accounts")
      .select("name, account_type")
      .eq("id", inq.client_account_id)
      .maybeSingle();
    client_account_name = acc?.name ?? null;
    client_account_type = acc?.account_type ?? null;
  }

  const { data: bookingRow, error: bookErr } = await supabase
    .from("agency_bookings")
    .insert({
      source_inquiry_id: inquiry_id,
      client_user_id: inq.client_user_id,
      client_account_id: inq.client_account_id,
      client_contact_id: inq.client_contact_id,
      owner_staff_id: auth.user.id,
      title: title || "Booking",
      status: booking_status as never,
      starts_at: starts_at.length > 0 ? starts_at : null,
      ends_at: ends_at.length > 0 ? ends_at : null,
      notes: notes || null,
      internal_notes: notes || null,
      created_by_staff_id: auth.user.id,
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
    actorUserId: auth.user.id,
    eventType: BOOKING_AUDIT.CREATED_FROM_INQUIRY_QUICK,
    payload: { inquiry_id, talent_profile_id: talent_profile_id || null },
  });
  await logInquiryActivity(supabase, {
    inquiryId: inquiry_id,
    actorUserId: auth.user.id,
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
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

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
  const actor = auth.user.id;

  if (linkInquiryId) {
    const { data: priorInq, error: loadInqErr } = await supabase
      .from("inquiries")
      .select("client_account_id, client_contact_id")
      .eq("id", linkInquiryId)
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
          .eq("id", linkInquiryId);
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
          .eq("id", linkBookingId);
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
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const client_account_id = trimmedString(formData, "client_account_id");
  if (!client_account_id) return { error: "Missing client location." };

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
    .eq("id", client_account_id);

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
      .eq("id", client_account_id));
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
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

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

  const actor = auth.user.id;

  if (linkInquiryId) {
    const { data: priorInq, error: loadInqErr } = await supabase
      .from("inquiries")
      .select("client_account_id, client_contact_id")
      .eq("id", linkInquiryId)
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
          .eq("id", linkInquiryId);
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
          .eq("id", linkBookingId);
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
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const parsed = parseWithSchema(assignInquirySchema, {
    inquiry_id: trimmedString(formData, "inquiry_id"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const { inquiry_id } = parsed.data;
  const { data: current, error: loadErr } = await supabase
    .from("inquiries")
    .select("status")
    .eq("id", inquiry_id)
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
    .eq("id", inquiry_id);

  if (error) {
    logServerError("admin/assignInquiryToCurrentStaff", error);
    return { error: CLIENT_ERROR.update };
  }

  revalidatePath("/admin/inquiries");
  revalidatePath(`/admin/inquiries/${inquiry_id}`);
  return undefined;
}

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
});

/** Staff-created inquiry (phone / walk-in). Supports sheet mode via `submit_mode=sheet`. */
export async function createManualInquiry(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

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
      .maybeSingle();
    createdInquiryClientAccountName = acc?.name ?? null;
  }

  const { data: created, error: insErr } = await supabase
    .from("inquiries")
    .insert({
      guest_session_id: null,
      client_user_id,
      status: "new" as never,
      contact_name: d.contact_name,
      contact_email: d.contact_email,
      contact_phone: d.contact_phone.length > 0 ? d.contact_phone : null,
      company: d.company.length > 0 ? d.company : null,
      event_type_id: null,
      event_date: null,
      event_location: d.event_location.length > 0 ? d.event_location : null,
      quantity: null,
      message: d.message.length > 0 ? d.message : null,
      raw_ai_query: d.raw_ai_query.length > 0 ? d.raw_ai_query : null,
      interpreted_query: null,
      source_page: null,
      assigned_staff_id: user.id,
      staff_notes: d.staff_notes.length > 0 ? d.staff_notes : null,
      client_account_id,
      client_contact_id,
      source_channel: d.source_channel as never,
      closed_reason: null,
      duplicate_of_inquiry_id: null,
    })
    .select("id")
    .single();

  if (insErr || !created) {
    logServerError("admin/createManualInquiry", insErr);
    return { error: CLIENT_ERROR.update };
  }

  await logInquiryActivity(supabase, {
    inquiryId: created.id,
    actorUserId: user.id,
    eventType: INQUIRY_AUDIT.CREATED_MANUAL,
    payload: { source_channel: d.source_channel },
  });

  const talentIds = String(formData.get("talent_ids") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (talentIds.length > 0) {
    for (const [index, talent_profile_id] of talentIds.entries()) {
      const { error: talentErr } = await supabase.from("inquiry_talent").insert({
        inquiry_id: created.id,
        talent_profile_id,
        sort_order: index,
        added_by_staff_id: user.id,
      });
      if (talentErr) {
        logServerError("admin/createManualInquiry/talent", talentErr);
      }
    }
  }

  revalidatePath("/admin/inquiries");

  const submitMode = trimmedString(formData, "submit_mode");
  if (submitMode === "sheet") {
    return {
      createdInquiryId: created.id,
      createdInquiryClientAccountId: client_account_id,
      createdInquiryClientAccountName,
    };
  }

  redirect(`/admin/inquiries/${created.id}`);
}

export async function assignInquiryToCurrentStaffForm(formData: FormData): Promise<void> {
  await assignInquiryToCurrentStaff(undefined, formData);
}

const quickInquiryStatusPeekSchema = z.object({
  inquiry_id: z.string().uuid(),
  status: inquiryStatusSchema,
});

/** Status-only patch for inquiry list rows / quick actions (no navigation). */
export async function quickPatchInquiryStatus(formData: FormData): Promise<AdminActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const parsed = parseWithSchema(quickInquiryStatusPeekSchema, {
    inquiry_id: trimmedString(formData, "inquiry_id"),
    status: trimmedString(formData, "status"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const { inquiry_id, status } = parsed.data;

  const { data: prior, error: priorErr } = await supabase
    .from("inquiries")
    .select("status")
    .eq("id", inquiry_id)
    .maybeSingle();

  if (priorErr || !prior) {
    logServerError("admin/quickPatchInquiryStatus/load", priorErr);
    return { error: CLIENT_ERROR.loadPage };
  }

  const { error } = await supabase
    .from("inquiries")
    .update({ status: status as never, updated_at: new Date().toISOString() })
    .eq("id", inquiry_id);

  if (error) {
    logServerError("admin/quickPatchInquiryStatus", error);
    return { error: CLIENT_ERROR.update };
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
  const auth = await requireStaff();
  if (!auth.ok) redirect("/admin/inquiries");
  const { supabase } = auth;

  const sourceId = trimmedString(formData, "source_inquiry_id");
  if (!z.string().uuid().safeParse(sourceId).success) {
    redirect("/admin/inquiries");
  }

  const keep_client_account = booleanFromEquals(formData, "keep_client_account");
  const keep_contact = booleanFromEquals(formData, "keep_contact");
  const keep_talent = booleanFromEquals(formData, "keep_talent");
  const clear_dates = booleanFromEquals(formData, "clear_dates");
  const clear_assigned = booleanFromEquals(formData, "clear_assigned_staff");
  const clear_staff_notes = booleanFromEquals(formData, "clear_staff_notes");
  const clear_client_message = booleanFromEquals(formData, "clear_client_message");
  const refresh_snapshots_for_new_links = booleanFromEquals(formData, "refresh_snapshots_for_new_links");
  const new_client_account_id = trimmedString(formData, "new_client_account_id");
  const new_client_contact_id = trimmedString(formData, "new_client_contact_id");

  const { data: src, error } = await supabase.from("inquiries").select("*").eq("id", sourceId).maybeSingle();

  if (error || !src) {
    redirect(`/admin/inquiries/${sourceId}?dup_err=${encodeURIComponent(CLIENT_ERROR.loadPage)}`);
  }

  const row = src as unknown as InquiryRow;

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
      .maybeSingle();
    if (acc?.name) company = acc.name;
  }

  if (refresh_snapshots_for_new_links && !keep_contact && client_contact_id) {
    const { data: c } = await supabase
      .from("client_account_contacts")
      .select("full_name, email, phone")
      .eq("id", client_contact_id)
      .maybeSingle();
    if (c?.full_name) contact_name = c.full_name;
    if (c?.email && String(c.email).trim()) contact_email = c.email;
    if (c?.phone != null) contact_phone = c.phone;
  }

  const { data: created, error: insErr } = await supabase
    .from("inquiries")
    .insert({
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
    actorUserId: auth.user.id,
    eventType: INQUIRY_AUDIT.DUPLICATED,
    payload: { new_inquiry_id: created.id },
  });

  if (keep_talent) {
    const { data: talentRows } = await supabase
      .from("inquiry_talent")
      .select("talent_profile_id, sort_order")
      .eq("inquiry_id", sourceId);
    for (const tr of talentRows ?? []) {
      await supabase.from("inquiry_talent").insert({
        inquiry_id: created.id,
        talent_profile_id: tr.talent_profile_id,
        sort_order: tr.sort_order ?? 0,
      });
    }
  }

  revalidatePath("/admin/inquiries");
  revalidatePath(`/admin/inquiries/${sourceId}`);
  redirect(`/admin/inquiries/${created.id}`);
}
