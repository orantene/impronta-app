"use server";

/**
 * door-actions.ts — the scan. One entry point, three layers, no shortcuts.
 *
 *   1. VERIFY THE SIGNATURE, in the app, where the HMAC key lives. A string
 *      that is not ours never reaches the database — querying an id an attacker
 *      chose is a lookup they got us to perform.
 *   2. AUTHORISE THE SCANNER. `check_in` is service-role only and takes no
 *      tenant, so it will cheerfully admit another tenant's guest if handed
 *      their id. THE SCOPING IS THIS FILE'S JOB and there is nowhere else it
 *      can happen — that obligation is stated in the function's own comment.
 *   3. CALL `check_in` with `p_mode => 'token'` and the version the signature
 *      carried. The row decides; this reports.
 *
 *
 * WHY THE MODE IS PASSED EXPLICITLY EVERY TIME
 * ═══════════════════════════════════════════
 * `check_in` refuses `mode => 'token'` without a version rather than skipping
 * the check. That is the Events & Ticketing Manager's shape and it is better
 * than the `DEFAULT NULL` I proposed: a defaulted version makes the check
 * opt-out by omission, so a caller that forgets the argument admits a
 * superseded ticket silently. Here the mode is not optional and not derived —
 * it is stated, so the wrong call cannot be constructed.
 *
 *
 * WHAT THIS FILE MUST NEVER GROW
 * ═════════════════════════════
 * A branch that admits without `check_in` saying so. Every refusal below
 * returns before the RPC or renders the RPC's answer; none of them invents an
 * admittance. `check_in` holds the row lock and is the only authority on
 * entitlement, and a second one here would be invisible until two scanners
 * disagreed at a door.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import { verifyAdmissionToken } from "@/lib/sessions/admission-token";
import {
  doorOutcomeForCheckIn,
  doorOutcomeForToken,
  type DoorOutcome,
} from "@/lib/sessions/door";

export type ScanResult = { outcome: DoorOutcome };

/**
 * Scan one QR at the door for one workspace.
 *
 * `units` is how many of a party to admit — 1 for a ticket, more when a host
 * seats several of a booking at once. It is passed to `check_in`, which checks
 * it against the REMAINDER rather than the party size, so "2 of 4 seated, admit
 * 3 more" is refused instead of overfilling the row.
 */
export async function scanAdmission(
  tenantId: string,
  rawToken: string,
  units = 1,
): Promise<ScanResult> {
  try {
    // ── 1. The signature, before anything reaches the database ──────────────
    const verdict = verifyAdmissionToken(rawToken);
    const early = doorOutcomeForToken(verdict);
    if (early) return { outcome: early };
    if (!verdict.ok) {
      // Unreachable — doorOutcomeForToken returns non-null for every !ok — but
      // the compiler cannot see that and a fallthrough here would be an
      // admittance path. Explicit rather than assumed.
      return { outcome: { kind: "forged" } };
    }

    // ── 2. The scanner, and the tenant the function will not check ──────────
    const staff = await requireWorkspaceStaffAction();
    if (!staff.ok) {
      return { outcome: { kind: "engine_error", detail: "not_authorized" } };
    }
    if (staff.tenantId !== tenantId) {
      return { outcome: { kind: "engine_error", detail: "wrong_workspace" } };
    }

    const admin = createServiceRoleClient();
    if (!admin) {
      return { outcome: { kind: "engine_error", detail: "service_unavailable" } };
    }

    // The scoping `check_in` does not do. A signed token names an admission,
    // not a workspace, so a genuine ticket from another tenant would otherwise
    // check in here — the exact case their header names as the caller's
    // obligation.
    const { data: owned, error: ownerError } = await admin
      .from("admissions")
      .select("id")
      .eq("id", verdict.admissionId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (ownerError) {
      logServerError("sessions.scanAdmission.scope", ownerError);
      return { outcome: { kind: "engine_error", detail: "scope_check_failed" } };
    }
    if (!owned) {
      // Deliberately the same answer as a genuinely unknown ticket: a scanner
      // in workspace A learns nothing about whether an id exists in B.
      return { outcome: { kind: "unknown_ticket" } };
    }

    // ── 3. The row decides ──────────────────────────────────────────────────
    const { data, error } = await admin.rpc("check_in", {
      p_admission_id: verdict.admissionId,
      p_count: units,
      p_actor: staff.user.id,
      p_token_version: verdict.tokenVersion,
      p_mode: "token",
    });
    if (error) {
      logServerError("sessions.scanAdmission.check_in", error);
      return { outcome: { kind: "engine_error", detail: "check_in_failed" } };
    }

    return { outcome: doorOutcomeForCheckIn(data as Record<string, unknown>) };
  } catch (err) {
    logServerError("sessions.scanAdmission", err);
    // A throw is never an admittance.
    return {
      outcome: { kind: "engine_error", detail: err instanceof Error ? err.message : "unknown" },
    };
  }
}
