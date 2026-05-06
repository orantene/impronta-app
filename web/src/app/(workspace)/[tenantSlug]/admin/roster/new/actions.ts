"use server";

/**
 * Minimal talent-create action for the canonical workspace admin shell.
 *
 * Creates a `talent_profiles` row + an `agency_talent_roster` row and
 * redirects to the roster list on success. Fields exposed here are the
 * minimum needed to get a profile into the roster — the full editor lives
 * in the legacy `(dashboard)/admin/talent/[id]` page and will be ported
 * to the canonical shell in a later phase.
 */

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

export type CreateRosterTalentState =
  | { error: string }
  | undefined;

const trimmed = z
  .string()
  .optional()
  .transform((v) => (typeof v === "string" ? v.trim() : ""));

const schema = z.object({
  display_name: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1, "Display name is required.")),
  first_name: trimmed,
  last_name: trimmed,
  short_bio: trimmed,
  phone: trimmed,
  talent_type_term_id: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  agency_visibility: z
    .enum(["roster_only", "site_visible", "featured"])
    .default("roster_only"),
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
    display_name: formData.get("display_name"),
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    short_bio: formData.get("short_bio"),
    phone: formData.get("phone"),
    talent_type_term_id: formData.get("talent_type_term_id") || undefined,
    agency_visibility: formData.get("agency_visibility") || "roster_only",
  });
  if (!raw.success) {
    return { error: raw.error.issues[0]?.message ?? "Validation failed." };
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

  // ── Insert talent_profiles ─────────────────────────────────────────────────
  const { data: inserted, error: insertErr } = await admin
    .from("talent_profiles")
    .insert({
      profile_code: String(codeRow),
      display_name: raw.data.display_name,
      first_name: raw.data.first_name || null,
      last_name: raw.data.last_name || null,
      short_bio: raw.data.short_bio || null,
      phone: raw.data.phone || null,
      workflow_status: "draft",
      visibility: "hidden",
      membership_tier: "free",
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
  const { error: rosterErr } = await admin.from("agency_talent_roster").insert({
    tenant_id: scope.tenantId,
    source_workspace_id: scope.tenantId,
    origin_domain: originDomain,
    talent_profile_id: talentProfileId,
    source_type: "agency_created",
    status: "active",
    agency_visibility: raw.data.agency_visibility,
    added_by: session.user.id,
  });

  if (rosterErr) {
    logServerError("roster/new.createRosterTalent/roster", rosterErr);
    // Roll back the orphaned talent profile
    await admin.from("talent_profiles").delete().eq("id", talentProfileId);
    return { error: "Could not add the profile to your roster. Try again." };
  }

  // ── Optional: tag primary talent type ─────────────────────────────────────
  if (raw.data.talent_type_term_id) {
    const { error: taxErr } = await admin.from("talent_profile_taxonomy").insert({
      talent_profile_id: talentProfileId,
      taxonomy_term_id: raw.data.talent_type_term_id,
      is_primary: true,
    });
    if (taxErr) {
      // Non-fatal — taxonomy can be assigned later
      logServerError("roster/new.createRosterTalent/taxonomy", taxErr);
    }
  }

  revalidatePath(`/${tenantSlug}/admin/roster`);
  redirect(`/${tenantSlug}/admin/roster`);
}
