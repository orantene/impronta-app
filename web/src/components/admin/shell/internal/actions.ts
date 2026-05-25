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
import {
  assignTaxonomyTermToProfile,
  resolveTenantTalentTypeTermId,
} from "@/lib/talent-taxonomy-service";

// ── Shared result type ──────────────────────────────────────────────────────

export type ActionResult =
  | { ok: true; talentProfileId?: string; warnings?: string[] }
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
  pronunciation: z.string().trim().default(""),
  homeBase: z.string().trim().default(""),
  primaryTypeSlugorId: z.string().trim().optional(),
  /** Secondary talent types (slugs or UUIDs) collected in the QuickAdd
   *  drawer. Persisted as `relationship_type: "secondary_role"` rows in
   *  `talent_profile_taxonomy`. */
  secondaryTypeSlugorIds: z.array(z.string().trim().min(1)).default([]),
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
      pronunciation:     d.pronunciation || null,
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

  const warnings: string[] = [];

  // ── Primary talent type ────────────────────────────────────────────────────
  if (d.primaryTypeSlugorId) {
    const resolved = await resolveTenantTalentTypeTermId(admin, {
      tenantId: scope.tenantId,
      slugOrId: d.primaryTypeSlugorId,
      relationshipType: "primary_role",
    });
    if (!resolved.ok) {
      warnings.push(resolved.error);
    } else {
      const taxRes = await assignTaxonomyTermToProfile(admin, {
        talentProfileId,
        taxonomyTermId: resolved.termId,
        relationshipType: "primary_role",
      });
      if (!taxRes.ok) {
        warnings.push("Talent type could not be saved — open the drawer and pick it again.");
      }
    }
  }

  // ── Secondary talent types ─────────────────────────────────────────────────
  // Resolve every secondary slug/UUID through the same tenant-aware taxonomy
  // resolver as the editor. Disabled workspace categories do not attach.
  if (d.secondaryTypeSlugorIds.length > 0) {
    const resolvedSecondaryIds: string[] = [];
    for (const raw of d.secondaryTypeSlugorIds) {
      const resolved = await resolveTenantTalentTypeTermId(admin, {
        tenantId: scope.tenantId,
        slugOrId: raw,
        relationshipType: "secondary_role",
      });
      if (resolved.ok) resolvedSecondaryIds.push(resolved.termId);
      else warnings.push(resolved.error);
    }
    for (const id of resolvedSecondaryIds) {
      const secTaxRes = await assignTaxonomyTermToProfile(admin, {
        talentProfileId,
        taxonomyTermId: id,
        relationshipType: "secondary_role",
      });
      if (!secTaxRes.ok) {
        warnings.push("Secondary types could not be saved — open the drawer and re-select them.");
      }
    }
  }

  revalidatePath(`/${d.tenantSlug}/admin/roster`, "page");

  return { ok: true as const, talentProfileId, warnings };
}

// ─── Bulk Add Talent (CSV import) ─────────────────────────────────────────────
//
// Calls addTalentToRoster sequentially for each row so per-row failures
// don't roll back the whole batch. Returns a summary with per-row outcome
// so the UI can show "Created 8 of 10 — 2 failed (duplicate email · no
// taxonomy match)". Sequential rather than parallel to avoid swamping the
// roster-seat check + RLS policy evaluator.

export type BulkAddTalentRow = {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email?: string;
  phone?: string;
  homeBase?: string;
  /** Taxonomy slug or UUID — already resolved by the caller before invoking. */
  primaryTypeSlugorId?: string;
};

export type BulkAddTalentResult = {
  ok: true;
  created: number;
  failed: number;
  errors: { rowIndex: number; rowLabel: string; error: string }[];
  createdIds: string[];
} | { ok: false; error: string };

export async function bulkAddTalentToRoster(
  tenantSlug: string,
  rows: BulkAddTalentRow[],
): Promise<BulkAddTalentResult> {
  if (!tenantSlug) return { ok: false, error: "Workspace not found." };
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: "No rows to import." };
  if (rows.length > 200) return { ok: false, error: "Imports are capped at 200 rows per batch. Split your CSV." };

  const created: string[] = [];
  const errorList: { rowIndex: number; rowLabel: string; error: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const label =
      (r.displayName?.trim() || `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim()) || r.email || `row ${i + 1}`;
    try {
      const res = await addTalentToRoster({
        tenantSlug,
        firstName: r.firstName ?? "",
        lastName: r.lastName ?? "",
        displayName: r.displayName ?? "",
        email: r.email ?? "",
        phone: r.phone ?? "",
        homeBase: r.homeBase ?? "",
        primaryTypeSlugorId: r.primaryTypeSlugorId,
        managementMethod: "draft",
      });
      if (res.ok && res.talentProfileId) {
        created.push(res.talentProfileId);
      } else {
        errorList.push({ rowIndex: i, rowLabel: label, error: res.ok ? "Unknown error" : res.error });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      errorList.push({ rowIndex: i, rowLabel: label, error: message });
    }
  }

  return {
    ok: true,
    created: created.length,
    failed: errorList.length,
    errors: errorList,
    createdIds: created,
  };
}
