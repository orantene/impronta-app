"use server";

/**
 * _actions.ts — Server actions called by the admin-shell prototype drawers
 * when running in production (cutover) mode.
 *
 * These wrap the canonical workspace server actions with a plain-object
 * interface so drawer components (which hold form state in React state,
 * not in uncontrolled inputs) can call them via startTransition without
 * needing to construct a FormData manually.
 *
 * All actions:
 *   1. Verify the actor is authenticated and has the required capability.
 *   2. Delegate to the existing logic from the canonical action module.
 *   3. Return a typed result — callers must check `result.error` before
 *      treating the operation as successful.
 */

import { z } from "zod";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { checkRosterSeatAvailability } from "@/lib/saas/roster-seat-limit";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";

// ── Shared result type ──────────────────────────────────────────────────────

export type ActionResult =
  | { ok: true; talentProfileId?: string }
  | { ok: false; error: string };

// ── Add Talent (NewTalentDrawer) ────────────────────────────────────────────

const addTalentSchema = z.object({
  tenantSlug: z.string().min(1),
  firstName: z.string().trim().default(""),
  lastName: z.string().trim().default(""),
  displayName: z.string().trim().default(""),
  email: z
    .string()
    .trim()
    .optional()
    .transform((v) => v ?? "")
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: "Enter a valid email address.",
    }),
  phone: z.string().trim().default(""),
  homeBase: z.string().trim().default(""),
  primaryTypeSlugorId: z.string().trim().optional(),
  managementMethod: z
    .enum(["agency", "invited", "draft"])
    .default("draft"),
});

/**
 * Create a new talent profile from the QuickAdd drawer.
 *
 * `primaryTypeSlugorId` is the taxonomy term UUID from the picker. Optional
 * because the drawer allows saving a draft without a talent type selected.
 */
export async function addTalentToRoster(
  input: z.input<typeof addTalentSchema>,
): Promise<ActionResult> {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not authenticated." };

  // ── Validate ───────────────────────────────────────────────────────────────
  const parsed = addTalentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  // ── Tenant + capability ────────────────────────────────────────────────────
  const scope = await getTenantScopeBySlug(d.tenantSlug);
  if (!scope) return { ok: false, error: "Workspace not found." };

  const canEdit = await userHasCapability("agency.roster.edit", scope.tenantId);
  if (!canEdit) return { ok: false, error: "You don't have permission to add talent." };

  // ── Business rules ─────────────────────────────────────────────────────────
  if (d.managementMethod === "invited" && !d.email) {
    return { ok: false, error: "An email address is required when using the invite flow." };
  }

  const resolvedDisplayName =
    d.displayName ||
    `${d.firstName} ${d.lastName}`.trim() ||
    d.firstName ||
    d.lastName;

  if (!resolvedDisplayName) {
    return { ok: false, error: "Enter at least a first or display name." };
  }

  // ── Seat limit ─────────────────────────────────────────────────────────────
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const seats = await checkRosterSeatAvailability(admin, scope.tenantId, 1);
  if (!seats.ok) return { ok: false, error: seats.message };

  // ── Profile code ───────────────────────────────────────────────────────────
  const { data: codeRow, error: codeErr } = await admin.rpc("generate_profile_code");
  if (codeErr || !codeRow) {
    logServerError("admin-shell._actions.addTalentToRoster/code", codeErr);
    return { ok: false, error: "Could not allocate a profile code. Try again." };
  }

  // ── Insert talent_profiles ─────────────────────────────────────────────────
  const workflowStatus = d.managementMethod === "invited" ? "invited" : "draft";
  const { data: inserted, error: insertErr } = await admin
    .from("talent_profiles")
    .insert({
      profile_code:      String(codeRow),
      display_name:      resolvedDisplayName,
      first_name:        d.firstName || null,
      last_name:         d.lastName || null,
      phone:             d.phone || null,
      invitation_email:  d.email || null,
      home_city_text:    d.homeBase || null,
      workflow_status:   workflowStatus,
      visibility:        "hidden",
      membership_tier:   "free",
      membership_status: "active",
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    logServerError("admin-shell._actions.addTalentToRoster/insert", insertErr);
    return { ok: false, error: "Could not create the talent profile. Try again." };
  }

  const talentProfileId = inserted.id as string;
  const originDomain = (await headers()).get("host")?.toLowerCase() ?? null;

  // ── Insert agency_talent_roster ────────────────────────────────────────────
  const { error: rosterErr } = await admin.from("agency_talent_roster").insert({
    tenant_id:           scope.tenantId,
    source_workspace_id: scope.tenantId,
    origin_domain:       originDomain,
    talent_profile_id:   talentProfileId,
    source_type:         "agency_created",
    status:              "active",
    agency_visibility:   "roster_only",
    added_by:            session.user.id,
  });

  if (rosterErr) {
    logServerError("admin-shell._actions.addTalentToRoster/roster", rosterErr);
    await admin.from("talent_profiles").delete().eq("id", talentProfileId);
    return { ok: false, error: "Could not add to roster. Try again." };
  }

  // ── Primary talent type ────────────────────────────────────────────────────
  if (d.primaryTypeSlugorId) {
    // Accept either a UUID (direct term id) or a slug — look up the term id
    // from the slug when it doesn't look like a UUID.
    let termId = d.primaryTypeSlugorId;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(termId);
    if (!isUuid) {
      const { data: term } = await admin
        .from("taxonomy_terms")
        .select("id")
        .eq("slug", termId)
        .eq("tenant_id", scope.tenantId)
        .single();
      termId = term?.id ?? termId;
    }

    if (/^[0-9a-f]{8}-/.test(termId)) {
      const { error: taxErr } = await admin.from("talent_profile_taxonomy").insert({
        talent_profile_id: talentProfileId,
        taxonomy_term_id:  termId,
        relationship_type: "primary_role",
        is_primary:        true,
      });
      if (taxErr) {
        logServerError("admin-shell._actions.addTalentToRoster/taxonomy", taxErr);
      }
    }
  }

  // Bust the layout-level Router Cache so the top-bar roster counter
  // ("N talent · M open inquiries") reflects the new row immediately
  // when router.refresh() runs on the client.
  revalidatePath("/", "layout");

  return { ok: true, talentProfileId };
}
