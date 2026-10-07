/**
 * The workspace's platform subdomain row (`<slug>.tulala.digital`) in
 * `agency_domains`, so the address is registered like every other workspace.
 * Idempotent: an existing row for the hostname (this tenant) is a no-op.
 * `kind` is NOT NULL (`subdomain` | `custom` | ...); the old talent shortcut
 * omitted it, so its insert never landed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

export const PLATFORM_WORKSPACE_DOMAIN_SUFFIX = "tulala.digital";

export function workspaceSubdomainHostname(slug: string): string {
  return `${slug}.${PLATFORM_WORKSPACE_DOMAIN_SUFFIX}`;
}

export async function ensureWorkspaceSubdomainRow(
  admin: SupabaseClient,
  args: { tenantId: string; slug: string },
): Promise<{ ok: true; created: boolean } | { ok: false; error: string }> {
  const hostname = workspaceSubdomainHostname(args.slug);
  const { data, error } = await admin
    .from("agency_domains")
    .select("id, tenant_id")
    .eq("hostname", hostname)
    .maybeSingle();
  if (error) {
    logServerError("ensure-workspace-domain.read", error);
    return { ok: false, error: "domain_read_failed" };
  }
  if (data) {
    return (data as { tenant_id: string | null }).tenant_id === args.tenantId
      ? { ok: true, created: false }
      : { ok: false, error: "hostname_taken" };
  }
  const { data: primary } = await admin
    .from("agency_domains")
    .select("id")
    .eq("tenant_id", args.tenantId)
    .eq("is_primary", true)
    .maybeSingle();
  const { error: insertErr } = await admin.from("agency_domains").insert({
    tenant_id: args.tenantId,
    hostname,
    kind: "subdomain",
    status: "active",
    is_primary: !primary,
  });
  if (insertErr) {
    logServerError("ensure-workspace-domain.insert", insertErr);
    return { ok: false, error: "domain_insert_failed" };
  }
  return { ok: true, created: true };
}
