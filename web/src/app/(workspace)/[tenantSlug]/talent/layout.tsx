// Phase 3.12.2 — Talent self-surface canonical shell.
//
// Mounts the canonical talent shell at every /{tenantSlug}/talent/* route.
// Mirrors the admin layout pattern (Phase 3.12): the server component does
// auth + data pre-fetch; the client component renders the full talent UI.
//
// Auth gate: user must be rostered talent for this agency. Uses
// loadTalentSelfProfile() which also verifies agency_talent_roster membership.
//
// Bridge data pre-fetched in parallel:
//   - talentSelfProfile  → TalentShellClient identity bar
//   - talentInquiries    → AdminShellProvider → effectiveTalentInquiries
//
// initialTalentPage is derived from the request pathname so hard refreshes
// land on the correct tab without a flash.

import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { findTenantMembership } from "@/lib/saas/tenant";
import { getCachedActorSession } from "@/lib/server/request-cache";
import {
  loadTalentSelfProfile,
  loadTalentInquiries,
  loadTalentAgencies,
} from "@/components/admin/shell/internal/data-bridge";
import { loadWorkspaceUnreadCount } from "@/lib/saas/unread-counts";
import { loadUserPrefs, type UserPrefs } from "@/lib/server-actions/user-prefs";
import { TalentShellClient } from "@/components/admin/shell/admin-shell-client";
import type { TalentPage } from "@/components/admin/shell/internal/state";
import { loadTenantIdentity, loadProfileDisplayName } from "../_layout-identity";

export const dynamic = "force-dynamic";

type LayoutParams = Promise<{ tenantSlug: string }>;

const TALENT_SEGMENT_MAP: Record<string, TalentPage> = {
  today:        "today",
  inbox:        "messages",
  messages:     "messages",
  profile:      "profile",
  calendar:     "calendar",
  agencies:     "agencies",
  reach:        "agencies", // legacy alias
  "public-page": "public-page",
  settings:     "settings",
};

function deriveInitialTalentPage(pathname: string, tenantSlug: string): TalentPage {
  const prefix = `/${tenantSlug}/talent`;
  const after = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : "";
  const segment = after.replace(/^\//, "").split("/")[0] ?? "";
  return TALENT_SEGMENT_MAP[segment] ?? "today";
}

export default async function TalentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: LayoutParams;
}) {
  const { tenantSlug } = await params;

  // ── Auth ────────────────────────────────────────────────────────────────────
  const session = await getCachedActorSession();
  if (!session.supabase) redirect("/login?error=config");
  if (!session.user) redirect(`/login?next=/${tenantSlug}/talent`);

  // ── Tenant resolution ────────────────────────────────────────────────────────
  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();
  const tenantId = scope.tenantId;

  // ── Talent profile gate ────────────────────────────────────────────────────
  // loadTalentSelfProfile also verifies agency_talent_roster membership.
  const talentSelfProfile = await loadTalentSelfProfile(session.user.id, tenantId);
  if (!talentSelfProfile) notFound();

  // ── Derive initialTalentPage from URL ────────────────────────────────────────
  const hdrs = await headers();
  const pathname = hdrs.get("x-impronta-original-pathname") ?? `/${tenantSlug}/talent/today`;
  const initialTalentPage = deriveInitialTalentPage(pathname, tenantSlug);

  // ── Pre-fetch talent data + hybrid signal in parallel ────────────────────────
  // Phase 0 — `membership` is non-null when this user is also a workspace
  // staff member in this tenant (owner/admin/coordinator/editor/viewer).
  // The mode toggle is shown only when both surfaces are reachable.
  //
  // All four loaders run in a single Promise.all so the layout completes in
  // one network wave. The unread + prefs results are gated on `isHybrid`
  // below, but each loader returns a safe default for non-hybrid users
  // (0 / null), so doing them speculatively here is cheaper than a second
  // sequential await on every page load.
  const [
    talentInquiries,
    talentAgencies,
    membership,
    workspaceUnreadRaw,
    userPrefsRaw,
    tenantIdentity,
    profileDisplayName,
  ] = await Promise.all([
    loadTalentInquiries(talentSelfProfile.id, tenantId),
    // Talent's agency relationships (cross-tenant — a talent can be on
    // multiple agency rosters). Used by /talent/agencies and the talent
    // identity bar's "Acting as <agency>" subtext.
    loadTalentAgencies(talentSelfProfile.id),
    findTenantMembership(tenantId),
    loadWorkspaceUnreadCount(tenantId),
    loadUserPrefs(session.user.id),
    // Identity for the persistent chrome — without these, the talent
    // surface fell back to the mock TENANT ("Atelier Roma") instead of
    // showing the real tenant name + branding.
    loadTenantIdentity(tenantId),
    loadProfileDisplayName(session.user.id),
  ]);
  const isHybrid = membership != null;
  const workspaceUnread: number | undefined = isHybrid ? workspaceUnreadRaw : undefined;
  const userPrefs: UserPrefs | null = isHybrid ? userPrefsRaw : null;

  const sessionIdentity = {
    userId: session.user.id,
    email: session.user.email ?? "",
    role: membership?.role ?? "viewer",
    displayName: profileDisplayName,
  };

  return (
    <TalentShellClient
      tenantSlug={tenantSlug}
      initialTalentPage={initialTalentPage}
      initialBridgeData={{
        // Workspace fields — null since we're in talent-only mode
        roster: null,
        inquiries: null,
        clients: null,
        calendarEvents: null,
        overviewMetrics: null,
        bookings: null,
        pitches: null,
        teamMembers: null,
        totalUnread: 0,
        // Identity for the chrome (top bar + acting-as label). Without
        // these the admin shell fell back to its mock TENANT
        // ("Atelier Roma") even on the real talent route.
        tenantIdentity,
        sessionIdentity,
        // Talent self-surface fields
        talentSelfProfile,
        talentInquiries,
        talentAgencies,
        // Phase 0 — hybrid signal drives the Talent | Workspace toggle
        isHybrid,
        // Phase 5 — cross-mode unread + user prefs
        workspaceUnread: workspaceUnread ?? 0,
        preferredSurface: userPrefs?.preferredSurface ?? null,
        firstRunToggleTipSeen: userPrefs?.firstRunToggleTipSeen ?? false,
      }}
    >
      {/* TalentPageRouteSyncer lives here — inside AdminShellProvider context, returns null */}
      {children}
    </TalentShellClient>
  );
}
