// _real-identity-banner.tsx
//
// A SERVER component that renders the *real* tenant + session identity at
// the top of every workspace admin page, sitting above the prototype shell.
//
// WHY THIS EXISTS:
// The prototype shell (web/src/app/prototypes/admin-shell/_pages.tsx
// around line 1163) reads `TENANT.name` and `MY_TALENT_PROFILE.name` —
// hardcoded constants from `_state.tsx`. Those files are 8k–9k lines and
// currently being edited by the page-builder agent, so we can't safely
// touch them to inject real bridge data without merge conflicts.
//
// Until the prototype's identity rendering is migrated to consume
// `useProto().tenantIdentity` (Phase 3.13 work, blocked on parallel
// agent), this banner gives operators a permanent, visible source of
// truth on every admin page: which tenant they're actually scoped to,
// who they're signed in as, and the live roster/inquiry metrics.
//
// REPLACEMENT PLAN:
// Once the prototype's top bar reads from real bridge data, delete this
// file + the layout mount. No data migrations, no DB changes — purely
// a render-time UI override that disappears when its purpose is served.

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { signOut } from "@/app/auth/actions";
import type { TenantScope } from "@/lib/saas/scope";
import type { Session } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import type { WorkspaceOverviewMetrics } from "@/app/(workspace)/[tenantSlug]/_data-bridge";

type Props = {
  scope: TenantScope;
  user: Pick<User, "id" | "email">;
  metrics: WorkspaceOverviewMetrics | null;
};

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  studio: "Studio",
  agency: "Agency",
  network: "Network",
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  coordinator: "Coordinator",
  staff: "Staff",
};

async function loadAgencyPlan(
  tenantId: string,
): Promise<{ display_name: string | null; plan_tier: string | null; kind: string | null } | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("agencies")
    .select("display_name, plan_tier, kind")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) {
    logServerError("real-identity-banner.loadAgencyPlan", error);
    return null;
  }
  return data;
}

export async function RealIdentityBanner({ scope, user, metrics }: Props) {
  const agency = await loadAgencyPlan(scope.tenantId);
  const tenantName = agency?.display_name ?? scope.membership.display_name;
  const planLabel = PLAN_LABELS[agency?.plan_tier ?? "free"] ?? "Free";
  const roleLabel = ROLE_LABELS[scope.membership.role] ?? scope.membership.role;
  const userEmail = user.email ?? "(no email)";

  const rosterTotal = metrics?.rosterTotal ?? 0;
  const openInquiries = metrics?.openInquiries ?? 0;
  const pendingApprovals = metrics?.pendingApprovals ?? 0;

  return (
    <div
      data-impronta-real-identity-banner
      role="status"
      aria-label="Real workspace identity (live data)"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 60,
        background: "#0F172A",
        color: "#F8FAFC",
        padding: "6px 16px",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        fontSize: 12,
        lineHeight: 1.4,
        display: "flex",
        flexWrap: "wrap",
        gap: 14,
        alignItems: "center",
        borderBottom: "1px solid #1E293B",
      }}
    >
      <span
        title="Live tenant scoped from URL slug"
        style={{
          textTransform: "uppercase",
          letterSpacing: 0.6,
          fontWeight: 700,
          fontSize: 10,
          color: "#94A3B8",
        }}
      >
        Live
      </span>
      <span>
        <strong>{tenantName}</strong>
        <span
          style={{
            display: "inline-block",
            marginLeft: 6,
            padding: "1px 8px",
            borderRadius: 999,
            background: "#1E293B",
            border: "1px solid #334155",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
          }}
        >
          {planLabel}
        </span>
      </span>
      <span style={{ color: "#94A3B8" }}>·</span>
      <span title="Signed-in user from the Supabase session">
        {userEmail} <span style={{ color: "#94A3B8" }}>({roleLabel})</span>
      </span>
      <span style={{ color: "#94A3B8" }}>·</span>
      <span title="Live aggregates from agency_talent_roster + inquiries">
        {rosterTotal} talent
        {pendingApprovals > 0 && (
          <span style={{ color: "#FBBF24", marginLeft: 6 }}>
            ({pendingApprovals} pending)
          </span>
        )}
        <span style={{ marginLeft: 10 }}>{openInquiries} open inquiries</span>
      </span>
      <span style={{ flex: 1 }} />
      <span
        title="Slug from URL"
        style={{ color: "#64748B", fontSize: 10, letterSpacing: 0.4 }}
      >
        /{scope.membership.slug}
      </span>
      <form action={signOut} style={{ display: "inline-flex", margin: 0 }}>
        <button
          type="submit"
          title="Sign out (kills session, returns to /)"
          style={{
            background: "#1E293B",
            color: "#F8FAFC",
            border: "1px solid #334155",
            borderRadius: 6,
            padding: "3px 10px",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.3,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
