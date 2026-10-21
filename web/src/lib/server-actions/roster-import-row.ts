import "server-only";

/* eslint-disable ratchet/no-untenanted-from -- talent_profiles and profile_field_definitions are global identity/catalog tables with no tenant_id; tenanted tables below go through tenantScopedQuery. */

/**
 * roster-import-row.ts — the per-row roster import applier, as a plain server module (TUL-1744).
 *
 * It lived in `roster-import.ts`, a "use server" file, so `processRosterImportRow(admin, tenantId, row)`
 * was an exported server action that takes a database client and a tenant id as ARGUMENTS and
 * authorises nothing itself. Server-action arguments come from the client. Its callers (the staff
 * enqueue action and the roster-import route) establish the right to write for the tenant first,
 * then import this on the server.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { logServerError } from "@/lib/server/safe-error";
import { resolveExclusivityForRosterAdd } from "@/lib/agency/exclusivity-resolver";
import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";

export type RosterImportRow = {
  display_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  height_cm?: number;
  home_city_text?: string;
  short_bio?: string;
  /** Initial talent type slug; falls back to "model" when unset. */
  primary_type_slug?: string;
};

/**
 * Per-row applier. Exported so a background worker can call this when
 * processing a file-based import. Idempotent on (tenant_id, email):
 * a re-run with the same email updates the existing talent_profile
 * + roster row instead of creating a duplicate.
 */
export async function processRosterImportRow(
  admin: ReturnType<typeof createServiceRoleClient>,
  tenantId: string,
  row: RosterImportRow,
): Promise<{ ok: true; talentProfileId: string } | { ok: false; error: string }> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  if (!admin) return { ok: false, error: "Service unavailable." };

  const displayName = row.display_name?.trim()
    || [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  if (!displayName) return { ok: false, error: "Row needs a display name (or first + last)." };
  if (!row.email?.trim()) return { ok: false, error: "Row needs an email." };

  const email = row.email.trim().toLowerCase();

  const incomingHeightCm =
    typeof row.height_cm === "number" ? row.height_cm : null;

  // Look up existing talent_profile by invitation_email + an active
  // roster row on this tenant — idempotency anchor.
  const { data: existing } = await admin
    .from("talent_profiles")
    .select("id")
    .ilike("invitation_email", email)
    .maybeSingle();

  let talentProfileId: string;

  if (existing) {
    talentProfileId = (existing as { id: string }).id;
    await admin
      .from("talent_profiles")
      .update({
        display_name: displayName,
        first_name: row.first_name?.trim() ?? null,
        last_name: row.last_name?.trim() ?? null,
        phone: row.phone?.trim() ?? null,
        height_cm: typeof row.height_cm === "number" ? row.height_cm : null,
        home_city_text: row.home_city_text?.trim() ?? null,
        short_bio: row.short_bio?.trim() ?? null,
      })
      .eq("id", talentProfileId);
  } else {
    const { data: created, error: createErr } = await admin
      .from("talent_profiles")
      .insert({
        display_name: displayName,
        first_name: row.first_name?.trim() ?? null,
        last_name: row.last_name?.trim() ?? null,
        invitation_email: email,
        phone: row.phone?.trim() ?? null,
        height_cm: typeof row.height_cm === "number" ? row.height_cm : null,
        home_city_text: row.home_city_text?.trim() ?? null,
        short_bio: row.short_bio?.trim() ?? null,
        workflow_status: "draft",
        visibility: "public",
      })
      .select("id")
      .single();
    if (createErr || !created) {
      return { ok: false, error: createErr?.message ?? "Couldn't create profile." };
    }
    talentProfileId = (created as { id: string }).id;
  }

  // ── Phase 5-ε: canonical-first height seed ─────────────────────────────────
  // `talent_profiles.height_cm` (written above) is the denormalized column.
  // Canonical store is `talent_profile_field_values` keyed by
  // `physical.height_cm`. Seed/clear canonical now so the two never drift.
  // The new-insert branch needs the profile id to exist first, so we seed
  // here rather than as a pre-write step; semantically canonical is still
  // authoritative. Per-row errors are logged + swallowed: a single bad
  // canonical seed must not abort the import of the whole batch.
  try {
    const { data: defRow, error: defErr } = await admin
      .from("profile_field_definitions")
      .select("id")
      .eq("field_key", "physical.height_cm")
      .maybeSingle();
    if (defErr) {
      logServerError("roster-import.canonicalHeightDefLookup", defErr);
    } else if (defRow) {
      const definitionId = (defRow as { id: string }).id;
      if (incomingHeightCm === null) {
        const { error: delErr } = await tenantScopedQuery(admin, "talent_profile_field_values", tenantId)
          .delete()
          .eq("talent_profile_id", talentProfileId)
          .eq("field_definition_id", definitionId);
        if (delErr) {
          logServerError("roster-import.canonicalHeightDelete", delErr);
        }
      } else {
        const { error: upsertErr } = await tenantScopedQuery(admin, "talent_profile_field_values", tenantId)
          .upsert(
            {
              talent_profile_id: talentProfileId,
              field_definition_id: definitionId,
              value: incomingHeightCm,
              workflow_state: "live",
              last_edited_role: "platform",
            },
            { onConflict: "talent_profile_id,field_definition_id" },
          );
        if (upsertErr) {
          logServerError("roster-import.canonicalHeightUpsert", upsertErr);
        }
      }
    }
  } catch (err) {
    logServerError("roster-import.canonicalHeightCatch", err);
  }

  // Auto-exclusivity (project_agency_exclusivity_model.md): bulk import
  // follows the same rule as manual admin add — paid plans get
  // is_primary=TRUE unless the talent is already exclusive elsewhere.
  // We only stamp is_primary on the initial insert (the upsert collides
  // on tenant_id+talent_profile_id; re-import shouldn't toggle the flag
  // off a row that's been manually adjusted).
  const exclusivity = await resolveExclusivityForRosterAdd(
    admin,
    tenantId,
    talentProfileId,
  );

  // ─── FIND-THEN-WRITE, because the unique index is PARTIAL ─────────────────
  //
  // This was `.upsert(..., { onConflict: "tenant_id,talent_profile_id" })` and
  // it had NEVER SUCCEEDED. PostgREST turns that option into a bare
  // `ON CONFLICT (tenant_id, talent_profile_id)`, and the only unique index on
  // that pair is partial:
  //
  //   agency_talent_roster_tenant_talent_live_uniq
  //     UNIQUE (tenant_id, talent_profile_id)
  //     WHERE status = ANY (ARRAY['pending','active','inactive'])
  //
  // Postgres cannot infer a partial index from a predicate-less ON CONFLICT, so
  // every row returned 42P10 "there is no unique or exclusion constraint
  // matching the ON CONFLICT specification". Probed through the real PostgREST
  // client before changing anything, and again after.
  //
  // WHY THE INDEX IS NOT THE THING THAT CHANGED. Dropping the predicate would
  // make the bare ON CONFLICT legal and would BREAK RE-ADD. Removal is soft
  // (`status = "removed"`), and every re-add path does a plain `.insert()` with
  // no check for an existing removed row — the partial index is precisely what
  // lets that second row exist. Simulated it on a scratch copy of the table
  // before ruling it out: with a non-partial unique index the second insert
  // fails 23505. That trade would fix an import nobody has used by breaking a
  // path that works.
  //
  // So the code changes instead. Find the LIVE row for this pair (the same
  // three statuses the index covers), update it if present, insert if not.
  const { data: existingRoster, error: findErr } = await tenantScopedQuery(admin, "agency_talent_roster", tenantId)
    .select("id")
    .eq("talent_profile_id", talentProfileId)
    .in("status", ["pending", "active", "inactive"])
    .maybeSingle();
  if (findErr) return { ok: false, error: findErr.message };

  const existingRosterId = (existingRoster as { id: string } | null)?.id;
  if (existingRosterId) {
    // Re-import of a talent already on the roster. is_primary is deliberately
    // NOT touched: it may have been adjusted by hand since the first import,
    // and the old upsert's comment promised the same thing.
    const { error: updErr } = await tenantScopedQuery(admin, "agency_talent_roster", tenantId)
      .update({ status: "active" })
      .eq("id", existingRosterId);
    if (updErr) return { ok: false, error: updErr.message };
    return { ok: true, talentProfileId };
  }

  const { error: rosterErr } = await tenantScopedQuery(admin, "agency_talent_roster", tenantId)
    .insert({
      talent_profile_id: talentProfileId,
      status: "active",
      is_primary: exclusivity.shouldBeExclusive,
      exclusivity_status: exclusivity.exclusivityStatus,
      exclusivity_auto_assigned_at: exclusivity.autoAssignedAt,
    });
  // 23505 = another import inserted the same pair between our SELECT and this
  // INSERT. The row we wanted now exists, which is the outcome we asked for.
  if (rosterErr && rosterErr.code !== "23505") {
    return { ok: false, error: rosterErr.message };
  }

  return { ok: true, talentProfileId };
}
