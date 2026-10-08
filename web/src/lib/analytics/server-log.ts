import { improntaLog } from "@/lib/server/structured-log";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * Tenant that owns events with no provable tenant (guests on the marketing /
 * app / /start hosts). `analytics_events.tenant_id` is NOT NULL and, on the
 * live table (created by the tenant_id enforce migration, not the bootstrap),
 * has no column default, so omitting it fails with a NOT NULL violation and
 * the guest funnel event is lost. The bootstrap migration documents this same
 * constant as the home of un-tenanted writes.
 */
export const PLATFORM_ANALYTICS_TENANT_ID = "00000000-0000-0000-0000-000000000001";
export type LogAnalyticsEventInput = {
  name: string;
  payload?: Record<string, unknown>;
  sessionId?: string | null;
  userId?: string | null;
  talentId?: string | null;
  /** Agency/tenant UUID. When provided, per-tenant analytics queries return real rows
   * instead of 0 (admin-data.ts already filters .eq('tenant_id', tenantId)). */
  tenantId?: string | null;
  path?: string | null;
  locale?: string | null;
};

/**
 * Server-only insert into `analytics_events`. Best-effort; never throws to callers.
 */
export async function logAnalyticsEventServer(
  input: LogAnalyticsEventInput,
  client?: Pick<NonNullable<ReturnType<typeof createServiceRoleClient>>, "from"> | null,
): Promise<void> {
  const supabase = client ?? createServiceRoleClient();
  if (!supabase) return;

  const { error } = await supabase.from("analytics_events").insert({
    name: input.name,
    payload: (input.payload ?? {}) as Record<string, unknown>,
    session_id: input.sessionId ?? null,
    user_id: input.userId ?? null,
    talent_id: input.talentId ?? null,
    tenant_id: input.tenantId ?? PLATFORM_ANALYTICS_TENANT_ID,
    path: input.path ?? null,
    locale: input.locale ?? null,
  });

  if (error && process.env.NODE_ENV === "development") {
    void improntaLog("analytics_server_log.warn", {
      message: "[logAnalyticsEventServer]",
      error: error.message,
    });
  }
}
