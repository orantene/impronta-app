"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  bookingStatusSchema,
  parseWithSchema,
  paymentMethodSchema,
  paymentStatusSchema,
  pricingUnitSchema,
  trimmedString,
  booleanFromEquals,
} from "@/lib/admin/validation";
import { BOOKING_AUDIT, INQUIRY_AUDIT } from "@/lib/commercial-audit-events";
import { computeBookingTalentRowTotals, sumBookingHeaderFromRows } from "@/lib/booking-pricing";
import { logBookingActivity, logInquiryActivity } from "@/lib/server/commercial-audit";
import { resolveClientAccountContactForSave } from "@/lib/server/client-account-contact-validation";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import type { SupabaseClient } from "@supabase/supabase-js";

export type BookingActionState = { error?: string } | undefined;

async function recalculateBookingTotals(
  supabase: SupabaseClient,
  bookingId: string,
  tenantId: string,
) {
  const { data: rows, error } = await supabase
    .from("booking_talent")
    .select("talent_cost_total, client_charge_total, gross_profit")
    .eq("booking_id", bookingId)
    .eq("tenant_id", tenantId);
  if (error) {
    logServerError("admin/recalculateBookingTotals", error);
    return;
  }
  const totals = sumBookingHeaderFromRows(rows ?? []);
  const { error: upErr } = await supabase
    .from("agency_bookings")
    .update({
      total_talent_cost: totals.total_talent_cost,
      total_client_revenue: totals.total_client_revenue,
      gross_profit: totals.gross_profit,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId)
    .eq("tenant_id", tenantId);
  if (upErr) logServerError("admin/recalculateBookingTotals/header", upErr);
}

const convertInquirySchema = z.object({
  inquiry_id: z.string().uuid(),
  convert_mode: z.enum(["new", "attach"]),
  existing_booking_id: z.string(),
  title: z.string(),
  booking_status: bookingStatusSchema,
  starts_at: z.string(),
  ends_at: z.string(),
  notes: z.string(),
});

export async function convertInquiryToBooking(formData: FormData): Promise<void> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) {
    redirect("/admin/inquiries");
  }
  const { supabase, user, tenantId } = auth;

  let talentIds = formData
    .getAll("talent_profile_ids")
    .map((v) => String(v).trim())
    .filter(Boolean);

  const parsed = parseWithSchema(convertInquirySchema, {
    inquiry_id: trimmedString(formData, "inquiry_id"),
    convert_mode: trimmedString(formData, "convert_mode") as "new" | "attach",
    existing_booking_id: trimmedString(formData, "existing_booking_id"),
    title: trimmedString(formData, "title"),
    booking_status: trimmedString(formData, "booking_status"),
    starts_at: trimmedString(formData, "starts_at"),
    ends_at: trimmedString(formData, "ends_at"),
    notes: trimmedString(formData, "notes"),
  });
  if ("error" in parsed) {
    redirect(
      `/admin/inquiries/${trimmedString(formData, "inquiry_id")}?convert_error=${encodeURIComponent(parsed.error)}`,
    );
  }

  const {
    inquiry_id,
    convert_mode,
    existing_booking_id,
    title,
    booking_status,
    starts_at,
    ends_at,
    notes,
  } = parsed.data;

  const markConverted = booleanFromEquals(formData, "mark_inquiry_converted");

  const { data: inq, error: inqErr } = await supabase
    .from("inquiries")
    .select(
      "tenant_id, client_user_id, client_account_id, client_contact_id, contact_name, contact_email, contact_phone, event_type_id, event_date, event_location",
    )
    .eq("id", inquiry_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (inqErr || !inq) {
    logServerError("admin/convertInquiry/loadInquiry", inqErr);
    redirect(`/admin/inquiries/${inquiry_id}?convert_error=${encodeURIComponent(CLIENT_ERROR.loadPage)}`);
  }

  // SaaS P1.B STEP 1 / STEP 3: inquiry must be in the caller's active tenant.
  // The `.eq("tenant_id", tenantId)` above makes cross-tenant IDs resolve to
  // `null` and fall through to the notFound branch above. We still keep a
  // belt-and-suspenders check that the loaded row carries a tenant_id.
  if (!inq.tenant_id) {
    logServerError(
      "admin/convertInquiry/tenant",
      new Error(`inquiry ${inquiry_id} has no tenant_id`),
    );
    redirect(`/admin/inquiries/${inquiry_id}?convert_error=${encodeURIComponent(CLIENT_ERROR.update)}`);
  }

  let bookingId: string;

  if (convert_mode === "attach") {
    if (!existing_booking_id) {
      redirect(
        `/admin/inquiries/${inquiry_id}?convert_error=${encodeURIComponent("Choose a booking to attach to.")}`,
      );
    }
    const { data: existing, error: exErr } = await supabase
      .from("agency_bookings")
      .select("id, source_inquiry_id")
      .eq("id", existing_booking_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (exErr || !existing || existing.source_inquiry_id !== inquiry_id) {
      redirect(
        `/admin/inquiries/${inquiry_id}?convert_error=${encodeURIComponent("That booking is not linked to this inquiry.")}`,
      );
    }
    bookingId = existing.id;
    if (talentIds.length > 0) {
      const { data: existingTalent } = await supabase
        .from("booking_talent")
        .select("talent_profile_id")
        .eq("booking_id", bookingId)
        .eq("tenant_id", tenantId)
        .not("talent_profile_id", "is", null);
      const have = new Set(
        (existingTalent ?? []).map((r) => r.talent_profile_id).filter(Boolean) as string[],
      );
      talentIds = talentIds.filter((id) => !have.has(id));
    }
  } else {
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
      logServerError("admin/convertInquiry/insertBooking", bookErr);
      redirect(`/admin/inquiries/${inquiry_id}?convert_error=${encodeURIComponent(CLIENT_ERROR.update)}`);
    }
    bookingId = bookingRow.id;
  }

  if (talentIds.length > 0) {
    const { data: maxSort } = await supabase
      .from("booking_talent")
      .select("sort_order")
      .eq("booking_id", bookingId)
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    let sortBase = (maxSort?.sort_order ?? -1) + 1;

    for (const tid of talentIds) {
      const { data: tp } = await supabase
        .from("talent_profiles")
        .select("display_name, profile_code")
        .eq("id", tid)
        .maybeSingle();
      const t = computeBookingTalentRowTotals(1, 0, 0);
      const { error: lineErr } = await supabase.from("booking_talent").insert({
        tenant_id: tenantId,
        booking_id: bookingId,
        talent_profile_id: tid,
        talent_name_snapshot: tp?.display_name ?? null,
        profile_code_snapshot: tp?.profile_code ?? null,
        sort_order: sortBase++,
        units: 1,
        pricing_unit: "event" as never,
        talent_cost_rate: 0,
        client_charge_rate: 0,
        talent_cost_total: t.talent_cost_total,
        client_charge_total: t.client_charge_total,
        gross_profit: t.gross_profit,
      });
      if (lineErr) {
        logServerError("admin/convertInquiry/bookingTalent", lineErr);
        redirect(`/admin/inquiries/${inquiry_id}?convert_error=${encodeURIComponent(CLIENT_ERROR.update)}`);
      }
    }
  }

  if (convert_mode === "attach") {
    await logBookingActivity(supabase, {
      bookingId,
      actorUserId: user.id,
      eventType: BOOKING_AUDIT.LINEUP_ATTACHED_FROM_INQUIRY,
      payload: { inquiry_id, talent_rows_added: talentIds.length },
    });
    await logInquiryActivity(supabase, {
      inquiryId: inquiry_id,
      actorUserId: user.id,
      eventType: INQUIRY_AUDIT.LINEUP_ADDED_TO_BOOKING,
      payload: { booking_id: bookingId, talent_rows_added: talentIds.length },
    });
  } else {
    await logBookingActivity(supabase, {
      bookingId,
      actorUserId: user.id,
      eventType: BOOKING_AUDIT.CONVERTED_FROM_INQUIRY,
      payload: { inquiry_id, talent_rows_added: talentIds.length },
    });
    await logInquiryActivity(supabase, {
      inquiryId: inquiry_id,
      actorUserId: user.id,
      eventType: INQUIRY_AUDIT.CONVERTED_TO_BOOKING,
      payload: { booking_id: bookingId, talent_rows_added: talentIds.length },
    });
  }

  await recalculateBookingTotals(supabase, bookingId, tenantId);

  if (markConverted) {
    await supabase
      .from("inquiries")
      .update({ status: "converted" as never, updated_at: new Date().toISOString() })
      .eq("id", inquiry_id)
      .eq("tenant_id", tenantId);
  }

  revalidatePath("/admin/inquiries");
  revalidatePath(`/admin/inquiries/${inquiry_id}`);
  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${bookingId}`);
  redirect(`/admin/bookings/${bookingId}`);
}

const updateBookingSchema = z.object({
  booking_id: z.string().uuid(),
  title: z.string().min(1, "Title is required."),
  status: bookingStatusSchema,
  owner_staff_id: z.string(),
  payment_method: z.string(),
  payment_status: paymentStatusSchema,
  payment_notes: z.string(),
  internal_notes: z.string(),
  client_summary: z.string(),
  currency_code: z.string().min(1),
  starts_at: z.string(),
  ends_at: z.string(),
  event_date: z.string(),
  venue_name: z.string(),
  venue_location_text: z.string(),
  client_account_id: z.string(),
  client_contact_id: z.string(),
  client_visible_at: z.string(),
});

export async function updateBooking(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user, tenantId } = auth;

  const pmRaw = trimmedString(formData, "payment_method");
  let paymentMethodVal: z.infer<typeof paymentMethodSchema> | null = null;
  if (pmRaw.length > 0) {
    const pmParsed = parseWithSchema(paymentMethodSchema, pmRaw);
    if ("error" in pmParsed) return { error: pmParsed.error };
    paymentMethodVal = pmParsed.data;
  }

  const psParsed = parseWithSchema(paymentStatusSchema, trimmedString(formData, "payment_status"));
  if ("error" in psParsed) return { error: psParsed.error };

  const parsed = parseWithSchema(updateBookingSchema, {
    booking_id: trimmedString(formData, "booking_id"),
    title: trimmedString(formData, "title"),
    status: trimmedString(formData, "status"),
    owner_staff_id: trimmedString(formData, "owner_staff_id"),
    payment_method: pmRaw,
    payment_status: psParsed.data,
    payment_notes: trimmedString(formData, "payment_notes"),
    internal_notes: trimmedString(formData, "internal_notes"),
    client_summary: trimmedString(formData, "client_summary"),
    currency_code: trimmedString(formData, "currency_code") || "MXN",
    starts_at: trimmedString(formData, "starts_at"),
    ends_at: trimmedString(formData, "ends_at"),
    event_date: trimmedString(formData, "event_date"),
    venue_name: trimmedString(formData, "venue_name"),
    venue_location_text: trimmedString(formData, "venue_location_text"),
    client_account_id: trimmedString(formData, "client_account_id"),
    client_contact_id: trimmedString(formData, "client_contact_id"),
    client_visible_at: trimmedString(formData, "client_visible_at"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const d = parsed.data;
  let accountId = d.client_account_id || null;
  const contactId = d.client_contact_id || null;

  const resolvedLinks = await resolveClientAccountContactForSave(supabase, accountId, contactId);
  if (!resolvedLinks.ok) return { error: resolvedLinks.error };
  accountId = resolvedLinks.accountId;
  const finalContactId = resolvedLinks.contactId;

  const clearClientVisible = booleanFromEquals(formData, "clear_client_visible_at");
  const nextClientVisibleAt = clearClientVisible
    ? null
    : d.client_visible_at.length > 0
      ? d.client_visible_at
      : null;

  const { data: prior, error: priorErr } = await supabase
    .from("agency_bookings")
    .select(
      "status, owner_staff_id, client_account_id, client_contact_id, payment_status, payment_method, client_visible_at",
    )
    .eq("id", d.booking_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (priorErr || !prior) {
    logServerError("admin/updateBooking/loadPrior", priorErr);
    return { error: CLIENT_ERROR.loadPage };
  }

  const refreshAcc = booleanFromEquals(formData, "refresh_account_snapshot");
  const refreshCon = booleanFromEquals(formData, "refresh_contact_snapshot");

  let client_account_name: string | null | undefined;
  let client_account_type: string | null | undefined;
  if (refreshAcc && accountId) {
    const { data: acc } = await supabase
      .from("client_accounts")
      .select("name, account_type")
      .eq("id", accountId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    client_account_name = acc?.name ?? null;
    client_account_type = acc?.account_type != null ? String(acc.account_type) : null;
  }

  let contact_name: string | null | undefined;
  let contact_email: string | null | undefined;
  let contact_phone: string | null | undefined;
  if (refreshCon && finalContactId) {
    const { data: c } = await supabase
      .from("client_account_contacts")
      .select("full_name, email, phone")
      .eq("id", finalContactId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    contact_name = c?.full_name ?? null;
    contact_email = c?.email ?? null;
    contact_phone = c?.phone ?? null;
  }

  const patch: Record<string, unknown> = {
    title: d.title,
    status: d.status as never,
    owner_staff_id: d.owner_staff_id || null,
    payment_method: paymentMethodVal as never | null,
    payment_status: d.payment_status as never,
    payment_notes: d.payment_notes || null,
    internal_notes: d.internal_notes || null,
    client_summary: d.client_summary || null,
    currency_code: d.currency_code,
    starts_at: d.starts_at.length > 0 ? d.starts_at : null,
    ends_at: d.ends_at.length > 0 ? d.ends_at : null,
    event_date: d.event_date.length > 0 ? d.event_date : null,
    venue_name: d.venue_name || null,
    venue_location_text: d.venue_location_text || null,
    client_account_id: accountId,
    client_contact_id: finalContactId,
    client_visible_at: nextClientVisibleAt,
    updated_by_staff_id: user.id,
    updated_at: new Date().toISOString(),
  };

  if (refreshAcc && accountId) {
    patch.client_account_name = client_account_name ?? null;
    patch.client_account_type = client_account_type ?? null;
  }
  if (refreshCon && finalContactId) {
    if (contact_name != null) patch.contact_name = contact_name;
    if (contact_email != null) patch.contact_email = contact_email;
    if (contact_phone != null) patch.contact_phone = contact_phone;
  }

  const { error } = await supabase
    .from("agency_bookings")
    .update(patch as never)
    .eq("id", d.booking_id)
    .eq("tenant_id", tenantId);

  if (error) {
    logServerError("admin/updateBooking", error);
    return { error: CLIENT_ERROR.update };
  }

  const actor = user.id;
  const nextOwner = d.owner_staff_id || null;
  if (prior.client_account_id !== accountId) {
    await logBookingActivity(supabase, {
      bookingId: d.booking_id,
      actorUserId: actor,
      eventType: BOOKING_AUDIT.CLIENT_ACCOUNT_CHANGED,
      payload: {
        from: prior.client_account_id,
        to: accountId,
        refresh_account_snapshot: refreshAcc,
      },
    });
  }
  if (prior.client_contact_id !== finalContactId) {
    await logBookingActivity(supabase, {
      bookingId: d.booking_id,
      actorUserId: actor,
      eventType: BOOKING_AUDIT.CLIENT_CONTACT_CHANGED,
      payload: {
        from: prior.client_contact_id,
        to: finalContactId,
        refresh_contact_snapshot: refreshCon,
      },
    });
  }
  if (prior.owner_staff_id !== nextOwner) {
    await logBookingActivity(supabase, {
      bookingId: d.booking_id,
      actorUserId: actor,
      eventType: BOOKING_AUDIT.MANAGER_CHANGED,
      payload: { from: prior.owner_staff_id, to: nextOwner },
    });
  }
  if (prior.status !== d.status) {
    await logBookingActivity(supabase, {
      bookingId: d.booking_id,
      actorUserId: actor,
      eventType: BOOKING_AUDIT.STATUS_CHANGED,
      payload: { from: prior.status, to: d.status },
    });
  }
  if (
    prior.payment_status !== d.payment_status ||
    (prior.payment_method ?? null) !== (paymentMethodVal ?? null)
  ) {
    await logBookingActivity(supabase, {
      bookingId: d.booking_id,
      actorUserId: actor,
      eventType: BOOKING_AUDIT.PAYMENT_STATE_CHANGED,
      payload: {
        payment_status: { from: prior.payment_status, to: d.payment_status },
        payment_method: { from: prior.payment_method, to: paymentMethodVal },
      },
    });
  }

  const prevVis = prior.client_visible_at ?? null;
  const nextVis = nextClientVisibleAt;
  if (String(prevVis ?? "") !== String(nextVis ?? "")) {
    await logBookingActivity(supabase, {
      bookingId: d.booking_id,
      actorUserId: actor,
      eventType: BOOKING_AUDIT.CLIENT_PORTAL_VISIBILITY_CHANGED,
      payload: { from: prevVis, to: nextVis },
    });
  }

  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${d.booking_id}`);
  return undefined;
}

const quickPeekBookingSchema = z.object({
  booking_id: z.string().uuid(),
  status: bookingStatusSchema,
  owner_staff_id: z.string(),
});

/** Minimal booking patch from list/peek panels (status + manager only). */
export async function quickUpdateBookingPeek(formData: FormData): Promise<BookingActionState> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user, tenantId } = auth;

  const parsed = parseWithSchema(quickPeekBookingSchema, {
    booking_id: trimmedString(formData, "booking_id"),
    status: trimmedString(formData, "status"),
    owner_staff_id: trimmedString(formData, "owner_staff_id"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const { booking_id, status, owner_staff_id } = parsed.data;
  const nextOwner = owner_staff_id || null;

  const { data: prior, error: priorErr } = await supabase
    .from("agency_bookings")
    .select("status, owner_staff_id")
    .eq("id", booking_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (priorErr || !prior) {
    logServerError("admin/quickUpdateBookingPeek/load", priorErr);
    return { error: CLIENT_ERROR.loadPage };
  }

  const { error } = await supabase
    .from("agency_bookings")
    .update({
      status: status as never,
      owner_staff_id: nextOwner,
      updated_at: new Date().toISOString(),
      updated_by_staff_id: user.id,
    } as never)
    .eq("id", booking_id)
    .eq("tenant_id", tenantId);

  if (error) {
    logServerError("admin/quickUpdateBookingPeek", error);
    return { error: CLIENT_ERROR.update };
  }

  const actor = user.id;
  if (prior.owner_staff_id !== nextOwner) {
    await logBookingActivity(supabase, {
      bookingId: booking_id,
      actorUserId: actor,
      eventType: BOOKING_AUDIT.MANAGER_CHANGED,
      payload: { from: prior.owner_staff_id, to: nextOwner, via: "peek" },
    });
  }
  if (prior.status !== status) {
    await logBookingActivity(supabase, {
      bookingId: booking_id,
      actorUserId: actor,
      eventType: BOOKING_AUDIT.STATUS_CHANGED,
      payload: { from: prior.status, to: status, via: "peek" },
    });
  }

  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${booking_id}`);
  return undefined;
}

const assignBookingToMeSchema = z.object({
  booking_id: z.string().uuid(),
});

export async function assignBookingToCurrentStaff(formData: FormData): Promise<void> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return;
  const { supabase, user, tenantId } = auth;

  const parsed = parseWithSchema(assignBookingToMeSchema, {
    booking_id: trimmedString(formData, "booking_id"),
  });
  if ("error" in parsed) return;

  const { booking_id } = parsed.data;

  const { data: prior, error: priorErr } = await supabase
    .from("agency_bookings")
    .select("owner_staff_id")
    .eq("id", booking_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (priorErr || !prior) {
    logServerError("admin/assignBookingToCurrentStaff/load", priorErr);
    return;
  }

  const { error } = await supabase
    .from("agency_bookings")
    .update({
      owner_staff_id: user.id,
      updated_at: new Date().toISOString(),
      updated_by_staff_id: user.id,
    } as never)
    .eq("id", booking_id)
    .eq("tenant_id", tenantId);

  if (error) {
    logServerError("admin/assignBookingToCurrentStaff", error);
    return;
  }

  if (prior.owner_staff_id !== user.id) {
    await logBookingActivity(supabase, {
      bookingId: booking_id,
      actorUserId: user.id,
      eventType: BOOKING_AUDIT.MANAGER_CHANGED,
      payload: { from: prior.owner_staff_id, to: user.id, via: "assign_to_me" },
    });
  }

  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${booking_id}`);
}

export async function assignBookingToCurrentStaffForm(formData: FormData): Promise<void> {
  await assignBookingToCurrentStaff(formData);
}

const patchBookingEntityLinksSchema = z.object({
  booking_id: z.string().uuid(),
  patch_mode: z.enum(["platform_client", "billing_account", "contact", "source_inquiry"]),
  client_user_id: z.string(),
  client_account_id: z.string(),
  client_contact_id: z.string(),
  source_inquiry_id: z.string(),
});

/** Targeted CRM / source inquiry updates from reassignment sheets. */
export async function patchBookingEntityLinks(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user, tenantId } = auth;

  const parsed = parseWithSchema(patchBookingEntityLinksSchema, {
    booking_id: trimmedString(formData, "booking_id"),
    patch_mode: trimmedString(formData, "patch_mode"),
    client_user_id: trimmedString(formData, "client_user_id"),
    client_account_id: trimmedString(formData, "client_account_id"),
    client_contact_id: trimmedString(formData, "client_contact_id"),
    source_inquiry_id: trimmedString(formData, "source_inquiry_id"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const { booking_id, patch_mode } = parsed.data;

  const { data: row, error: loadErr } = await supabase
    .from("agency_bookings")
    .select("client_user_id, client_account_id, client_contact_id, source_inquiry_id")
    .eq("id", booking_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (loadErr || !row) {
    logServerError("admin/patchBookingEntityLinks/load", loadErr);
    return { error: CLIENT_ERROR.loadPage };
  }

  let client_user_id = row.client_user_id as string | null;
  let client_account_id = row.client_account_id as string | null;
  let client_contact_id = row.client_contact_id as string | null;
  let source_inquiry_id = row.source_inquiry_id as string | null;
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
  } else if (patch_mode === "contact") {
    const nextContact = trimmedString(formData, "client_contact_id") || null;
    const resolved = await resolveClientAccountContactForSave(supabase, client_account_id, nextContact);
    if (!resolved.ok) return { error: resolved.error };
    client_account_id = resolved.accountId;
    client_contact_id = resolved.contactId;
  } else {
    const raw = trimmedString(formData, "source_inquiry_id");
    if (raw.length === 0) {
      source_inquiry_id = null;
    } else {
      const uuidOk = z.string().uuid().safeParse(raw);
      if (!uuidOk.success) return { error: "Source inquiry must be a valid id or left blank." };
      const { data: inqExists } = await supabase
        .from("inquiries")
        .select("id")
        .eq("id", raw)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!inqExists) return { error: "That inquiry was not found." };
      source_inquiry_id = raw;
    }
  }

  const patch: Record<string, unknown> = {
    client_user_id,
    client_account_id,
    client_contact_id,
    source_inquiry_id,
    updated_at: new Date().toISOString(),
    updated_by_staff_id: user.id,
  };

  if (patch_mode !== "source_inquiry") {
    if (booleanFromEquals(formData, "refresh_account_snapshot") && client_account_id) {
      const { data: acc } = await supabase
        .from("client_accounts")
        .select("name, account_type")
        .eq("id", client_account_id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (acc?.name) patch.client_account_name = acc.name;
      if (acc?.account_type != null) patch.client_account_type = String(acc.account_type);
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
  }

  const { error } = await supabase
    .from("agency_bookings")
    .update(patch as never)
    .eq("id", booking_id)
    .eq("tenant_id", tenantId);
  if (error) {
    logServerError("admin/patchBookingEntityLinks", error);
    return { error: CLIENT_ERROR.update };
  }

  const actor = user.id;
  const refreshAccSnap = booleanFromEquals(formData, "refresh_account_snapshot");
  const refreshConSnap = booleanFromEquals(formData, "refresh_contact_snapshot");
  if (priorAcc !== client_account_id) {
    await logBookingActivity(supabase, {
      bookingId: booking_id,
      actorUserId: actor,
      eventType: BOOKING_AUDIT.CLIENT_ACCOUNT_CHANGED,
      payload: { from: priorAcc, to: client_account_id, via: "reassign_sheet", refresh_account_snapshot: refreshAccSnap },
    });
  }
  if (priorCon !== client_contact_id) {
    await logBookingActivity(supabase, {
      bookingId: booking_id,
      actorUserId: actor,
      eventType: BOOKING_AUDIT.CLIENT_CONTACT_CHANGED,
      payload: { from: priorCon, to: client_contact_id, via: "reassign_sheet", refresh_contact_snapshot: refreshConSnap },
    });
  }

  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${booking_id}`);
  return undefined;
}

const num0 = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? 0 : v),
  z.coerce.number(),
);

const bookingTalentRowSchema = z.object({
  booking_talent_id: z.string().uuid(),
  booking_id: z.string().uuid(),
  role_label: z.string(),
  pricing_unit: pricingUnitSchema,
  units: num0.pipe(z.number().nonnegative()),
  talent_cost_rate: num0,
  client_charge_rate: num0,
  notes: z.string(),
});

export async function saveBookingTalentRow(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user, tenantId } = auth;

  const parsed = parseWithSchema(bookingTalentRowSchema, {
    booking_talent_id: trimmedString(formData, "booking_talent_id"),
    booking_id: trimmedString(formData, "booking_id"),
    role_label: trimmedString(formData, "role_label"),
    pricing_unit: trimmedString(formData, "pricing_unit"),
    units: trimmedString(formData, "units") || "0",
    talent_cost_rate: trimmedString(formData, "talent_cost_rate") || "0",
    client_charge_rate: trimmedString(formData, "client_charge_rate") || "0",
    notes: trimmedString(formData, "notes"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const d = parsed.data;

  const { data: rowBefore } = await supabase
    .from("booking_talent")
    .select("talent_profile_id, units, pricing_unit, talent_cost_rate, client_charge_rate, role_label")
    .eq("id", d.booking_talent_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const totals = computeBookingTalentRowTotals(d.units, d.talent_cost_rate, d.client_charge_rate);

  const { error } = await supabase
    .from("booking_talent")
    .update({
      role_label: d.role_label || null,
      pricing_unit: d.pricing_unit as never,
      units: d.units,
      talent_cost_rate: d.talent_cost_rate,
      client_charge_rate: d.client_charge_rate,
      talent_cost_total: totals.talent_cost_total,
      client_charge_total: totals.client_charge_total,
      gross_profit: totals.gross_profit,
      notes: d.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", d.booking_talent_id)
    .eq("tenant_id", tenantId);

  if (error) {
    logServerError("admin/saveBookingTalentRow", error);
    return { error: CLIENT_ERROR.update };
  }

  await logBookingActivity(supabase, {
    bookingId: d.booking_id,
    actorUserId: user.id,
    eventType: BOOKING_AUDIT.TALENT_ROW_SAVED,
    payload: {
      booking_talent_id: d.booking_talent_id,
      talent_profile_id: rowBefore?.talent_profile_id ?? null,
      before: rowBefore,
      after: {
        units: d.units,
        pricing_unit: d.pricing_unit,
        talent_cost_rate: d.talent_cost_rate,
        client_charge_rate: d.client_charge_rate,
        role_label: d.role_label || null,
      },
    },
  });

  await recalculateBookingTotals(supabase, d.booking_id, tenantId);
  revalidatePath(`/admin/bookings/${d.booking_id}`);
  revalidatePath("/admin/bookings");
  return undefined;
}

const newBookingTalentSchema = z.object({
  booking_id: z.string().uuid(),
  talent_profile_id: z.string(),
});

export async function addBookingTalentRow(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user, tenantId } = auth;

  const parsed = parseWithSchema(newBookingTalentSchema, {
    booking_id: trimmedString(formData, "booking_id"),
    talent_profile_id: trimmedString(formData, "talent_profile_id"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const { booking_id, talent_profile_id } = parsed.data;
  if (!talent_profile_id) {
    return { error: "Select a talent." };
  }

  const { data: bookingRow } = await supabase
    .from("agency_bookings")
    .select("id")
    .eq("id", booking_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!bookingRow) {
    return { error: "Booking not found for this tenant." };
  }

  const { data: maxSort } = await supabase
    .from("booking_talent")
    .select("sort_order")
    .eq("booking_id", booking_id)
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = (maxSort?.sort_order ?? -1) + 1;

  const { data: tp } = await supabase
    .from("talent_profiles")
    .select("display_name, profile_code")
    .eq("id", talent_profile_id)
    .maybeSingle();

  const t = computeBookingTalentRowTotals(1, 0, 0);
  const { error } = await supabase.from("booking_talent").insert({
    tenant_id: tenantId,
    booking_id,
    talent_profile_id,
    talent_name_snapshot: tp?.display_name ?? null,
    profile_code_snapshot: tp?.profile_code ?? null,
    sort_order,
    units: 1,
    pricing_unit: "event" as never,
    talent_cost_rate: 0,
    client_charge_rate: 0,
    talent_cost_total: t.talent_cost_total,
    client_charge_total: t.client_charge_total,
    gross_profit: t.gross_profit,
  });

  if (error) {
    logServerError("admin/addBookingTalentRow", error);
    return { error: CLIENT_ERROR.update };
  }

  await logBookingActivity(supabase, {
    bookingId: booking_id,
    actorUserId: user.id,
    eventType: BOOKING_AUDIT.TALENT_ROW_ADDED,
    payload: { talent_profile_id },
  });

  await recalculateBookingTotals(supabase, booking_id, tenantId);
  revalidatePath(`/admin/bookings/${booking_id}`);
  revalidatePath("/admin/bookings");
  return undefined;
}

const deleteBookingTalentSchema = z.object({
  booking_talent_id: z.string().uuid(),
  booking_id: z.string().uuid(),
});

export async function deleteBookingTalentRow(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user, tenantId } = auth;

  const parsed = parseWithSchema(deleteBookingTalentSchema, {
    booking_talent_id: trimmedString(formData, "booking_talent_id"),
    booking_id: trimmedString(formData, "booking_id"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const { booking_talent_id, booking_id } = parsed.data;

  const { data: rowRm } = await supabase
    .from("booking_talent")
    .select("talent_profile_id, profile_code_snapshot, talent_name_snapshot")
    .eq("id", booking_talent_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const { error } = await supabase
    .from("booking_talent")
    .delete()
    .eq("id", booking_talent_id)
    .eq("tenant_id", tenantId);
  if (error) {
    logServerError("admin/deleteBookingTalentRow", error);
    return { error: CLIENT_ERROR.update };
  }

  await logBookingActivity(supabase, {
    bookingId: booking_id,
    actorUserId: user.id,
    eventType: BOOKING_AUDIT.TALENT_ROW_REMOVED,
    payload: {
      booking_talent_id,
      talent_profile_id: rowRm?.talent_profile_id ?? null,
      profile_code_snapshot: rowRm?.profile_code_snapshot ?? null,
    },
  });

  await recalculateBookingTotals(supabase, booking_id, tenantId);
  revalidatePath(`/admin/bookings/${booking_id}`);
  revalidatePath("/admin/bookings");
  return undefined;
}

const manualBookingSchema = z.object({
  title: z.string().min(1, "Title is required."),
  booking_status: bookingStatusSchema,
  currency_code: z.string().min(1),
  client_account_id: z.string(),
  client_contact_id: z.string(),
  owner_staff_id: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  event_date: z.string(),
  venue_name: z.string(),
  venue_location_text: z.string(),
  internal_notes: z.string(),
});

export async function createManualBooking(formData: FormData): Promise<void> {
  const returnTo = trimmedString(formData, "return_to") || "/admin/bookings/new";
  // SaaS P1.B STEP 1: manual bookings have no source inquiry, so tenant_id
  // must come from the admin's active workspace (switcher cookie / primary
  // membership). Refuse if no scope is resolvable.
  const auth = await requireStaffTenantAction();
  if (!auth.ok) {
    redirect(`${returnTo}?err=${encodeURIComponent(auth.error)}`);
  }
  const { supabase, user, tenantId } = auth;

  const parsed = parseWithSchema(manualBookingSchema, {
    title: trimmedString(formData, "title"),
    booking_status: trimmedString(formData, "booking_status"),
    currency_code: trimmedString(formData, "currency_code") || "MXN",
    client_account_id: trimmedString(formData, "client_account_id"),
    client_contact_id: trimmedString(formData, "client_contact_id"),
    owner_staff_id: trimmedString(formData, "owner_staff_id"),
    starts_at: trimmedString(formData, "starts_at"),
    ends_at: trimmedString(formData, "ends_at"),
    event_date: trimmedString(formData, "event_date"),
    venue_name: trimmedString(formData, "venue_name"),
    venue_location_text: trimmedString(formData, "venue_location_text"),
    internal_notes: trimmedString(formData, "internal_notes"),
  });
  if ("error" in parsed) {
    redirect(`${returnTo}?err=${encodeURIComponent(parsed.error)}`);
  }

  const d = parsed.data;
  const redirectAfter = trimmedString(formData, "redirect_after_create") || "detail";

  const clientUserRaw = trimmedString(formData, "client_user_id");
  let client_user_id: string | null = clientUserRaw.length > 0 ? clientUserRaw : null;
  if (client_user_id) {
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", client_user_id)
      .eq("app_role", "client")
      .maybeSingle();
    if (profErr || !prof) {
      redirect(`${returnTo}?err=${encodeURIComponent("That user is not a platform client.")}`);
    }
  }

  let accountId = d.client_account_id || null;
  let contactId = d.client_contact_id || null;

  const manualResolved = await resolveClientAccountContactForSave(supabase, accountId, contactId);
  if (!manualResolved.ok) {
    redirect(`${returnTo}?err=${encodeURIComponent(manualResolved.error)}`);
  }
  accountId = manualResolved.accountId;
  contactId = manualResolved.contactId;

  const populate = booleanFromEquals(formData, "populate_snapshots");

  let client_account_name: string | null = null;
  let client_account_type: string | null = null;
  let contact_name: string | null = null;
  let contact_email: string | null = null;
  let contact_phone: string | null = null;

  if (populate && accountId) {
    const { data: acc } = await supabase
      .from("client_accounts")
      .select("name, account_type")
      .eq("id", accountId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    client_account_name = acc?.name ?? null;
    client_account_type = acc?.account_type != null ? String(acc.account_type) : null;
  }
  if (populate && contactId) {
    const { data: c } = await supabase
      .from("client_account_contacts")
      .select("full_name, email, phone")
      .eq("id", contactId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    contact_name = c?.full_name ?? null;
    contact_email = c?.email ?? null;
    contact_phone = c?.phone ?? null;
  }

  const { data: bookingRow, error: bookErr } = await supabase
    .from("agency_bookings")
    .insert({
      tenant_id: tenantId,
      source_inquiry_id: null,
      client_account_id: accountId,
      client_contact_id: contactId,
      client_user_id,
      owner_staff_id: d.owner_staff_id || user.id,
      title: d.title,
      status: d.booking_status as never,
      currency_code: d.currency_code,
      starts_at: d.starts_at.length > 0 ? d.starts_at : null,
      ends_at: d.ends_at.length > 0 ? d.ends_at : null,
      event_date: d.event_date.length > 0 ? d.event_date : null,
      venue_name: d.venue_name || null,
      venue_location_text: d.venue_location_text || null,
      internal_notes: d.internal_notes || null,
      notes: d.internal_notes || null,
      created_by_staff_id: user.id,
      client_account_name,
      client_account_type,
      contact_name,
      contact_email,
      contact_phone,
    })
    .select("id")
    .single();

  if (bookErr || !bookingRow) {
    logServerError("admin/createManualBooking", bookErr);
    redirect(`${returnTo}?err=${encodeURIComponent(CLIENT_ERROR.update)}`);
  }

  const talentIds = formData
    .getAll("talent_profile_ids")
    .map((v) => String(v).trim())
    .filter(Boolean);

  let sortOrder = 0;
  for (const tid of talentIds) {
    const { data: tp } = await supabase
      .from("talent_profiles")
      .select("display_name, profile_code")
      .eq("id", tid)
      .maybeSingle();
    const t = computeBookingTalentRowTotals(1, 0, 0);
    const { error: lineErr } = await supabase.from("booking_talent").insert({
      tenant_id: tenantId,
      booking_id: bookingRow.id,
      talent_profile_id: tid,
      talent_name_snapshot: tp?.display_name ?? null,
      profile_code_snapshot: tp?.profile_code ?? null,
      sort_order: sortOrder++,
      units: 1,
      pricing_unit: "event" as never,
      talent_cost_rate: 0,
      client_charge_rate: 0,
      talent_cost_total: t.talent_cost_total,
      client_charge_total: t.client_charge_total,
      gross_profit: t.gross_profit,
    });
    if (lineErr) {
      logServerError("admin/createManualBooking/talent", lineErr);
      redirect(`${returnTo}?err=${encodeURIComponent(CLIENT_ERROR.update)}`);
    }
  }

  await recalculateBookingTotals(supabase, bookingRow.id, tenantId);

  await logBookingActivity(supabase, {
    bookingId: bookingRow.id,
    actorUserId: user.id,
    eventType: BOOKING_AUDIT.CREATED_MANUAL,
    payload: { talent_rows: talentIds.length },
  });

  revalidatePath("/admin/bookings");
  if (redirectAfter === "list") {
    redirect("/admin/bookings");
  }
  redirect(`/admin/bookings/${bookingRow.id}`);
}

export async function duplicateBooking(formData: FormData): Promise<void> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) redirect("/admin/bookings");
  const { supabase, user, tenantId } = auth;

  const sourceId = trimmedString(formData, "source_booking_id");
  if (!z.string().uuid().safeParse(sourceId).success) {
    redirect("/admin/bookings");
  }

  const keep_client_links = booleanFromEquals(formData, "keep_client_links");
  const keep_source_inquiry = booleanFromEquals(formData, "keep_source_inquiry");
  const keep_talent = booleanFromEquals(formData, "keep_talent");
  const keep_pricing = booleanFromEquals(formData, "keep_pricing");
  const clear_schedule = booleanFromEquals(formData, "clear_schedule");
  const refresh_new_links = booleanFromEquals(formData, "refresh_snapshots_for_new_links");

  const newTitle = trimmedString(formData, "new_title");
  const newAccountId = trimmedString(formData, "new_client_account_id");
  const newContactId = trimmedString(formData, "new_client_contact_id");

  // SaaS P1.B STEP 3: scope source read to the caller's active tenant. A
  // cross-tenant source id resolves to `null` and fails fast below — this
  // replaces the earlier post-load `requireStaffOfTenant` check.
  const { data: src, error: srcErr } = await supabase
    .from("agency_bookings")
    .select(
      `
      id,
      tenant_id,
      source_inquiry_id,
      client_account_id,
      client_contact_id,
      client_user_id,
      owner_staff_id,
      title,
      currency_code,
      contact_name,
      contact_email,
      contact_phone,
      client_account_name,
      client_account_type,
      event_type_id,
      event_date,
      venue_name,
      venue_address,
      venue_location_text,
      venue_location_id,
      client_summary,
      internal_notes,
      starts_at,
      ends_at
    `,
    )
    .eq("id", sourceId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (srcErr || !src) {
    redirect(`/admin/bookings/${sourceId}?dup_err=${encodeURIComponent(CLIENT_ERROR.loadPage)}`);
  }

  const { data: lines } = await supabase
    .from("booking_talent")
    .select(
      "talent_profile_id, talent_name_snapshot, profile_code_snapshot, role_label, pricing_unit, units, talent_cost_rate, client_charge_rate, talent_cost_total, client_charge_total, gross_profit, notes, sort_order",
    )
    .eq("booking_id", sourceId)
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true });

  let client_account_id: string | null = keep_client_links ? src.client_account_id : newAccountId || null;
  let client_contact_id: string | null = keep_client_links ? src.client_contact_id : newContactId || null;

  const dupResolved = await resolveClientAccountContactForSave(supabase, client_account_id, client_contact_id);
  if (!dupResolved.ok) {
    redirect(`/admin/bookings/${sourceId}?dup_err=${encodeURIComponent(dupResolved.error)}`);
  }
  client_account_id = dupResolved.accountId;
  client_contact_id = dupResolved.contactId;

  let client_account_name: string | null = src.client_account_name;
  let client_account_type: string | null = src.client_account_type;
  let contact_name: string | null = src.contact_name;
  let contact_email: string | null = src.contact_email;
  let contact_phone: string | null = src.contact_phone;

  if (!keep_client_links && refresh_new_links) {
    if (client_account_id) {
      const { data: acc } = await supabase
        .from("client_accounts")
        .select("name, account_type")
        .eq("id", client_account_id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      client_account_name = acc?.name ?? null;
      client_account_type = acc?.account_type != null ? String(acc.account_type) : null;
    }
    if (client_contact_id) {
      const { data: c } = await supabase
        .from("client_account_contacts")
        .select("full_name, email, phone")
        .eq("id", client_contact_id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      contact_name = c?.full_name ?? contact_name;
      contact_email = c?.email ?? contact_email;
      contact_phone = c?.phone ?? contact_phone;
    }
  }

  const { data: inserted, error: insErr } = await supabase
    .from("agency_bookings")
    .insert({
      tenant_id: tenantId,
      source_inquiry_id: keep_source_inquiry ? src.source_inquiry_id : null,
      client_account_id,
      client_contact_id,
      client_user_id: src.client_user_id,
      owner_staff_id: src.owner_staff_id,
      title: newTitle || `${src.title} (copy)`,
      status: "draft" as never,
      currency_code: src.currency_code,
      payment_status: "unpaid" as never,
      payment_method: null,
      payment_notes: null,
      contact_name,
      contact_email,
      contact_phone,
      client_account_name,
      client_account_type,
      event_type_id: src.event_type_id,
      event_date: clear_schedule ? null : src.event_date,
      venue_name: clear_schedule ? null : src.venue_name,
      venue_address: clear_schedule ? null : src.venue_address,
      venue_location_text: clear_schedule ? null : src.venue_location_text,
      venue_location_id: clear_schedule ? null : src.venue_location_id,
      client_summary: src.client_summary,
      internal_notes: src.internal_notes,
      notes: src.internal_notes,
      starts_at: clear_schedule ? null : src.starts_at,
      ends_at: clear_schedule ? null : src.ends_at,
      duplicate_of_booking_id: src.id,
      created_by_staff_id: user.id,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    logServerError("admin/duplicateBooking", insErr);
    redirect(`/admin/bookings/${sourceId}?dup_err=${encodeURIComponent(CLIENT_ERROR.update)}`);
  }

  if (keep_talent && lines?.length) {
    for (const row of lines) {
      const rates = keep_pricing
        ? {
            talent_cost_rate: row.talent_cost_rate,
            client_charge_rate: row.client_charge_rate,
            talent_cost_total: row.talent_cost_total,
            client_charge_total: row.client_charge_total,
            gross_profit: row.gross_profit,
          }
        : (() => {
            const t = computeBookingTalentRowTotals(Number(row.units) || 0, 0, 0);
            return {
              talent_cost_rate: 0,
              client_charge_rate: 0,
              talent_cost_total: t.talent_cost_total,
              client_charge_total: t.client_charge_total,
              gross_profit: t.gross_profit,
            };
          })();

      await supabase.from("booking_talent").insert({
        tenant_id: tenantId,
        booking_id: inserted.id,
        talent_profile_id: row.talent_profile_id,
        talent_name_snapshot: row.talent_name_snapshot,
        profile_code_snapshot: row.profile_code_snapshot,
        role_label: row.role_label,
        pricing_unit: row.pricing_unit as never,
        units: row.units,
        ...rates,
        notes: row.notes,
        sort_order: row.sort_order,
      });
    }
  }

  await recalculateBookingTotals(supabase, inserted.id, tenantId);

  await logBookingActivity(supabase, {
    bookingId: inserted.id,
    actorUserId: user.id,
    eventType: BOOKING_AUDIT.DUPLICATED,
    payload: {
      source_booking_id: sourceId,
      keep_client_links,
      keep_source_inquiry,
      keep_talent,
      keep_pricing,
      clear_schedule,
    },
  });

  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${sourceId}`);
  redirect(`/admin/bookings/${inserted.id}`);
}
