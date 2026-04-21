import { Building2, Globe, UserCheck } from "lucide-react";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { TalentDashboardLoadFallback } from "@/components/dashboard/dashboard-load-fallback";
import {
  TalentDashboardPage,
  TalentPageHeader,
  TalentSectionLabel,
} from "@/components/talent/talent-dashboard-primitives";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { loadTalentDashboardData } from "@/lib/talent-dashboard-data";
import {
  TalentApplyToAgencyForm,
  TalentHubVisibilityForm,
  TalentWithdrawRequestButton,
} from "./talent-representation-forms";

export const dynamic = "force-dynamic";

const sectionCardTalent =
  "border-border/40 bg-card/80 hover:border-[var(--impronta-gold)]/45 hover:shadow-md";

const titleTalent = "text-[15px] font-semibold tracking-tight";

type AgencyEmbed =
  | { id: string; display_name: string | null }
  | { id: string; display_name: string | null }[]
  | null;

type RosterRow = {
  id: string;
  tenant_id: string;
  status: string;
  agency_visibility: string;
  hub_visibility_status: string;
  is_primary: boolean;
  tenant?: AgencyEmbed;
};

type RepresentationRequestRow = {
  id: string;
  target_type: "agency" | "hub";
  target_id: string;
  status: "requested" | "under_review" | "accepted" | "rejected" | "withdrawn";
  requester_note: string | null;
  reviewer_reason: string | null;
  requested_at: string;
  reviewed_at: string | null;
  target?: AgencyEmbed;
};

type AgencyRow = { id: string; display_name: string | null };

function firstAgency(embed: AgencyEmbed): { id: string; display_name: string | null } | null {
  if (!embed) return null;
  return Array.isArray(embed) ? (embed[0] ?? null) : embed;
}

function statusLabel(status: string): string {
  switch (status) {
    case "requested":
      return "Waiting for reviewer";
    case "under_review":
      return "Under review";
    case "accepted":
      return "Accepted";
    case "rejected":
      return "Rejected";
    case "withdrawn":
      return "Withdrawn";
    default:
      return status;
  }
}

function visibilityLabel(v: string): string {
  switch (v) {
    case "site_visible":
      return "Shown on storefront";
    case "featured":
      return "Featured on storefront";
    case "roster_only":
      return "On roster (not shown publicly)";
    default:
      return v;
  }
}

function hubVisibilityLabel(v: string): string {
  switch (v) {
    case "approved":
      return "Visible on the hub";
    case "pending_review":
      return "Hub request under review";
    case "rejected":
      return "Hub request rejected";
    case "not_submitted":
    default:
      return "Not submitted to the hub";
  }
}

export default async function TalentRepresentationsPage() {
  const result = await loadTalentDashboardData();
  if (!result.ok) return <TalentDashboardLoadFallback reason={result.reason} />;
  const { profile } = result.data;

  const supabase = await getCachedServerSupabase();
  if (!supabase) return <TalentDashboardLoadFallback reason="no_supabase" />;

  // Current memberships + pending requests + candidate agencies for apply picker.
  // Agency picker: all agencies in the agencies table. RLS on `agencies` lets
  // any authenticated user read active rows (they are public-facing tenants).
  const [rosterRes, requestsRes, agenciesRes] = await Promise.all([
    supabase
      .from("agency_talent_roster")
      .select(
        "id, tenant_id, status, agency_visibility, hub_visibility_status, is_primary, tenant:agencies!agency_talent_roster_tenant_id_fkey(id, display_name)",
      )
      .eq("talent_profile_id", profile.id)
      .in("status", ["pending", "active", "inactive"])
      .order("is_primary", { ascending: false }),
    supabase
      .from("talent_representation_requests")
      .select(
        "id, target_type, target_id, status, requester_note, reviewer_reason, requested_at, reviewed_at, target:agencies!talent_representation_requests_target_id_fkey(id, display_name)",
      )
      .eq("talent_profile_id", profile.id)
      .order("requested_at", { ascending: false })
      .limit(25),
    supabase
      .from("agencies")
      .select("id, display_name, kind")
      .eq("kind", "agency")
      .order("display_name", { ascending: true }),
  ]);

  const roster = (rosterRes.data ?? []) as unknown as RosterRow[];
  const requests = (requestsRes.data ?? []) as unknown as RepresentationRequestRow[];
  const allAgencies = (agenciesRes.data ?? []) as AgencyRow[];

  const rosteredTenantIds = new Set(roster.map((r) => r.tenant_id));
  const openAgencyRequestTenantIds = new Set(
    requests
      .filter((r) => r.target_type === "agency" && (r.status === "requested" || r.status === "under_review"))
      .map((r) => r.target_id),
  );

  const agencyOptions = allAgencies
    .filter((a) => a.display_name)
    .filter((a) => !rosteredTenantIds.has(a.id))
    .filter((a) => !openAgencyRequestTenantIds.has(a.id))
    .map((a) => ({ id: a.id, name: a.display_name as string }));

  const hubRequestAlreadyOpen = requests.some(
    (r) => r.target_type === "hub" && (r.status === "requested" || r.status === "under_review"),
  );

  const pendingRequests = requests.filter(
    (r) => r.status === "requested" || r.status === "under_review",
  );
  const closedRequests = requests.filter(
    (r) => r.status === "accepted" || r.status === "rejected" || r.status === "withdrawn",
  );

  return (
    <TalentDashboardPage className="py-2">
      <section className="px-4 pt-3 sm:px-5 lg:px-0">
        <div className="rounded-3xl border border-border/50 bg-gradient-to-br from-background/90 via-background/80 to-muted/30 shadow-[0_18px_45px_-26px_rgba(0,0,0,0.32)] sm:rounded-2xl lg:shadow-[0_20px_50px_-24px_rgba(0,0,0,0.28)]">
          <div className="space-y-4 p-4 sm:p-5 lg:p-8">
            <TalentPageHeader
              icon={UserCheck}
              title="Representation"
              description="Apply to agencies, request hub visibility, and see who currently represents you."
            />
          </div>
        </div>
      </section>

      <div className="mt-5 space-y-5 lg:mt-6 lg:space-y-6">
        {/* Where I appear */}
        <div className="space-y-2 lg:space-y-3">
          <TalentSectionLabel icon={UserCheck}>Where I appear</TalentSectionLabel>
          <DashboardSectionCard
            className={sectionCardTalent}
            titleClassName={titleTalent}
            title="Current memberships"
            description="Agencies that have you on their roster and your hub visibility per agency."
          >
            {roster.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No agencies have you on their roster yet. Apply below to get
                started.
              </p>
            ) : (
              <ul className="divide-y divide-border/40">
                {roster.map((r) => (
                  <li key={r.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium text-foreground">
                        {firstAgency(r.tenant ?? null)?.display_name ?? r.tenant_id}
                        {r.is_primary ? (
                          <span className="ml-2 rounded-full border border-[var(--impronta-gold)]/40 bg-[var(--impronta-gold)]/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--impronta-gold)]">
                            Primary
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">
                        {r.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {visibilityLabel(r.agency_visibility)} · {hubVisibilityLabel(r.hub_visibility_status)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </DashboardSectionCard>
        </div>

        {/* Apply to an agency */}
        <div className="space-y-2 lg:space-y-3">
          <TalentSectionLabel icon={Building2}>Apply to an agency</TalentSectionLabel>
          <DashboardSectionCard
            className={sectionCardTalent}
            titleClassName={titleTalent}
            title="Agency application"
            description="Request to join an agency's roster. The agency reviews and responds."
          >
            <TalentApplyToAgencyForm agencies={agencyOptions} />
          </DashboardSectionCard>
        </div>

        {/* Hub visibility */}
        <div className="space-y-2 lg:space-y-3">
          <TalentSectionLabel icon={Globe}>Hub visibility</TalentSectionLabel>
          <DashboardSectionCard
            className={sectionCardTalent}
            titleClassName={titleTalent}
            title="Request hub visibility"
            description="Ask the platform team to list you on the cross-agency hub."
          >
            <TalentHubVisibilityForm alreadyOpen={hubRequestAlreadyOpen} />
          </DashboardSectionCard>
        </div>

        {/* Pending requests */}
        {pendingRequests.length > 0 ? (
          <div className="space-y-2 lg:space-y-3">
            <TalentSectionLabel icon={UserCheck}>Pending requests</TalentSectionLabel>
            <DashboardSectionCard
              className={sectionCardTalent}
              titleClassName={titleTalent}
              title="Awaiting reviewer"
              description="You can withdraw while a request is still open."
            >
              <ul className="divide-y divide-border/40">
                {pendingRequests.map((r) => (
                  <li key={r.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">
                        {r.target_type === "hub"
                          ? "Hub visibility"
                          : firstAgency(r.target ?? null)?.display_name ?? r.target_id}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {statusLabel(r.status)} · sent{" "}
                        {new Date(r.requested_at).toLocaleDateString()}
                      </p>
                      {r.requester_note ? (
                        <p className="mt-1 text-xs italic text-muted-foreground">
                          “{r.requester_note}”
                        </p>
                      ) : null}
                    </div>
                    <TalentWithdrawRequestButton requestId={r.id} />
                  </li>
                ))}
              </ul>
            </DashboardSectionCard>
          </div>
        ) : null}

        {/* History */}
        {closedRequests.length > 0 ? (
          <div className="space-y-2 lg:space-y-3">
            <TalentSectionLabel icon={UserCheck}>History</TalentSectionLabel>
            <DashboardSectionCard
              className={sectionCardTalent}
              titleClassName={titleTalent}
              title="Past requests"
            >
              <ul className="divide-y divide-border/40">
                {closedRequests.map((r) => (
                  <li key={r.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium text-foreground">
                        {r.target_type === "hub"
                          ? "Hub visibility"
                          : firstAgency(r.target ?? null)?.display_name ?? r.target_id}
                      </span>
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">
                        {statusLabel(r.status)}
                      </span>
                    </div>
                    {r.reviewer_reason ? (
                      <p className="text-xs italic text-muted-foreground">
                        Reviewer: “{r.reviewer_reason}”
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </DashboardSectionCard>
          </div>
        ) : null}
      </div>
    </TalentDashboardPage>
  );
}
