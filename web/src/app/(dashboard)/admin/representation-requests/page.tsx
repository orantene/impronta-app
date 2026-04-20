import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusTabs } from "@/components/admin/admin-status-tabs";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import {
  ADMIN_PAGE_STACK,
  ADMIN_SECTION_TITLE_CLASS,
} from "@/lib/dashboard-shell-classes";
import { formatAdminTimestamp } from "@/lib/admin/format-admin-timestamp";
import {
  canReviewRepresentationRequest,
  getCurrentUserTenants,
  type RepresentationRequestStatus,
  type RepresentationTargetType,
} from "@/lib/saas";
import { RepresentationRequestRowActions } from "./representation-request-row-actions";

export const dynamic = "force-dynamic";

type RawRow = {
  id: string;
  talent_profile_id: string;
  target_type: RepresentationTargetType;
  target_id: string;
  status: RepresentationRequestStatus;
  reviewer_reason: string | null;
  requested_by: string | null;
  requested_at: string;
  requester_note: string | null;
  reviewed_at: string | null;
  picked_up_at: string | null;
  talent_profiles: { display_name: string | null; profile_code: string | null } | null;
  target_agency: { slug: string; display_name: string } | null;
  requester: { display_name: string | null } | null;
};

const TARGET_TABS: Array<{ key: "all" | RepresentationTargetType; label: string }> = [
  { key: "all", label: "All" },
  { key: "agency", label: "Agency applications" },
  { key: "hub", label: "Hub visibility" },
];

const STATUS_TABS: Array<{ key: "all" | RepresentationRequestStatus; label: string }> = [
  { key: "all", label: "All" },
  { key: "requested", label: "Queue" },
  { key: "under_review", label: "Under review" },
  { key: "accepted", label: "Accepted" },
  { key: "rejected", label: "Rejected" },
  { key: "withdrawn", label: "Withdrawn" },
];

function buildHref(params: {
  target?: string;
  status?: string;
}): string {
  const q = new URLSearchParams();
  if (params.target && params.target !== "all") q.set("target", params.target);
  if (params.status && params.status !== "all") q.set("status", params.status);
  const s = q.toString();
  return s
    ? `/admin/representation-requests?${s}`
    : "/admin/representation-requests";
}

function statusPill(status: RepresentationRequestStatus): string {
  switch (status) {
    case "requested":
      return "bg-amber-500/10 text-amber-200 ring-amber-500/30";
    case "under_review":
      return "bg-blue-500/10 text-blue-200 ring-blue-500/30";
    case "accepted":
      return "bg-emerald-500/10 text-emerald-200 ring-emerald-500/30";
    case "rejected":
      return "bg-rose-500/10 text-rose-200 ring-rose-500/30";
    case "withdrawn":
    default:
      return "bg-muted/30 text-muted-foreground ring-border/40";
  }
}

export default async function AdminRepresentationRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ target?: string; status?: string }>;
}) {
  const { target: targetParam, status: statusParam } = await searchParams;
  const targetFilter =
    targetParam === "agency" || targetParam === "hub" ? targetParam : undefined;
  const statusFilter =
    statusParam === "requested" ||
    statusParam === "under_review" ||
    statusParam === "accepted" ||
    statusParam === "rejected" ||
    statusParam === "withdrawn"
      ? statusParam
      : undefined;

  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    return <p className="text-sm text-muted-foreground">Supabase not configured.</p>;
  }

  const tenants = await getCurrentUserTenants();
  const tenantNameById = new Map(tenants.map((t) => [t.tenant_id, t.display_name]));

  let query = supabase
    .from("talent_representation_requests")
    .select(
      `
        id, talent_profile_id, target_type, target_id, status,
        reviewer_reason, requested_by, requested_at, requester_note,
        reviewed_at, picked_up_at,
        talent_profiles:talent_profile_id ( display_name, profile_code ),
        target_agency:target_id ( slug, display_name ),
        requester:requested_by ( display_name )
      `,
    )
    .order("requested_at", { ascending: false });

  if (targetFilter) query = query.eq("target_type", targetFilter);
  if (statusFilter) query = query.eq("status", statusFilter);

  const { data, error } = await query;

  if (error) {
    // Pre-migration fallback: if the hosted DB predates Phase 7, the table
    // simply doesn't exist. Show a helpful empty state rather than a 500.
    const message = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
    if (message.includes("relation") && message.includes("does not exist")) {
      return (
        <div className={ADMIN_PAGE_STACK}>
          <AdminPageHeader
            icon={ShieldCheck}
            title="Representation requests"
            description="Review talent applications to agency rosters and hub visibility submissions."
          />
          <DashboardSectionCard
            title="Migration pending"
            description="`talent_representation_requests` has not been applied to this database."
            titleClassName={ADMIN_SECTION_TITLE_CLASS}
          >
            <p className="text-sm text-muted-foreground">
              Apply <code className="font-mono text-[11px]">20260604100000_saas_p7_talent_representation_requests.sql</code> to enable this workspace.
            </p>
          </DashboardSectionCard>
        </div>
      );
    }
    logServerError("admin/representation-requests/list", error);
    return <p className="text-sm text-destructive">{CLIENT_ERROR.loadPage}</p>;
  }

  const rows = ((data ?? []) as unknown as RawRow[]).map((row) => {
    const talent = Array.isArray(row.talent_profiles)
      ? row.talent_profiles[0] ?? null
      : row.talent_profiles;
    const targetAgency = Array.isArray(row.target_agency)
      ? row.target_agency[0] ?? null
      : row.target_agency;
    const requester = Array.isArray(row.requester)
      ? row.requester[0] ?? null
      : row.requester;
    return {
      ...row,
      talentDisplay:
        talent?.display_name?.trim()
        || talent?.profile_code?.trim()
        || row.talent_profile_id.slice(0, 8),
      targetDisplay:
        targetAgency?.display_name
        ?? tenantNameById.get(row.target_id)
        ?? row.target_id.slice(0, 8),
      requesterDisplay: requester?.display_name ?? null,
    };
  });

  // Per-row reviewer gate — derives which action buttons are visible. App-layer
  // preview only; the engine + RLS are authoritative.
  const reviewEligibility = await Promise.all(
    rows.map((row) =>
      canReviewRepresentationRequest(row.target_type, row.target_id),
    ),
  );

  const counts = {
    total: rows.length,
    queue: rows.filter((r) => r.status === "requested").length,
    under_review: rows.filter((r) => r.status === "under_review").length,
  };

  return (
    <div className={ADMIN_PAGE_STACK}>
      <AdminPageHeader
        icon={ShieldCheck}
        title="Representation requests"
        description="Unified queue for talent→agency applications and hub visibility submissions. Agency admins review their own tenant's applications; platform admins review hub requests."
        below={
          <p className="text-xs text-muted-foreground">
            {counts.total} request{counts.total === 1 ? "" : "s"} in this view · {counts.queue} awaiting pickup · {counts.under_review} under review
          </p>
        }
      />

      <AdminStatusTabs
        ariaLabel="Target type"
        items={TARGET_TABS.map((tab) => ({
          href: buildHref({
            target: tab.key === "all" ? undefined : tab.key,
            status: statusFilter,
          }),
          label: tab.label,
          active: tab.key === "all" ? !targetFilter : targetFilter === tab.key,
        }))}
      />

      <AdminStatusTabs
        ariaLabel="Status"
        items={STATUS_TABS.map((tab) => ({
          href: buildHref({
            target: targetFilter,
            status: tab.key === "all" ? undefined : tab.key,
          }),
          label: tab.label,
          active: tab.key === "all" ? !statusFilter : statusFilter === tab.key,
        }))}
      />

      {rows.length === 0 ? (
        <DashboardEmptyState
          title="No requests in this view"
          description="Talent self-applications and hub visibility submissions will appear here."
        />
      ) : (
        <div className="space-y-3">
          {rows.map((row, idx) => {
            const canReview = reviewEligibility[idx] ?? false;
            return (
              <article
                key={row.id}
                className="rounded-2xl border border-border/45 bg-background/60 p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${statusPill(
                          row.status,
                        )}`}
                      >
                        {row.status.replace("_", " ")}
                      </span>
                      <span className="rounded-full border border-border/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {row.target_type === "hub" ? "Hub" : "Agency"}
                      </span>
                      <Link
                        href={`/admin/talent?edit=${encodeURIComponent(row.talent_profile_id)}`}
                        className="font-display text-sm font-semibold text-foreground hover:underline"
                      >
                        {row.talentDisplay}
                      </Link>
                      <span className="text-sm text-muted-foreground">
                        → {row.targetDisplay}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Requested {formatAdminTimestamp(row.requested_at)}
                      {row.requesterDisplay ? ` · by ${row.requesterDisplay}` : null}
                      {row.picked_up_at
                        ? ` · picked up ${formatAdminTimestamp(row.picked_up_at)}`
                        : null}
                      {row.reviewed_at
                        ? ` · reviewed ${formatAdminTimestamp(row.reviewed_at)}`
                        : null}
                    </p>
                    {row.requester_note ? (
                      <p className="max-w-prose text-sm italic text-muted-foreground">
                        &ldquo;{row.requester_note}&rdquo;
                      </p>
                    ) : null}
                    {row.reviewer_reason ? (
                      <p className="max-w-prose rounded-md bg-rose-500/5 px-3 py-2 text-xs text-rose-200 ring-1 ring-inset ring-rose-500/20">
                        Reviewer: {row.reviewer_reason}
                      </p>
                    ) : null}
                  </div>

                  {canReview ? (
                    <RepresentationRequestRowActions
                      requestId={row.id}
                      status={row.status}
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Read-only in this view
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
