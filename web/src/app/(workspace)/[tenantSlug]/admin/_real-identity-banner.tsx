// _real-identity-banner.tsx
//
// A SERVER component that renders the *real* tenant + session identity at
// the top of every workspace admin page, sitting above the admin shell.
//
// WHY THIS EXISTS:
// The admin shell historically read `TENANT.name` and `MY_TALENT_PROFILE.name` —
// hardcoded constants from `components/admin/shell/internal/state.tsx`.
// Those files are large and
// currently being edited by the page-builder agent, so we can't safely
// touch them to inject real bridge data without merge conflicts.
//
// Until the shell's identity rendering is migrated to consume the bridge
// identity directly, this banner gives operators a permanent, visible source of
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
import { LOCALE_COOKIE } from "@/i18n/locale-middleware";
import type { TenantScope } from "@/lib/saas/scope";
import type { User } from "@supabase/supabase-js";
import type { WorkspaceOverviewMetrics } from "@/app/(workspace)/[tenantSlug]/_data-bridge";
import { cookies } from "next/headers";

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

const PLAN_LABELS_ES: Record<string, string> = {
  free: "Gratis",
  studio: "Studio",
  agency: "Agencia",
  network: "Red",
};

const ROLE_LABELS_ES: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  coordinator: "Coordinador",
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
  const locale = (await cookies()).get(LOCALE_COOKIE)?.value ?? "en";
  const isEs = locale.toLowerCase().startsWith("es");
  const agency = await loadAgencyPlan(scope.tenantId);
  const tenantName = agency?.display_name ?? scope.membership.display_name;
  const planKey = agency?.plan_tier ?? "free";
  const planLabel = isEs
    ? (PLAN_LABELS_ES[planKey] ?? PLAN_LABELS[planKey] ?? "Gratis")
    : (PLAN_LABELS[planKey] ?? "Free");
  const roleLabel = isEs
    ? (ROLE_LABELS_ES[scope.membership.role] ?? ROLE_LABELS[scope.membership.role] ?? scope.membership.role)
    : (ROLE_LABELS[scope.membership.role] ?? scope.membership.role);
  const userEmail = user.email ?? "(no email)";

  const rosterTotal = metrics?.rosterTotal ?? 0;
  const openInquiries = metrics?.openInquiries ?? 0;
  const pendingApprovals = metrics?.pendingApprovals ?? 0;

  return (
    <div
      data-impronta-real-identity-banner
      role="status"
      aria-label={isEs ? "Identidad real del espacio (datos en vivo)" : "Real workspace identity (live data)"}
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
        title={isEs ? "Tenant en vivo tomado del slug de la URL" : "Live tenant scoped from URL slug"}
        style={{
          textTransform: "uppercase",
          letterSpacing: 0.6,
          fontWeight: 700,
          fontSize: 10,
          color: "#94A3B8",
        }}
      >
        {isEs ? "En vivo" : "Live"}
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
      <span title={isEs ? "Usuario con sesión iniciada en Supabase" : "Signed-in user from the Supabase session"}>
        {userEmail} <span style={{ color: "#94A3B8" }}>({roleLabel})</span>
      </span>
      <span style={{ color: "#94A3B8" }}>·</span>
      <span title={isEs ? "Agregados en vivo de agency_talent_roster + inquiries" : "Live aggregates from agency_talent_roster + inquiries"}>
        {rosterTotal} talento
        {pendingApprovals > 0 && (
          <span style={{ color: "#FBBF24", marginLeft: 6 }}>
            ({pendingApprovals} {isEs ? "pendiente" : "pending"})
          </span>
        )}
        <span style={{ marginLeft: 10 }}>
          {isEs
            ? `${openInquiries} consulta${openInquiries === 1 ? "" : "s"} abierta${openInquiries === 1 ? "" : "s"}`
            : `${openInquiries} open inquiries`}
        </span>
      </span>
      <span style={{ flex: 1 }} />
      <span
        title={isEs ? "Slug de la URL" : "Slug from URL"}
        style={{ color: "#64748B", fontSize: 10, letterSpacing: 0.4 }}
      >
        /{scope.membership.slug}
      </span>
      <form action={signOut} style={{ display: "inline-flex", margin: 0 }}>
        <button
          type="submit"
          title={isEs ? "Cerrar sesión (termina la sesión y vuelve a /)" : "Sign out (kills session, returns to /)"}
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
          {isEs ? "Cerrar sesión" : "Sign out"}
        </button>
      </form>
    </div>
  );
}
