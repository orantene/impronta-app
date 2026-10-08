import { improntaLog } from "@/lib/server/structured-log";
import { getPlatformHubTenant } from "@/lib/saas/platform-hub";
import { createServiceRoleClient } from "@/lib/supabase/admin";

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
let cachedHubTenantId: string | null = null;

/** Test hook: forget the process-level hub cache. */
export function __resetHubTenantCacheForTests(): void {
  cachedHubTenantId = null;
}

/**
 * Hub agency that owns tenant-less guest events. Looked up with the same
 * resolver the rest of the app uses (never hard-coded; 0000...0001 is the real
 * impronta customer agency). Cached for the process once resolved; a failed or
 * empty lookup is not cached and yields null.
 */
async function resolveGuestEventTenantId(
  resolveHub: () => Promise<{ tenantId: string } | null>,
): Promise<string | null> {
  if (cachedHubTenantId) return cachedHubTenantId;
  try {
    const hub = await resolveHub();
    if (hub?.tenantId) cachedHubTenantId = hub.tenantId;
  } catch {
    // fall through: not persisted
  }
  return cachedHubTenantId;
}

export async function logAnalyticsEventServer(
  input: LogAnalyticsEventInput,
  client?: Pick<NonNullable<ReturnType<typeof createServiceRoleClient>>, "from"> | null,
  deps?: { resolveHub?: () => Promise<{ tenantId: string } | null> },
): Promise<void> {
  // analytics_events.tenant_id is NOT NULL and references agencies(id). A guest
  // event (no provable tenant) is attributed to the platform hub agency; if the
  // hub cannot be resolved it is not persisted (never a customer's tenant).
  const tenantId =
    input.tenantId || (await resolveGuestEventTenantId(deps?.resolveHub ?? getPlatformHubTenant));
  if (!tenantId) {
    if (process.env.NODE_ENV === "development") {
      // Dev-only signal: a guest event with no resolvable hub is dropped, never attributed to a customer tenant.
      // eslint-disable-next-line no-console
      console.warn(`[logAnalyticsEventServer] no tenant for guest event, not persisted (${input.name})`);
    }
    return;
  }

  const supabase = client ?? createServiceRoleClient();
  if (!supabase) return;

  const { error } = await supabase.from("analytics_events").insert({
    name: input.name,
    payload: (input.payload ?? {}) as Record<string, unknown>,
    session_id: input.sessionId ?? null,
    user_id: input.userId ?? null,
    talent_id: input.talentId ?? null,
    tenant_id: tenantId,
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
