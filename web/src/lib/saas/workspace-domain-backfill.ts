/**
 * TUL-374: business workspaces created before onboarding registered their
 * platform subdomain have no `agency_domains` row, so `<slug>.tulala.digital`
 * is "not registered" and the site only lives at /w/<slug>. New signups are
 * covered by ensureWorkspaceSubdomainRow in provisioning; this plans the
 * one-off backfill for the old ones. Pure so the rule is testable; the script
 * (scripts/backfill-workspace-domains.mts) does the reads and writes.
 */
import { isRetiredWorkspaceStatus } from "@/lib/saas/workspace-lifecycle";
import { workspaceSubdomainHostname } from "@/lib/saas/ensure-workspace-domain";

export type BackfillAgency = {
  id: string;
  slug: string | null;
  status: string | null;
  workspace_type: string | null;
};
export type BackfillDomainRow = { tenant_id: string | null; hostname: string };

export type BackfillPlanItem = { tenantId: string; slug: string; hostname: string };
export type BackfillSkip = { tenantId: string; slug: string | null; reason: string };

export function planWorkspaceDomainBackfill(
  agencies: readonly BackfillAgency[],
  domains: readonly BackfillDomainRow[],
): { plan: BackfillPlanItem[]; skipped: BackfillSkip[] } {
  const byHostname = new Map<string, BackfillDomainRow>();
  for (const d of domains) byHostname.set(d.hostname.toLowerCase(), d);
  const plan: BackfillPlanItem[] = [];
  const skipped: BackfillSkip[] = [];
  for (const a of agencies) {
    const slug = a.slug?.trim().toLowerCase() || null;
    if (a.workspace_type !== "business") continue;
    if (!slug) {
      skipped.push({ tenantId: a.id, slug: null, reason: "no_slug" });
      continue;
    }
    if (isRetiredWorkspaceStatus(a.status)) {
      skipped.push({ tenantId: a.id, slug, reason: "retired" });
      continue;
    }
    const hostname = workspaceSubdomainHostname(slug);
    const existing = byHostname.get(hostname);
    if (existing) {
      if (existing.tenant_id !== a.id) skipped.push({ tenantId: a.id, slug, reason: "hostname_taken_by_other_tenant" });
      continue; // registered already (this tenant): nothing to do
    }
    plan.push({ tenantId: a.id, slug, hostname });
  }
  return { plan, skipped };
}

/** `--only`: keep plan items whose tenant id or slug is in the (lower-cased) set. */
export function filterBackfillPlan(plan: readonly BackfillPlanItem[], only: ReadonlySet<string>): BackfillPlanItem[] {
  return plan.filter((p) => only.has(p.tenantId.toLowerCase()) || only.has(p.slug.toLowerCase()));
}
