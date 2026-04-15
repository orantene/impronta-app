"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import { buildInquiryContext } from "@/lib/inquiries";
import { getPublicSettings } from "@/lib/public-settings";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { createTranslator } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import { logAnalyticsEventServer } from "@/lib/analytics/server-log";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";
import { submitInquiry } from "@/lib/inquiry/inquiry-engine";

const GUEST_HEADER = "x-impronta-guest";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type InquiryFormState = { error?: string } | undefined;

type GuestClientProvisionResult =
  | { status: "matched"; clientUserId: string }
  | { status: "created"; clientUserId: string }
  | { status: "unlinked"; clientUserId: null };

function generateGuestClientPassword() {
  return randomBytes(18).toString("base64url");
}

async function ensureGuestClientByEmail(args: {
  email: string;
  name: string;
  company: string;
  phone: string;
}): Promise<GuestClientProvisionResult> {
  const admin = createServiceRoleClient();
  if (!admin) {
    return { status: "unlinked", clientUserId: null };
  }

  const normalizedEmail = args.email.trim().toLowerCase();
  const { data: matchRows, error: matchErr } = await admin.rpc("find_auth_user_identity_by_email", {
    p_email: normalizedEmail,
  });

  if (matchErr) {
    logServerError("directory/ensureGuestClientByEmail/find", matchErr);
    return { status: "unlinked", clientUserId: null };
  }

  const match = Array.isArray(matchRows) ? matchRows[0] : null;
  if (match?.user_id) {
    const role = match.app_role as string | null;
    if (role === "super_admin" || role === "agency_staff" || role === "talent") {
      return { status: "unlinked", clientUserId: null };
    }

    const userId = match.user_id as string;
    const nextDisplayName = (match.display_name as string | null)?.trim() || args.name;
    const profilePatch: Record<string, unknown> = {
      display_name: nextDisplayName,
      app_role: "client",
      account_status:
        match.account_status === "active" ? "active" : "onboarding",
      updated_at: new Date().toISOString(),
    };
    if (match.account_status !== "active") {
      profilePatch.onboarding_completed_at = null;
    }

    const { error: profileErr } = await admin
      .from("profiles")
      .update(profilePatch)
      .eq("id", userId);

    if (profileErr) {
      logServerError("directory/ensureGuestClientByEmail/profileUpdate", profileErr);
      return { status: "unlinked", clientUserId: null };
    }

    const { error: clientProfileErr } = await admin
      .from("client_profiles")
      .upsert(
        {
          user_id: userId,
          company_name: args.company || null,
          phone: args.phone || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (clientProfileErr) {
      logServerError("directory/ensureGuestClientByEmail/clientProfileUpsert", clientProfileErr);
      return { status: "unlinked", clientUserId: null };
    }

    return { status: "matched", clientUserId: userId };
  }

  const created = await admin.auth.admin.createUser({
    email: normalizedEmail,
    password: generateGuestClientPassword(),
    email_confirm: true,
    user_metadata: {
      full_name: args.name,
      name: args.name,
    },
  });

  if (created.error || !created.data.user?.id) {
    logServerError("directory/ensureGuestClientByEmail/createUser", created.error);
    return { status: "unlinked", clientUserId: null };
  }

  const userId = created.data.user.id;

  const { error: profileErr } = await admin
    .from("profiles")
    .update({
      display_name: args.name,
      app_role: "client",
      account_status: "onboarding",
      onboarding_completed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (profileErr) {
    logServerError("directory/ensureGuestClientByEmail/profileCreatePatch", profileErr);
    return { status: "unlinked", clientUserId: null };
  }

  const { error: clientProfileErr } = await admin
    .from("client_profiles")
    .upsert(
      {
        user_id: userId,
        company_name: args.company || null,
        phone: args.phone || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (clientProfileErr) {
    logServerError("directory/ensureGuestClientByEmail/clientProfileCreate", clientProfileErr);
    return { status: "unlinked", clientUserId: null };
  }

  return { status: "created", clientUserId: userId };
}

function parseInquiryFields(formData: FormData) {
  const contact_name = String(formData.get("contact_name") ?? "").trim();
  const contact_email = String(formData.get("contact_email") ?? "").trim();
  const contact_phone = String(formData.get("contact_phone") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim();
  const raw_query = String(formData.get("raw_query") ?? "").trim();
  const directory_context_raw = String(formData.get("directory_context") ?? "").trim();
  const event_type_raw = String(formData.get("event_type_id") ?? "").trim();
  const event_type_id = event_type_raw.length > 0 ? event_type_raw : null;
  const event_date_raw = String(formData.get("event_date") ?? "").trim();
  const event_date = event_date_raw.length > 0 ? event_date_raw : null;
  const event_location = String(formData.get("event_location") ?? "").trim();
  const quantity_raw = String(formData.get("quantity") ?? "").trim();
  const quantity_value = Number.parseInt(quantity_raw, 10);
  const quantity =
    Number.isFinite(quantity_value) && quantity_value > 0 ? quantity_value : null;
  const message = String(formData.get("message") ?? "").trim();
  const source_page = String(formData.get("source_page") ?? "").trim();

  let directory_context:
    | {
        q: string | null;
        locationSlug: string | null;
        sort: string | null;
        taxonomyTermIds: string[];
      }
    | null = null;

  if (directory_context_raw) {
    try {
      const parsed = JSON.parse(directory_context_raw) as {
        q?: string;
        locationSlug?: string;
        sort?: string;
        taxonomyTermIds?: string[];
      };
      directory_context = {
        q: parsed.q?.trim() || null,
        locationSlug: parsed.locationSlug?.trim() || null,
        sort: parsed.sort?.trim() || null,
        taxonomyTermIds: Array.isArray(parsed.taxonomyTermIds)
          ? parsed.taxonomyTermIds.filter((item): item is string => typeof item === "string")
          : [],
      };
    } catch {
      directory_context = null;
    }
  }

  return {
    company,
    contact_email,
    contact_name,
    contact_phone,
    directory_context,
    event_date,
    event_location,
    event_type_id,
    message,
    quantity,
    raw_query,
    source_page,
  };
}

export async function setTalentSaved(
  talentProfileId: string,
  saved: boolean,
): Promise<ActionResult> {
  const guestKey = (await headers()).get(GUEST_HEADER);
  const supabase = await getCachedServerSupabase();
  const pub = createPublicSupabaseClient();

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      if (saved) {
        const { error } = await supabase.from("saved_talent").upsert(
          {
            client_user_id: user.id,
            talent_profile_id: talentProfileId,
          },
          {
            onConflict: "client_user_id,talent_profile_id",
            ignoreDuplicates: true,
          },
        );
        if (error) {
          logServerError("directory/setTalentSaved/client-insert", error);
          const t = createTranslator(await getRequestLocale());
          return { ok: false, error: t("public.errors.saveTalent") };
        }
      } else {
        const { error } = await supabase
          .from("saved_talent")
          .delete()
          .eq("client_user_id", user.id)
          .eq("talent_profile_id", talentProfileId);
        if (error) {
          logServerError("directory/setTalentSaved/client-delete", error);
          const t = createTranslator(await getRequestLocale());
          return { ok: false, error: t("public.errors.saveTalent") };
        }
      }
      revalidatePath("/directory");
      revalidatePath("/client");
      revalidatePath("/client/saved");
      return { ok: true };
    }
  }

  if (!pub || !guestKey) {
    const t = createTranslator(await getRequestLocale());
    return {
      ok: false,
      error: t("public.forms.inquiry.unableToSaveTrySignIn"),
    };
  }

  if (saved) {
    const { error } = await pub.rpc("guest_add_saved_talent", {
      p_session_key: guestKey,
      p_talent_profile_id: talentProfileId,
    });
    if (error) {
      logServerError("directory/setTalentSaved/guest-add", error);
      const t = createTranslator(await getRequestLocale());
      return { ok: false, error: t("public.errors.saveTalent") };
    }
  } else {
    const { error } = await pub.rpc("guest_remove_saved_talent", {
      p_session_key: guestKey,
      p_talent_profile_id: talentProfileId,
    });
    if (error) {
      logServerError("directory/setTalentSaved/guest-remove", error);
      const t = createTranslator(await getRequestLocale());
      return { ok: false, error: t("public.errors.saveTalent") };
    }
  }

  revalidatePath("/directory");
  revalidatePath("/client/saved");
  return { ok: true };
}

export async function submitClientInquiry(
  _prev: InquiryFormState,
  formData: FormData,
): Promise<InquiryFormState> {
  const t = createTranslator(await getRequestLocale());
  const publicSettings = await getPublicSettings();
  if (!publicSettings.inquiriesOpen) {
    return { error: t("public.forms.inquiry.inquiriesClosed") };
  }

  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    return { error: t("public.forms.inquiry.supabaseNotConfigured") };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: t("public.forms.inquiry.mustBeSignedIn") };
  }

  const rawIds = formData.get("talent_ids");
  const talentIds = String(rawIds ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (talentIds.length === 0) {
    return { error: t("public.forms.inquiry.selectAtLeastOneTalent") };
  }

  const {
    company,
    contact_email,
    contact_name,
    contact_phone,
    directory_context,
    event_date,
    event_location,
    event_type_id,
    message,
    quantity,
    raw_query,
    source_page,
  } = parseInquiryFields(formData);

  if (!contact_name || !contact_email) {
    return { error: t("public.forms.inquiry.nameAndEmailRequired") };
  }

  const [{ data: talentRows }, { data: eventTypeRow }] = await Promise.all([
    supabase
      .from("talent_profiles")
      .select("id, profile_code, display_name")
      .in("id", talentIds),
    event_type_id
      ? supabase
          .from("taxonomy_terms")
          .select("id, name_en")
          .eq("id", event_type_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const interpreted_query = buildInquiryContext({
    eventDate: event_date,
    eventLocation: event_location,
    eventTypeId: event_type_id,
    eventTypeName: eventTypeRow?.name_en ?? null,
    quantity,
    rawQuery: raw_query,
    directorySearch: directory_context
      ? {
          q: directory_context.q,
          locationSlug: directory_context.locationSlug,
          sort: directory_context.sort,
          taxonomyTermIds: directory_context.taxonomyTermIds,
        }
      : null,
    selectedTalents: (talentRows ?? []).map((talent) => ({
      id: talent.id,
      profileCode: talent.profile_code,
      displayName: talent.display_name,
    })),
    sourcePage: source_page || "/directory",
    submittedVia: "client",
  });

  const admin = createServiceRoleClient();
  if (!admin) {
    return { error: t("public.forms.inquiry.supabaseNotConfigured") };
  }

  const v2 = await submitInquiry(admin, {
    contact_name,
    contact_email,
    contact_phone: contact_phone || null,
    company: company || null,
    event_date: event_date || null,
    event_location: event_location || null,
    quantity: quantity ?? null,
    message: message || null,
    event_type_id: event_type_id ?? null,
    raw_ai_query: raw_query || null,
    interpreted_query,
    source_page: source_page || "/directory",
    source_channel: "directory_client",
    client_user_id: user.id,
    talent_profile_ids: talentIds,
    actorUserId: user.id,
  });
  if (!v2.success) {
    logServerError("directory/submitClientInquiry/v2", new Error(JSON.stringify(v2)));
    return { error: t("public.errors.inquiry") };
  }

  await supabase
    .from("saved_talent")
    .delete()
    .eq("client_user_id", user.id)
    .in("talent_profile_id", talentIds);

  const locale = await getRequestLocale();
  await logAnalyticsEventServer({
    name: PRODUCT_ANALYTICS_EVENTS.submit_inquiry,
    payload: {
      locale,
      talent_id: talentIds[0],
      inquiry_type: "directory_client_v2",
      source_page: source_page || "/directory",
    },
    userId: user.id,
    path: source_page || "/directory",
    locale,
  });

  revalidatePath("/client");
  revalidatePath("/directory");
  redirect("/directory?inquiry=submitted");
}

export async function submitGuestInquiry(
  _prev: InquiryFormState,
  formData: FormData,
): Promise<InquiryFormState> {
  const t = createTranslator(await getRequestLocale());
  const publicSettings = await getPublicSettings();
  if (!publicSettings.inquiriesOpen) {
    return { error: t("public.forms.inquiry.inquiriesClosed") };
  }

  const guestKey = (await headers()).get(GUEST_HEADER);
  const pub = createPublicSupabaseClient();
  const admin = createServiceRoleClient();
  if (!pub || !guestKey) {
    return { error: t("public.forms.inquiry.sessionUnavailable") };
  }
  if (!admin) {
    return { error: t("public.forms.inquiry.supabaseNotConfigured") };
  }

  const rawIds = formData.get("talent_ids");
  const talentIds = String(rawIds ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const {
    company,
    contact_email,
    contact_name,
    contact_phone,
    directory_context,
    event_date,
    event_location,
    event_type_id,
    message,
    quantity,
    raw_query,
    source_page,
  } = parseInquiryFields(formData);

  if (talentIds.length === 0) {
    return { error: t("public.forms.inquiry.selectAtLeastOneTalent") };
  }

  if (!contact_name || !contact_email) {
    return { error: t("public.forms.inquiry.nameAndEmailRequired") };
  }

  const [{ data: talentRows }, { data: eventTypeRow }] = await Promise.all([
    pub
      .from("talent_profiles")
      .select("id, profile_code, display_name")
      .in("id", talentIds),
    event_type_id
      ? pub
          .from("taxonomy_terms")
          .select("id, name_en")
          .eq("id", event_type_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const interpreted_query = buildInquiryContext({
    eventDate: event_date,
    eventLocation: event_location,
    eventTypeId: event_type_id,
    eventTypeName: eventTypeRow?.name_en ?? null,
    quantity,
    rawQuery: raw_query,
    directorySearch: directory_context
      ? {
          q: directory_context.q,
          locationSlug: directory_context.locationSlug,
          sort: directory_context.sort,
          taxonomyTermIds: directory_context.taxonomyTermIds,
        }
      : null,
    selectedTalents: (talentRows ?? []).map((talent) => ({
      id: talent.id,
      profileCode: talent.profile_code,
      displayName: talent.display_name,
    })),
    sourcePage: source_page || "/directory",
    submittedVia: "guest",
  });

  const { data: guestSession, error: guestErr } = await admin
    .from("guest_sessions")
    .select("id")
    .eq("session_key", guestKey)
    .maybeSingle();

  if (guestErr || !guestSession?.id) {
    logServerError("directory/submitGuestInquiry/guestSession", guestErr);
    return { error: t("public.errors.inquiry") };
  }

  const guestClient = await ensureGuestClientByEmail({
    email: contact_email,
    name: contact_name,
    company,
    phone: contact_phone,
  });

  const { data: inquiry, error: inquiryErr } = await admin
    .from("inquiries")
    .insert({
      guest_session_id: guestSession.id,
      client_user_id: guestClient.clientUserId,
      contact_name,
      contact_email: contact_email.toLowerCase(),
      contact_phone: contact_phone || null,
      company: company || null,
      event_date,
      event_location: event_location || null,
      quantity,
      message: message || null,
      event_type_id,
      raw_ai_query: raw_query || null,
      interpreted_query,
      source_page: source_page || "/directory",
      source_channel: "directory_guest" as never,
      status: "new",
      uses_new_engine: true,
      version: 1,
    })
    .select("id")
    .single();

  if (inquiryErr || !inquiry) {
    logServerError("directory/submitGuestInquiry/insert", inquiryErr);
    return { error: t("public.errors.inquiry") };
  }

  const { data: talentParticipantRows, error: talentParticipantLookupErr } = await admin
    .from("talent_profiles")
    .select("id, user_id")
    .in("id", talentIds);
  if (talentParticipantLookupErr) {
    logServerError("directory/submitGuestInquiry/talentParticipantLookup", talentParticipantLookupErr);
    return { error: t("public.errors.inquiry") };
  }

  const talentUserIdsByProfileId = new Map(
    ((talentParticipantRows ?? []) as { id: string; user_id: string | null }[]).map((row) => [row.id, row.user_id] as const),
  );

  const participantRows = [
    ...(guestClient.clientUserId
      ? [
          {
            inquiry_id: inquiry.id,
            user_id: guestClient.clientUserId,
            role: "client" as const,
            status: "active" as const,
          },
        ]
      : []),
    ...talentIds.map((talent_profile_id, index) => ({
      inquiry_id: inquiry.id,
      user_id: talentUserIdsByProfileId.get(talent_profile_id) ?? null,
      talent_profile_id,
      role: "talent" as const,
      status: "invited" as const,
      sort_order: index,
      added_by_user_id: guestClient.clientUserId,
    })),
  ];

  const { error: participantErr } = await admin.from("inquiry_participants").insert(participantRows);
  if (participantErr) {
    logServerError("directory/submitGuestInquiry/participants", participantErr);
    return { error: t("public.errors.inquiry") };
  }

  const localeGuest = await getRequestLocale();
  await logAnalyticsEventServer({
    name: PRODUCT_ANALYTICS_EVENTS.submit_inquiry,
    payload: {
      locale: localeGuest,
      talent_id: talentIds[0],
      inquiry_type: "directory_guest",
      source_page: source_page || "/directory",
    },
    path: source_page || "/directory",
    locale: localeGuest,
  });

  revalidatePath("/directory");
  redirect(
    `/directory?inquiry=submitted&activation=${guestClient.status}&email=${encodeURIComponent(contact_email.toLowerCase())}`,
  );
}
