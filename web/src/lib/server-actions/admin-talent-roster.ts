"use server";

// ============================================================================
// admin-talent-roster.ts — agency-side roster lifecycle actions for the
// prototype drawer.
// ============================================================================
//
// The canonical roster edit page (`/admin/roster/[id]/extended-actions.ts`)
// already implements the right business logic for talent removal:
//
//   - removeTalentFromRoster   → sets agency_talent_roster.status='removed'
//                                 (talent_profiles + auth.users untouched;
//                                  the talent keeps their Tulala account)
//   - hardDeleteTalent         → soft-deletes the talent_profiles row
//                                 (only when unclaimed + only this agency)
//
// But that file is colocated with the canonical page and uses tenantSlug
// resolution patterns that aren't a clean fit for the prototype's drawer
// (which already knows tenantId via bridge identity, not slug).
//
// This file is the prototype-facing wrapper: same business rules,
// scope-resolved via requireStaffTenantAction (tenantId-direct), returns
// a structured Result the drawer can render into a toast/inline error.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

// ─── Remove from roster (NOT account deletion) ───────────────────────────────
//
// Critical business rule (Oran 2026-05-07): "delete" in the workspace UI
// must NEVER delete the talent's Tulala account. It only severs the agency
// relationship.
//
//   ┌─────────────────────────────────────────────────────────────────────┐
//   │ remove_from_roster ≠ delete_talent                                  │
//   │                                                                     │
//   │ - agency_talent_roster.status     'active' → 'removed'              │
//   │ - agency_talent_roster.removed_at  NULL    → now()                  │
//   │ - talent_profiles                  UNTOUCHED                        │
//   │ - auth.users                       UNTOUCHED                        │
//   │ - media_assets                     UNTOUCHED                        │
//   │ - inquiry_talent (any active)      UNTOUCHED (history preserved)    │
//   │                                                                     │
//   │ Effect: the talent disappears from the agency's roster filter, but  │
//   │ they can still log in, can still be added to another agency, and    │
//   │ all their data persists. Reversible by setting status back.         │
//   └─────────────────────────────────────────────────────────────────────┘

const removeFromRosterSchema = z.object({
  talent_profile_id: z.string().uuid("Invalid talent profile id."),
});

export type RemoveFromRosterResult =
  | {
      ok: true;
      talent_profile_id: string;
      /** True when the talent has a claimed account (logs in to Tulala) — UI
       *  uses this to render the "they'll keep their Tulala account" copy
       *  more confidently in the success toast. */
      keptUserAccount: boolean;
    }
  | { ok: false; error: string };

export async function removeFromRoster(input: {
  talent_profile_id: string;
}): Promise<RemoveFromRosterResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, user } = auth;

  const parsed = removeFromRosterSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const v = parsed.data;

  // Look up current roster row to confirm it exists for this tenant + has
  // an active relationship (not already removed). Also peek at user_id so
  // the response can tell the caller whether the talent has a claimed
  // Tulala account (renders different copy in the success toast).
  const { data: rosterRow, error: rosterErr } = await supabase
    .from("agency_talent_roster")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", v.talent_profile_id)
    .maybeSingle();
  if (rosterErr) {
    logServerError("admin-talent-roster.remove.lookup", rosterErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  if (!rosterRow) {
    return { ok: false, error: "That talent isn't on your roster." };
  }
  if (rosterRow.status === "removed") {
    return { ok: false, error: "Already removed from your roster." };
  }

  const { data: profile } = await supabase
    .from("talent_profiles")
    .select("user_id")
    .eq("id", v.talent_profile_id)
    .maybeSingle();
  const keptUserAccount = !!profile?.user_id;

  const { error: updateErr } = await supabase
    .from("agency_talent_roster")
    .update({
      status: "removed",
      removed_at: new Date().toISOString(),
      removed_by: user.id,
    })
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", v.talent_profile_id);

  if (updateErr) {
    logServerError("admin-talent-roster.remove.update", updateErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath("/", "layout");
  return { ok: true, talent_profile_id: v.talent_profile_id, keptUserAccount };
}

// ─── Restore (undo) ──────────────────────────────────────────────────────────
//
// Owner mistakenly removed a talent? Restore flips status back to 'active'
// and clears removed_at + removed_by. The talent reappears in the roster
// and inquiry workflows immediately. No data loss because remove never
// touches anything else.

export async function restoreToRoster(input: {
  talent_profile_id: string;
}): Promise<RemoveFromRosterResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = removeFromRosterSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const v = parsed.data;

  const { error } = await supabase
    .from("agency_talent_roster")
    .update({
      status: "active",
      removed_at: null,
      removed_by: null,
    })
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", v.talent_profile_id)
    .eq("status", "removed"); // only restore from removed → active

  if (error) {
    logServerError("admin-talent-roster.restore", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  const { data: profile } = await supabase
    .from("talent_profiles")
    .select("user_id")
    .eq("id", v.talent_profile_id)
    .maybeSingle();

  revalidatePath("/", "layout");
  return {
    ok: true,
    talent_profile_id: v.talent_profile_id,
    keptUserAccount: !!profile?.user_id,
  };
}
