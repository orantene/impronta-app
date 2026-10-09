/**
 * TUL-347 — absolute storefront editor URL for a business workspace site.
 *
 * "Edit my site" must open the LIVE storefront with `?edit=1`, never the
 * English `/admin/website` shell (and never an app-host fallback that leaves
 * a tab stuck on about:blank). Uses the same address math as the admin
 * "live URL" (`workspaceLiveUrl`): branded host when a live domain row
 * exists, otherwise the canonical `tulala.digital/w/<slug>` path.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildEditorPanelUrl } from "@/lib/admin/website-editor-links";
import { workspaceLiveUrl } from "@/lib/saas/workspace-live-url";
import { workspacePathUrl } from "@/lib/saas/workspace-public-url";
import { logServerError } from "@/lib/server/safe-error";

export async function resolveWorkspaceSiteEditorUrl(
  admin: Pick<SupabaseClient, "from">,
  input: { tenantId: string; slug: string },
): Promise<string | null> {
  const [{ data: agency, error: agencyError }, { data: domains, error: domainsError }] =
    await Promise.all([
      admin.from("agencies").select("slug, plan_tier").eq("id", input.tenantId).maybeSingle(),
      admin
        .from("agency_domains")
        .select("hostname, kind, status, is_primary")
        .eq("tenant_id", input.tenantId)
        .in("kind", ["custom", "subdomain"]),
    ]);

  if (agencyError) logServerError("talentSite.workspaceEditorUrl.agency", agencyError);
  if (domainsError) logServerError("talentSite.workspaceEditorUrl.domains", domainsError);

  const slug = (agency as { slug?: string | null } | null)?.slug?.trim() || input.slug;
  const planTier = (agency as { plan_tier?: string | null } | null)?.plan_tier ?? null;
  const rows = (domains ?? []) as Array<{
    hostname: string;
    kind: string;
    status: string | null;
    is_primary?: boolean | null;
  }>;

  const liveUrl =
    agency && !agencyError && !domainsError
      ? workspaceLiveUrl({
          slug,
          planTier,
          domains: {
            subdomains: rows
              .filter((r) => r.kind === "subdomain")
              .map((r) => ({
                hostname: r.hostname,
                status: r.status,
                isPrimary: r.is_primary === true,
              })),
            customDomains: rows
              .filter((r) => r.kind === "custom")
              .map((r) => ({
                hostname: r.hostname,
                status: r.status,
                isPrimary: r.is_primary === true,
              })),
          },
        })
      : workspacePathUrl(slug);

  return buildEditorPanelUrl({ editorBaseUrl: liveUrl, panel: "sections" });
}

/** Public storefront URL only (no ?edit=1) — for "My website" address display. */
export async function resolveWorkspaceSitePublicUrl(
  admin: Pick<SupabaseClient, "from">,
  input: { tenantId: string; slug: string },
): Promise<string> {
  const editor = await resolveWorkspaceSiteEditorUrl(admin, input);
  if (!editor) return workspacePathUrl(input.slug);
  try {
    const u = new URL(editor);
    u.search = "";
    u.hash = "";
    // buildEditorPanelUrl appends a trailing `/` before `?edit=1`; strip it for
    // a clean shareable address that still matches the live storefront.
    return u.toString().replace(/\/$/, "") || workspacePathUrl(input.slug);
  } catch {
    return workspacePathUrl(input.slug);
  }
}
