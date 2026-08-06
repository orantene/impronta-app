import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  scheduleWorkspaceAudit,
  scheduleWorkspaceAuditWith,
  type WorkspaceAuditCategory,
  type WorkspaceAuditEvent,
} from "./workspace-audit";

type AuditExtras = Partial<
  Pick<
    WorkspaceAuditEvent,
    | "targetType"
    | "targetId"
    | "targetLabel"
    | "metadata"
    | "actorUserId"
    | "actorLabel"
    | "actorKind"
  >
>;

/**
 * Positional wrapper around {@link scheduleWorkspaceAudit} for call sites in
 * files that are close to the 800-line budget: it keeps instrumentation to a
 * line or two instead of a ten-line object literal.
 *
 * Also absorbs the `tenantId` null-guard that several actions need (talent-self
 * and platform-admin paths can resolve no tenant) — a falsy tenant skips the
 * event rather than making every call site wrap itself in an `if`.
 */
export function auditEvent(
  tenantId: string | null | undefined,
  category: WorkspaceAuditCategory,
  action: string,
  summary: string,
  extra?: AuditExtras,
): void {
  if (!tenantId) return;
  scheduleWorkspaceAudit({ tenantId, category, action, summary, ...extra });
}

/**
 * Audit an action on a talent, naming the talent.
 *
 * A row that says `talent_profile · 1d6bcec0-874d-…` tells a human nothing —
 * "who touched what" is the whole point of this log, so the display name has to
 * be there. Most roster actions only have the id in scope.
 *
 * The lookup is FREE at request time: it runs inside the deferred write (after
 * the response has flushed), so the user never waits on it. That is exactly
 * what `scheduleWorkspaceAuditWith` exists for.
 *
 * `summary` receives the resolved name (null if it could not be read) so each
 * call site phrases its own sentence.
 */
export function auditTalentEvent(
  tenantId: string | null | undefined,
  category: WorkspaceAuditCategory,
  action: string,
  talentProfileId: string | null | undefined,
  summary: (talentName: string | null) => string,
  extra?: AuditExtras,
): void {
  if (!tenantId) return;
  scheduleWorkspaceAuditWith(async () => {
    const name = talentProfileId ? await lookupTalentName(talentProfileId) : null;
    return {
      tenantId,
      category,
      action,
      summary: summary(name),
      targetType: "talent_profile",
      targetId: talentProfileId ?? null,
      targetLabel: name,
      ...extra,
    };
  }, action);
}

/**
 * Audit an action on a workspace member, naming the person.
 *
 * Same reasoning as {@link auditTalentEvent}: "Removed a team member" plus a
 * bare profile id is not an answer to "who did you remove?".
 *
 * The lookup lives here rather than in the calling server action on purpose:
 * the `ratchet/no-untenanted-from` rule (correctly) forbids new raw
 * `.from("profiles")` reads inside server actions, and this is a deferred,
 * post-response read for display only.
 */
export function auditMemberEvent(
  tenantId: string | null | undefined,
  action: string,
  profileId: string | null | undefined,
  summary: (memberName: string | null) => string,
  extra?: AuditExtras,
): void {
  if (!tenantId) return;
  scheduleWorkspaceAuditWith(async () => {
    const name = profileId ? await lookupMemberName(profileId) : null;
    return {
      tenantId,
      category: "team" as const,
      action,
      summary: summary(name),
      targetType: "membership",
      targetId: profileId ?? null,
      targetLabel: name,
      ...extra,
    };
  }, action);
}

/** Best-effort display name for a member. Runs post-response; never throws. */
async function lookupMemberName(profileId: string): Promise<string | null> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return null;
    const { data } = await admin
      .from("profiles")
      .select("display_name, email")
      .eq("id", profileId)
      .maybeSingle();
    const row = data as { display_name?: string | null; email?: string | null } | null;
    return row?.display_name?.trim() || row?.email?.trim() || null;
  } catch {
    return null;
  }
}

/** Best-effort display name for a talent. Runs post-response; never throws. */
async function lookupTalentName(talentProfileId: string): Promise<string | null> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return null;
    const { data } = await admin
      .from("talent_profiles")
      .select("display_name, first_name")
      .eq("id", talentProfileId)
      .maybeSingle();
    const row = data as { display_name?: string | null; first_name?: string | null } | null;
    return row?.display_name?.trim() || row?.first_name?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Record something that FAILED or was REFUSED.
 *
 * Deliberately NOT a mirror of `logServerError` — there are hundreds of those
 * and most carry no workspace context, so piping them all in would flood the
 * log (and the retention cap) with noise support can't act on. This is for
 * failures a workspace admin or Tulala support would actually ask about:
 * a refused permission, an upload that did not land, a payment that failed.
 *
 * Ordinary crashes stay in Sentry (`logServerError`); the two systems answer
 * different questions.
 *
 * By convention the action ends in `.denied` or `.failed` so the table can
 * flag the row — see `isFailureAction` in the activity-log filter module.
 * Keep `reason` short and free of secrets; it is shown to workspace admins.
 */
export function auditFailure(
  tenantId: string | null | undefined,
  category: WorkspaceAuditCategory,
  action: string,
  summary: string,
  extra?: AuditExtras & { reason?: string },
): void {
  if (!tenantId) return;
  const { reason, ...rest } = extra ?? {};
  scheduleWorkspaceAudit({
    tenantId,
    category,
    action,
    summary,
    ...rest,
    metadata: { ...(rest.metadata ?? {}), ...(reason ? { reason } : {}) },
  });
}
