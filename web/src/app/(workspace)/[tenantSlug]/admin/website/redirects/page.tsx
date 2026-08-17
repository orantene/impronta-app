/**
 * Website → Redirects — the workspace surface for 301/302 URL forwarding.
 *
 * Reads `cms_redirects` for this tenant. The rules are enforced at the edge by
 * `lib/cms/middleware-redirect.tryCmsRedirectResponse`, called from
 * `src/proxy.ts` before route matching, so a saved rule is live on the next
 * request with nothing to publish.
 *
 * Capability gate: `agency.site_admin.pages.edit` — a redirect changes what the
 * public site serves, so it sits with page editing rather than with the
 * owner-only financial surfaces. Same gate the write actions re-check.
 *
 * Route: /{tenantSlug}/admin/website/redirects
 */

import Link from "next/link";
import { notFound } from "next/navigation";

import { userHasCapability } from "@/lib/access";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { REDIRECT_LIST_LIMIT, type RedirectRecord } from "@/lib/site-admin/redirects";
import { loadWorkspaceDomainSummary } from "../../../_data-bridge/workspace-config";

import { RedirectsClient } from "./redirects-client";
import { C, FONT } from "./ui";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

type DbRow = {
  id: string;
  old_path: string;
  new_path: string;
  status_code: number;
  active: boolean;
  created_at: string;
  updated_at: string | null;
};

export default async function RedirectsPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  if (!(await userHasCapability("agency.site_admin.pages.edit", scope.tenantId))) {
    notFound();
  }

  const svc = createServiceRoleClient();
  if (!svc) notFound();

  const [listed, domains] = await Promise.all([
    svc
      .from("cms_redirects")
      .select("id, old_path, new_path, status_code, active, created_at, updated_at")
      .eq("tenant_id", scope.tenantId)
      .order("created_at", { ascending: false })
      .limit(REDIRECT_LIST_LIMIT),
    loadWorkspaceDomainSummary(scope.tenantId).catch(() => null),
  ]);

  if (listed.error) logServerError("redirects/page", listed.error);

  const redirects: RedirectRecord[] = ((listed.data ?? []) as DbRow[]).map((r) => ({
    id: r.id,
    oldPath: r.old_path,
    newPath: r.new_path,
    statusCode: r.status_code,
    active: r.active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: FONT }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: C.accent, marginBottom: 4 }}>
            {scope.membership.display_name}
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: C.ink, margin: 0, lineHeight: 1.1 }}>
            Redirects
          </h1>
          <div style={{ marginTop: 4, fontSize: 12.5, color: C.inkMuted, maxWidth: 560 }}>
            Send an old address on your site to a new one, so links people already have keep
            working and search engines follow the page to where it lives now.
          </div>
        </div>
        <Link
          href={`/${tenantSlug}/admin/website`}
          style={{ fontSize: 12.5, color: C.accent, textDecoration: "underline" }}
        >
          ← Website
        </Link>
      </div>

      <RedirectsClient
        tenantSlug={tenantSlug}
        initialRedirects={redirects}
        siteHost={domains?.primaryHost ?? ""}
        loadError={listed.error ? "Some redirects couldn't be loaded. Refresh to try again." : null}
      />
    </div>
  );
}
