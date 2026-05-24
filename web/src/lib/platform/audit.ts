import { createServiceRoleClient } from "@/lib/supabase/admin";

export type PlatformAuditTargetKind =
  | "profile"
  | "talent_profile"
  | "workspace"
  | "membership";

export interface LogPlatformAdminActionParams {
  actorUserId: string;
  targetKind: PlatformAuditTargetKind;
  targetId: string;
  action: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

/**
 * Append a row to `public.platform_audit_log`.
 *
 * Writes go through the Supabase service-role client (bypassing RLS).
 * Errors are swallowed and logged — audit failures must never break the
 * caller's primary action. See platform-users-control-center-plan §2 / §7.
 */
export async function logPlatformAdminAction(
  params: LogPlatformAdminActionParams,
): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    if (!supabase) {
      // eslint-disable-next-line no-console
      console.error(
        "[logPlatformAdminAction] service-role client unavailable; skipping audit write",
        { action: params.action, targetKind: params.targetKind },
      );
      return;
    }

    const { error } = await supabase.from("platform_audit_log").insert({
      actor_user_id: params.actorUserId,
      target_kind: params.targetKind,
      target_id: params.targetId,
      action: params.action,
      before_jsonb: params.before ?? null,
      after_jsonb: params.after ?? null,
      context_jsonb: params.context ?? null,
    });

    if (error) {
      // eslint-disable-next-line no-console
      console.error("[logPlatformAdminAction] insert failed", {
        action: params.action,
        targetKind: params.targetKind,
        targetId: params.targetId,
        error: error.message,
      });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[logPlatformAdminAction] unexpected error", {
      action: params.action,
      err,
    });
  }
}
