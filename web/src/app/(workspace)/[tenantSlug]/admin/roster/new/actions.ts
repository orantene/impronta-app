"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { checkRosterSeatAvailability } from "@/lib/saas/roster-seat-limit";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { pgUuidSchema } from "@/lib/site-admin/validators";
import { resolveExclusivityForRosterAdd } from "@/lib/agency/exclusivity-resolver";

export type CreateRosterTalentState =
  | { error: string }
  | undefined;

const trimmed = z
  .string()
  .optional()
  .transform((v) => (typeof v === "string" ? v.trim() : ""));

const schema = z.object({
  // Required: at least first or last name (or display_name)
  display_name: trimmed,
  first_name: trimmed,
  last_name: trimmed,
  short_bio: trimmed,
  phone: trimmed,
  invitation_email: z
    .string()
    .optional()
    .transform((v) => (typeof v === "string" ? v.trim() : ""))
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: "Enter a valid email address.",
    }),
  home_city_text: trimmed,
  // Canonical, inclusive gender option-set (Tier-C-tail, 2026-06-10) — values
  // are the display strings stored verbatim in talent_profiles.gender, in
  // lockstep with profile_field_definitions(identity.gender).options + the
  // directory facet config.
  gender: z
    .enum([
      "Woman",
      "Man",
      "Non-binary",
      "Trans woman",
      "Trans man",
      "Transgender",
      "Genderfluid",
      "Genderqueer",
      "Agender",
      "Bigender",
      "Two-Spirit",
      "Intersex",
      "Prefer to self-describe",
      "Prefer not to say",
      "",
    ])
    .optional()
    .transform((v) => (v === "" ? null : (v ?? null))),
  talent_type_term_id: pgUuidSchema()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  agency_visibility: z
    .enum(["roster_only", "site_visible", "featured"])
    .default("roster_only"),
  management_method: z
    .enum(["agency", "invited", "draft"])
    .default("draft"),
  height_cm: z
    .string()
    .optional()
    .transform((v) => {
      if (!v || v.trim() === "") return null;
      const n = parseFloat(v.trim());
      return isNaN(n) || n < 50 || n > 280 ? null : n;
    }),
});

export async function createRosterTalent(
  tenantSlug: string,
  _prev: CreateRosterTalentState,
  formData: FormData,
): Promise<CreateRosterTalentState> {
  // ── Auth + resolve tenant + check capability ───────────────────────────────
  const session = await getCachedActorSession();
  if (!session.user) return { error: "Not authenticated." };

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) return { error: "Workspace not found." };

  const canEdit = await userHasCapability("agency.roster.edit", scope.tenantId);
  if (!canEdit) return { error: "You don't have permission to add talent." };

  // ── Validate form ──────────────────────────────────────────────────────────
  const raw = schema.safeParse({
    display_name:       formData.get("display_name") || "",
    first_name:         formData.get("first_name") || "",
    last_name:          formData.get("last_name") || "",
    short_bio:          formData.get("short_bio") || "",
    phone:              formData.get("phone") || "",
    invitation_email:   formData.get("invitation_email") || "",
    home_city_text:     formData.get("home_city_text") || "",
    gender:             formData.get("gender") || "",
    talent_type_term_id: formData.get("talent_type_term_id") || undefined,
    agency_visibility:  formData.get("agency_visibility") || "roster_only",
    management_method:  formData.get("management_method") || "draft",
    height_cm:          formData.get("height_cm") || undefined,
  });
  if (!raw.success) {
    return { error: raw.error.issues[0]?.message ?? "Validation failed." };
  }

  const d = raw.data;

  // Derive the display name: prefer explicit, then first+last
  const resolvedDisplayName =
    d.display_name ||
    `${d.first_name} ${d.last_name}`.trim() ||
    d.first_name ||
    d.last_name;

  if (!resolvedDisplayName) {
    return { error: "Enter at least a first name or display name." };
  }

  // Validate: invited method requires email
  if (d.management_method === "invited" && !d.invitation_email) {
    return { error: "An email address is required when marking as invited." };
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return { error: "Server configuration error (service role key missing)." };
  }

  // ── Seat-limit check ───────────────────────────────────────────────────────
  const seats = await checkRosterSeatAvailability(admin, scope.tenantId, 1);
  if (!seats.ok) return { error: seats.message };

  // ── Allocate profile code ──────────────────────────────────────────────────
  const { data: codeRow, error: codeErr } = await admin.rpc("generate_profile_code");
  if (codeErr || !codeRow) {
    logServerError("roster/new.createRosterTalent/code", codeErr);
    return { error: "Could not allocate a profile code. Try again." };
  }

  // Map method → workflow_status
  const workflowStatus =
    d.management_method === "invited" ? "invited" : "draft";

  // ── Insert talent_profiles ─────────────────────────────────────────────────
  const { data: inserted, error: insertErr } = await admin
    .from("talent_profiles")
    .insert({
      profile_code:      String(codeRow),
      display_name:      resolvedDisplayName,
      first_name:        d.first_name || null,
      last_name:         d.last_name || null,
      short_bio:         d.short_bio || null,
      phone:             d.phone || null,
      gender:            d.gender ?? null,
      height_cm:         d.height_cm ?? null,
      invitation_email:  d.invitation_email || null,
      home_city_text:    d.home_city_text || null,
      workflow_status:   workflowStatus,
      visibility:        "hidden",
      membership_tier:   "free",
      membership_status: "active",
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    logServerError("roster/new.createRosterTalent/insert", insertErr);
    return { error: "Could not create the talent profile. Try again." };
  }

  const talentProfileId = inserted.id as string;
  const originDomain = (await headers()).get("host")?.toLowerCase() ?? null;

  // ── Insert agency_talent_roster ────────────────────────────────────────────
  // Exclusivity MUST come from the resolver, not the column defaults. Omitting
  // these three fields is why production ended up with is_primary=FALSE on all
  // 306 active rows: `owning-party-resolver.rowIsExclusive` short-circuits on
  // `!isPrimary`, so an admin-added talent on an exclusive-tier plan was never
  // actually exclusive and hub-brokered demand bypassed the agency entirely.
  // (Free tenants correctly resolve to non-exclusive — see the spec in
  // lib/agency/exclusivity-resolver.ts.)
  const exclusivity = await resolveExclusivityForRosterAdd(
    admin,
    scope.tenantId,
    talentProfileId,
  );

  const { error: rosterErr } = await admin.from("agency_talent_roster").insert({
    tenant_id:           scope.tenantId,
    source_workspace_id: scope.tenantId,
    origin_domain:       originDomain,
    talent_profile_id:   talentProfileId,
    source_type:         "agency_created",
    status:              "active",
    agency_visibility:   d.agency_visibility,
    added_by:            session.user.id,
    is_primary:                   exclusivity.shouldBeExclusive,
    exclusivity_status:           exclusivity.exclusivityStatus,
    exclusivity_auto_assigned_at: exclusivity.autoAssignedAt,
  });

  if (rosterErr) {
    logServerError("roster/new.createRosterTalent/roster", rosterErr);
    // Roll back the orphaned talent profile
    await admin.from("talent_profiles").delete().eq("id", talentProfileId);
    return { error: "Could not add the profile to your roster. Try again." };
  }

  // ── Tag primary talent type ────────────────────────────────────────────────
  if (d.talent_type_term_id) {
    const { error: taxErr } = await admin.from("talent_profile_taxonomy").insert({
      talent_profile_id:  talentProfileId,
      taxonomy_term_id:   d.talent_type_term_id,
      relationship_type:  "primary_role",  // ← required for roster card display
      is_primary:         true,
    });
    if (taxErr) {
      // Non-fatal — taxonomy can be assigned from the edit page
      logServerError("roster/new.createRosterTalent/taxonomy", taxErr);
    }
  }

  revalidatePath(`/${tenantSlug}/admin/roster`);

  // When admin fills the profile themselves, go straight to the edit page.
  if (d.management_method === "agency") {
    redirect(`/${tenantSlug}/admin/roster/${talentProfileId}`);
  }

  redirect(`/${tenantSlug}/admin/roster`);
}
