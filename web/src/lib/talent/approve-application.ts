/**
 * TUL-1871 / TUL-1368 · Approving a join application puts the talent on the roster.
 *
 * Pure of Next and of the real client: the admin client and the seat / exclusivity lookups are
 * injected, so the whole flow is testable with an in-memory fake. Order matters:
 *
 *   1. Read the live roster row for (workspace, talent). A row that is already counted
 *      (pending / active / inactive) needs no new seat; a fresh add is refused over the plan cap
 *      BEFORE anything is written, so an over-cap approve never half-happens.
 *   2. Claim the application: pending -> approved with decided_by / decided_at, as one conditional
 *      update. A second click (or a second admin) claims zero rows and gets "already decided".
 *   3. Write the roster row (insert, or reactivate). If that fails the claim is released back to
 *      pending, so the application never says approved while the talent is missing.
 *
 * The talent's proposed terms stay on the application message (and the decision note). The
 * structured terms are the owner's to send (TUL-1476, proposeTermsOnJoin): they are pending until
 * the talent accepts, so approving never invents money terms.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type ApplicationTable = "talent_agency_applications" | "talent_hub_applications";
export type ApproveLocale = "en" | "es";

export type ApproveExclusivity = {
  shouldBeExclusive: boolean;
  exclusivityStatus: "confirmed" | "auto_assigned";
  autoAssignedAt: string | null;
};

export type ApproveDeps = {
  /** Seat check for ONE new seat. `limit` is the plan cap shown in the message. */
  checkSeat: (tenantId: string) => Promise<{ ok: true } | { ok: false; limit: number | null }>;
  /** Null when the workspace is not in exclusive mode. */
  resolveExclusivity: (tenantId: string, talentProfileId: string) => Promise<ApproveExclusivity | null>;
  /** The workspace's default roster visibility for new joins. */
  defaultVisibility: "roster_only" | "site_visible";
  now?: () => string;
};

export type ApproveInput = {
  table: ApplicationTable;
  applicationId: string;
  tenantId: string;
  talentProfileId: string;
  userId: string;
  note: string | null;
  locale: ApproveLocale;
};

export type ApproveOutcome =
  | { ok: true; rosterAdded: boolean }
  | { ok: false; code: "already_decided" | "seat_limit" | "db_error"; error: string };

export function seatLimitApproveMessage(limit: number | null, locale: ApproveLocale): string {
  if (locale === "es") {
    return limit === 0
      ? "Este plan no incluye un roster de talentos. Mejora tu plan para aprobar solicitudes."
      : `Tu roster llegó al límite de tu plan${limit != null ? ` (${limit})` : ""}. Mejora tu plan o libera un lugar para aprobar a esta persona. La solicitud sigue pendiente.`;
  }
  return limit === 0
    ? "This plan does not include a talent roster. Upgrade your plan to approve applications."
    : `Your roster is at its plan limit${limit != null ? ` (${limit})` : ""}. Upgrade your plan or free a seat to approve this person. The application stays pending.`;
}

const genericError = (locale: ApproveLocale) =>
  locale === "es" ? "No se pudo aprobar la solicitud. Inténtalo de nuevo." : "Couldn't approve the application. Please try again.";

type LiveRow = { id: string; status: string };

export async function approveApplicationIntoRoster(
  admin: Pick<SupabaseClient, "from">,
  input: ApproveInput,
  deps: ApproveDeps,
): Promise<ApproveOutcome> {
  const now = (deps.now ?? (() => new Date().toISOString()))();
  const fail = (code: "db_error"): ApproveOutcome => ({ ok: false, code, error: genericError(input.locale) });

  // 1. Live roster row (the unique index allows one per workspace + talent).
  const liveRes = await admin
    .from("agency_talent_roster")
    .select("id, status")
    .eq("tenant_id", input.tenantId)
    .eq("talent_profile_id", input.talentProfileId)
    .in("status", ["pending", "active", "inactive"])
    .limit(1);
  if (liveRes.error) return fail("db_error");
  const live = ((liveRes.data ?? []) as LiveRow[])[0] ?? null;

  if (!live) {
    const seat = await deps.checkSeat(input.tenantId);
    if (!seat.ok) return { ok: false, code: "seat_limit", error: seatLimitApproveMessage(seat.limit, input.locale) };
  }

  // 2. Claim: only a still-pending application can be approved, exactly once.
  const claim = await admin
    .from(input.table)
    .update({ status: "approved", decision_note: input.note, decided_by_user_id: input.userId, decided_at: now })
    .eq("id", input.applicationId)
    .eq("status", "pending")
    .select("id");
  if (claim.error) return fail("db_error");
  if (((claim.data ?? []) as unknown[]).length === 0) {
    return {
      ok: false,
      code: "already_decided",
      error: input.locale === "es" ? "Esta solicitud ya fue resuelta." : "This application was already decided.",
    };
  }

  const release = () =>
    admin
      .from(input.table)
      .update({ status: "pending", decision_note: null, decided_by_user_id: null, decided_at: null })
      .eq("id", input.applicationId)
      .eq("status", "approved");

  // 3. Roster row.
  if (live?.status === "active") return { ok: true, rosterAdded: false };

  const exclusivity = await deps.resolveExclusivity(input.tenantId, input.talentProfileId);
  const exclusiveFields = exclusivity?.shouldBeExclusive
    ? {
        is_primary: true,
        exclusivity_status: exclusivity.exclusivityStatus,
        exclusivity_auto_assigned_at: exclusivity.autoAssignedAt,
      }
    : {};

  if (live) {
    const upd = await admin
      .from("agency_talent_roster")
      .update({ status: "active", agency_visibility: deps.defaultVisibility, ...exclusiveFields })
      .eq("id", live.id);
    if (upd.error) {
      await release();
      return fail("db_error");
    }
    return { ok: true, rosterAdded: true };
  }

  const ins = await admin.from("agency_talent_roster").insert({
    tenant_id: input.tenantId,
    talent_profile_id: input.talentProfileId,
    source_type: "freelancer_claimed",
    status: "active",
    agency_visibility: deps.defaultVisibility,
    hub_visibility_status: "not_submitted",
    is_primary: false,
    added_by: input.userId,
    source_workspace_id: input.tenantId,
    ...exclusiveFields,
  });
  // 23505 = another request already wrote the live row between our read and insert: that is
  // the state we wanted, so it is a success, not a failure.
  if (ins.error && (ins.error as { code?: string }).code !== "23505") {
    await release();
    return fail("db_error");
  }
  return { ok: true, rosterAdded: !ins.error };
}
