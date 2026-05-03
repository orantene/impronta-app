// Phase 3 — canonical workspace admin shell.
// Server Component — no "use client".
//
// Two-bar horizontal layout matching the prototype's TulalaIdentityBar +
// WorkspaceTopbar design. Replaces the old AdminDashboardShell (dark sidebar)
// which was incorrect for the Phase 3 workspace surface.
//
// Shell structure:
//   ┌─────────────────────────────── 56px ────────────────────────────────┐
//   │  Tulala  /  User Name  /  Agency Name  [plan]        [notifications] │  ← identity bar
//   └──────────────────────────────────────────────────────────────────────┘
//   ┌─────────────────────────────── 52px ────────────────────────────────┐
//   │  Overview  Messages  Calendar  Talent  Clients  Operations  …        │  ← workspace topbar
//   └──────────────────────────────────────────────────────────────────────┘
//   ┌──────────────────────── content ────────────────────────────────────┐
//   │  (children — page content, max-w 1320, padding 28px)                │
//   └──────────────────────────────────────────────────────────────────────┘
//
// Capability gate: agency.workspace.view (viewer+).
// Data: scope from URL slug, workspace summary for plan+displayName.

import { Suspense } from "react";
import { Toaster } from "sonner";
import { notFound, redirect } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadWorkspaceAgencySummary } from "../_data-bridge";
import { signOut } from "@/app/auth/actions";
import { WorkspaceTopbar } from "./workspace-topbar";

type LayoutParams = Promise<{ tenantSlug: string }>;

// ─── Design tokens ───────────────────────────────────────────────────────────

const C = {
  surface:    "#FAFAF7",   // cream body background
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.72)",
  inkDim:     "rgba(11,11,13,0.38)",
  borderSoft: "rgba(24,24,27,0.06)",
  accent:     "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.10)",
  green:      "#2E7D5B",
} as const;

const FONT_BODY    = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

// ─── Plan chip styles ─────────────────────────────────────────────────────────

const PLAN_CHIP: Record<string, { bg: string; color: string; label: string }> = {
  free:    { bg: "rgba(82,96,109,0.10)",  color: "rgba(11,11,13,0.72)", label: "Free"    },
  studio:  { bg: "rgba(180,130,20,0.12)", color: "#7A5710",             label: "Studio"  },
  agency:  { bg: "rgba(15,79,62,0.10)",   color: "#0F4F3E",             label: "Agency"  },
  network: { bg: "rgba(91,60,140,0.10)",  color: "#5B3C8C",             label: "Network" },
};

// ─── User display name helper ─────────────────────────────────────────────────

function userDisplayName(email: string | null | undefined, meta: Record<string, unknown> | undefined): string {
  if (meta?.full_name && typeof meta.full_name === "string") return meta.full_name;
  if (meta?.name && typeof meta.name === "string") return meta.name;
  if (email) return email.split("@")[0].replace(/[._-]/g, " ");
  return "You";
}

// ─── Initials helper ──────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default async function WorkspaceAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: LayoutParams;
}) {
  const { tenantSlug } = await params;

  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await getCachedActorSession();
  if (!session.supabase) redirect("/login?error=config");
  if (!session.user) redirect(`/login?next=/${tenantSlug}/admin`);

  // ── Tenant resolution ─────────────────────────────────────────────────────
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  // ── Capability gate ───────────────────────────────────────────────────────
  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

  // ── Shell data ────────────────────────────────────────────────────────────
  const summary = await loadWorkspaceAgencySummary(scope.tenantId);

  const displayName = summary?.displayName ?? scope.membership.display_name;
  const plan        = summary?.plan ?? "free";
  const chip        = PLAN_CHIP[plan] ?? PLAN_CHIP.agency;

  const userName = userDisplayName(
    session.user.email,
    session.user.user_metadata as Record<string, unknown> | undefined,
  );
  const userInitials = initials(userName);

  return (
    <>
      {/* Scoped CSS variables so all child pages (which reference --admin-*
          vars) render correctly with the light workspace theme. */}
      <style>{`
        .workspace-admin-root {
          --admin-workspace-fg:  ${C.ink};
          --admin-workspace-bg:  ${C.surface};
          --admin-border:        ${C.borderSoft};
          --admin-card-bg:       #ffffff;
          --admin-nav-idle:      ${C.inkMuted};
          --admin-accent:        ${C.accent};
        }
      `}</style>

      <div className="workspace-admin-root" style={{ minHeight: "100dvh", background: C.surface, fontFamily: FONT_BODY }}>

        {/* ── Bar 1: TulalaIdentityBar (56px) ── */}
        <header
          style={{
            background: "#fff",
            borderBottom: `1px solid ${C.borderSoft}`,
            position: "sticky",
            top: 0,
            zIndex: 50,
            padding: "0 24px",
            height: 56,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              height: "100%",
              maxWidth: 1440,
              margin: "0 auto",
            }}
          >
            {/* Platform brand */}
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: 16,
                fontWeight: 500,
                letterSpacing: 0.4,
                color: C.ink,
                textTransform: "uppercase",
                paddingRight: 4,
                userSelect: "none",
              }}
            >
              Tulala
            </div>

            <div style={{ width: 1, height: 22, background: C.borderSoft, margin: "0 4px", flexShrink: 0 }} />

            {/* User identity */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "4px 8px",
                borderRadius: 999,
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: C.accentSoft,
                  color: C.accent,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 700,
                  flexShrink: 0,
                  fontFamily: FONT_BODY,
                  letterSpacing: 0.5,
                }}
              >
                {userInitials}
              </div>
              <span
                style={{
                  fontFamily: FONT_BODY,
                  fontSize: 14,
                  fontWeight: 500,
                  color: C.ink,
                  letterSpacing: -0.05,
                }}
              >
                {userName}
              </span>
            </div>

            {/* "/" separator */}
            <span
              aria-hidden
              style={{
                fontFamily: FONT_BODY,
                fontSize: 14,
                color: C.inkDim,
                marginLeft: -2,
                flexShrink: 0,
              }}
            >
              /
            </span>

            {/* Acting-as: agency name + plan badge */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 9px",
                borderRadius: 999,
              }}
            >
              {/* Active dot */}
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: C.green,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontFamily: FONT_BODY,
                  fontSize: 13,
                  fontWeight: 500,
                  color: C.ink,
                  letterSpacing: -0.05,
                  minWidth: 0,
                  overflow: "hidden",
                  maxWidth: 200,
                }}
              >
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {displayName}
                </span>
                {/* Plan chip */}
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "1px 7px",
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: 0.3,
                    background: chip.bg,
                    color: chip.color,
                    flexShrink: 0,
                    fontFamily: FONT_BODY,
                  }}
                >
                  {chip.label}
                </span>
              </span>
            </div>

            <div style={{ flex: 1 }} />

            {/* Sign-out */}
            <form action={signOut}>
              <button
                type="submit"
                title="Sign out"
                aria-label="Sign out"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: `1px solid ${C.borderSoft}`,
                  background: "transparent",
                  color: C.inkMuted,
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: FONT_BODY,
                  transition: "border-color 100ms, color 100ms",
                }}
              >
                ↩
              </button>
            </form>
          </div>
        </header>

        {/* ── Bar 2: WorkspaceTopbar — client component for URL-based tab nav ── */}
        <Suspense fallback={
          <div style={{ height: 52, background: "#fff", borderBottom: `1px solid ${C.borderSoft}` }} />
        }>
          <WorkspaceTopbar tenantSlug={tenantSlug} />
        </Suspense>

        {/* ── Content area ── */}
        <main
          style={{
            padding: "28px 28px 60px",
            maxWidth: 1320,
            margin: "0 auto",
          }}
        >
          {children}
        </main>
      </div>

      <Toaster
        position="top-center"
        toastOptions={{
          className: "!rounded-xl !border-border/50 !shadow-lg",
        }}
      />
    </>
  );
}
