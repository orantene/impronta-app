"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  accountStatusSchema,
  appRoleSchema,
  booleanFromEquals,
  membershipTierSchema,
  parseWithSchema,
  trimmedString,
  visibilitySchema,
  workflowStatusSchema,
} from "@/lib/admin/validation";
import {
  readCanonicalLocationSelection,
  resolveCanonicalLocationSelection,
  validateCanonicalLocationSelection,
} from "@/lib/canonical-location";
import { requireAdmin, requireStaff } from "@/lib/server/action-guards";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { appendTranslationAudit } from "@/lib/translation/audit";
import {
  buildBioEnEditExtras,
  type TalentBioRow,
} from "@/lib/translation/talent-bio-translation-service";

export type AdminUserActionState = { error?: string; success?: boolean } | undefined;

const adminUserUpdateSchema = z.object({
  user_id: z.string().min(1, "Missing user ID."),
  display_name: z.string(),
  account_status: z.string(),
  app_role: z.string(),
  talent_display_name: z.string(),
  talent_profile_id: z.string(),
  workflow_status: z.string(),
  visibility: z.string(),
  decision_note: z.string(),
  membership_tier: membershipTierSchema,
  first_name: z.string(),
  last_name: z.string(),
  short_bio: z.string(),
  phone: z.string(),
  gender: z.string(),
  date_of_birth: z.string(),
  has_canonical_location_fields: z.boolean(),
  is_featured: z.boolean(),
  client_company_name: z.string(),
  client_phone: z.string(),
  client_whatsapp_phone: z.string(),
  client_website_url: z.string(),
  client_notes: z.string(),
});

export async function adminUpdateUser(
  _prev: AdminUserActionState,
  formData: FormData,
): Promise<AdminUserActionState> {
  const parsed = parseWithSchema(adminUserUpdateSchema, {
    user_id: trimmedString(formData, "user_id"),
    display_name: trimmedString(formData, "display_name"),
    account_status: trimmedString(formData, "account_status"),
    app_role: trimmedString(formData, "app_role"),
    talent_display_name: trimmedString(formData, "talent_display_name"),
    talent_profile_id: trimmedString(formData, "talent_profile_id"),
    workflow_status: trimmedString(formData, "workflow_status"),
    visibility: trimmedString(formData, "visibility"),
    decision_note: trimmedString(formData, "decision_note"),
    membership_tier: trimmedString(formData, "membership_tier"),
    first_name: trimmedString(formData, "first_name"),
    last_name: trimmedString(formData, "last_name"),
    short_bio: trimmedString(formData, "short_bio"),
    phone: trimmedString(formData, "phone"),
    gender: trimmedString(formData, "gender"),
    date_of_birth: trimmedString(formData, "date_of_birth"),
    has_canonical_location_fields:
      formData.has("residence_country_iso2") ||
      formData.has("residence_city_name_en") ||
      formData.has("origin_country_iso2") ||
      formData.has("origin_city_name_en"),
    is_featured: booleanFromEquals(formData, "is_featured"),
    client_company_name: trimmedString(formData, "client_company_name"),
    client_phone: trimmedString(formData, "client_phone"),
    client_whatsapp_phone: trimmedString(formData, "client_whatsapp_phone"),
    client_website_url: trimmedString(formData, "client_website_url"),
    client_notes: trimmedString(formData, "client_notes"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const {
    user_id: userId,
    display_name: displayName,
    account_status: accountStatus,
    app_role: appRole,
    talent_display_name: talentDisplayName,
    talent_profile_id: talentProfileId,
    workflow_status: workflowStatus,
    visibility,
    decision_note: decisionNote,
    membership_tier: membershipTier,
    first_name: firstName,
    last_name: lastName,
    short_bio: shortBio,
    phone,
    gender,
    date_of_birth: dateOfBirth,
    has_canonical_location_fields: hasCanonicalLocationFields,
    is_featured: isFeatured,
    client_company_name: clientCompanyName,
    client_phone: clientPhone,
    client_whatsapp_phone: clientWhatsappPhone,
    client_website_url: clientWebsiteUrl,
    client_notes: clientNotes,
  } = parsed.data;

  // Staff can update most profile fields; app_role changes require super-admin.
  const staff = await requireStaff();
  if (!staff.ok) return { error: staff.error };

  const { supabase, user } = staff;

  const { data: current, error: curErr } = await supabase
    .from("profiles")
    .select("app_role")
    .eq("id", userId)
    .maybeSingle();

  if (curErr) {
    logServerError("admin/users/update/current", curErr);
    return { error: CLIENT_ERROR.loadPage };
  }

  const roleChanging = Boolean(appRole) && current?.app_role && appRole !== current.app_role;
  if (roleChanging) {
    const admin = await requireAdmin();
    if (!admin.ok) return { error: admin.error };
  }

  if (accountStatus && !accountStatusSchema.safeParse(accountStatus).success) {
    return { error: "Invalid account status." };
  }

  if (appRole && !appRoleSchema.safeParse(appRole).success) {
    return { error: "Invalid app role." };
  }

  const profilePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (displayName !== undefined) profilePayload.display_name = displayName || null;
  if (accountStatus) profilePayload.account_status = accountStatus;
  if (appRole) profilePayload.app_role = appRole;

  const { error: upErr } = await supabase.from("profiles").update(profilePayload).eq("id", userId);
  if (upErr) {
    logServerError("admin/users/update/profiles", upErr);
    return { error: CLIENT_ERROR.update };
  }

  if (appRole === "client") {
    const { error: cpErr } = await supabase.from("client_profiles").upsert(
      {
        user_id: userId,
        company_name: clientCompanyName || null,
        phone: clientPhone || null,
        whatsapp_phone: clientWhatsappPhone || null,
        website_url: clientWebsiteUrl || null,
        notes: clientNotes || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (cpErr) {
      logServerError("admin/users/update/client_profiles", cpErr);
      return { error: CLIENT_ERROR.update };
    }
  }

  if (talentProfileId) {
    if (!workflowStatus || !visibility) {
      return { error: "Workflow status and visibility are required for linked talent profiles." };
    }
    if (!workflowStatusSchema.safeParse(workflowStatus).success) {
      return { error: "Invalid workflow status." };
    }
    if (!visibilitySchema.safeParse(visibility).success) {
      return { error: "Invalid visibility." };
    }
    if (!membershipTierSchema.safeParse(membershipTier).success) {
      return { error: "Invalid membership tier." };
    }

    const { data: tpRow, error: tpLoadErr } = await supabase
      .from("talent_profiles")
      .select(
        "user_id, workflow_status, visibility, bio_en, bio_es, bio_es_draft, bio_es_status, short_bio",
      )
      .eq("id", talentProfileId)
      .maybeSingle();

    if (tpLoadErr) {
      logServerError("admin/users/update/talent_load", tpLoadErr);
      return { error: CLIENT_ERROR.loadPage };
    }
    if (!tpRow) {
      return { error: "Talent profile not found." };
    }
    if (tpRow.user_id !== userId) {
      return { error: "Talent profile does not belong to this user." };
    }

    const beforeWf = tpRow.workflow_status as string;
    const beforeVis = tpRow.visibility as string;
    const note = decisionNote.length > 0 ? decisionNote : null;

    const nowIso = new Date().toISOString();
    const bioExtras = buildBioEnEditExtras({
      talentProfileId,
      prev: tpRow as TalentBioRow,
      nextShortBio: shortBio || null,
      actorId: user.id,
      nowIso,
    });

    const talentPayload: Record<string, unknown> = {
      updated_at: nowIso,
      workflow_status: workflowStatus,
      visibility,
      is_featured: isFeatured,
      first_name: firstName || null,
      last_name: lastName || null,
      ...bioExtras.payload,
      phone: phone || null,
      gender: gender || null,
      date_of_birth: dateOfBirth || null,
    };
    if (talentDisplayName !== undefined) talentPayload.display_name = talentDisplayName || null;
    if (membershipTier) talentPayload.membership_tier = membershipTier;

    if (hasCanonicalLocationFields) {
      const residence = readCanonicalLocationSelection(formData, "residence");
      const origin = readCanonicalLocationSelection(formData, "origin");

      const residenceError = validateCanonicalLocationSelection(residence, {
        required: true,
        label: "Residence",
      });
      if (residenceError) return { error: residenceError };

      const originError = validateCanonicalLocationSelection(origin, {
        required: false,
        label: "Origin",
      });
      if (originError) return { error: originError };

      try {
        const residenceResolved = await resolveCanonicalLocationSelection(supabase, residence);
        const originResolved = await resolveCanonicalLocationSelection(supabase, origin);

        if (!residenceResolved) return { error: "Residence country and city are required." };

        talentPayload.location_id = residenceResolved.cityId;
        talentPayload.residence_country_id = residenceResolved.countryId;
        talentPayload.residence_city_id = residenceResolved.cityId;
        talentPayload.origin_country_id = originResolved?.countryId ?? null;
        talentPayload.origin_city_id = originResolved?.cityId ?? null;
      } catch (error) {
        logServerError("admin/users/update/resolveCanonicalLocation", error);
        return { error: "Selected location is not available." };
      }
    }

    const { error: tErr } = await supabase
      .from("talent_profiles")
      .update(talentPayload)
      .eq("id", talentProfileId);

    if (!tErr && bioExtras.audit) {
      await appendTranslationAudit(supabase, bioExtras.audit);
    }
    if (tErr) {
      logServerError("admin/users/update/talent_profiles", tErr);
      return { error: CLIENT_ERROR.update };
    }

    try {
      if (workflowStatus !== beforeWf) {
        await supabase.from("talent_workflow_events").insert({
          talent_profile_id: talentProfileId,
          actor_user_id: user.id,
          event_type: "workflow_status_changed",
          payload: { from: beforeWf, to: workflowStatus, note },
        });
      }
      if (visibility !== beforeVis) {
        await supabase.from("talent_workflow_events").insert({
          talent_profile_id: talentProfileId,
          actor_user_id: user.id,
          event_type: "visibility_changed",
          payload: { from: beforeVis, to: visibility, note },
        });
      }
    } catch (e) {
      logServerError("admin/users/update/workflowEvents", e);
    }
  }

  revalidatePath("/admin/talent");
  if (talentProfileId) revalidatePath(`/admin/talent/${talentProfileId}`);
  revalidatePath("/admin/users/search");
  revalidatePath("/admin/clients");
  revalidatePath("/admin/users/admins");
  return { success: true };
}

export async function adminQuickSetAccountStatus(
  userId: string,
  accountStatus: string,
): Promise<{ error?: string; success?: boolean }> {
  const uid = userId.trim();
  if (!uid) return { error: "Missing user ID." };

  const staff = await requireStaff();
  if (!staff.ok) return { error: staff.error };

  if (!accountStatusSchema.safeParse(accountStatus).success) {
    return { error: "Invalid account status." };
  }

  const { error: upErr } = await staff.supabase
    .from("profiles")
    .update({ account_status: accountStatus, updated_at: new Date().toISOString() })
    .eq("id", uid);

  if (upErr) {
    logServerError("admin/users/quickSetAccountStatus", upErr);
    return { error: CLIENT_ERROR.update };
  }

  revalidatePath("/admin/users/search");
  revalidatePath("/admin/clients");
  revalidatePath("/admin/users/admins");
  revalidatePath(`/admin/clients/${uid}`);
  return { success: true };
}
