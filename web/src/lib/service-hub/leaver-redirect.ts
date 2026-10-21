/**
 * TUL-1591 (a): a talent who LEFT a workspace. Her old links on that workspace's site go
 * to the group instead of a dead page (rule `leavingOutcome`, TUL-1378 / #4178: links go
 * to the group while it exists; on the group's own host it always does). Open bookings
 * are untouched by leaving; her listings leave the hub (public-hub.server.ts).
 *
 * Edge-safe: no server-only imports. The database answers yes/no only
 * (`public.talent_left_workspace`, held migration 20261231422800); any doubt is a no, so
 * the visitor keeps today's real 404 rather than a guess.
 */

export const LEAVER_REDIRECT_RPC = "talent_left_workspace";

const LOCALE = /^[a-z]{2}$/;

/** The group's home on its own host, keeping the visitor's locale prefix when it is a plain two-letter one. */
export function leaverRedirectPath(locale: string | null | undefined): string {
  return typeof locale === "string" && LOCALE.test(locale) ? `/${locale}` : "/";
}

type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

/** True only when the database says this code is a former (removed, not active) member of this workspace. */
export async function talentLeftWorkspace(client: RpcClient, tenantId: string, profileCode: string): Promise<boolean> {
  const code = profileCode.trim();
  if (!tenantId || !code) return false;
  try {
    const { data, error } = await client.rpc(LEAVER_REDIRECT_RPC, { p_tenant_id: tenantId, p_profile_code: code });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}
