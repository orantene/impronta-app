// Phase 3.10 — canonical client self-dashboard shell.
// Server Component — no "use client".
//
// Two-bar horizontal layout matching the talent shell pattern:
//   ┌──────────────────────── 56px identity bar ──────────────────────────┐
//   │  Agency Name  /  Client Name  [client]    [↩]                       │
//   └─────────────────────────────────────────────────────────────────────┘
//   ┌──────────────────────── 52px client nav ────────────────────────────┐
//   │  Today  Discover  Inquiries  Bookings  Shortlists  Settings         │
//   └─────────────────────────────────────────────────────────────────────┘
//   ┌──────────────────────── content area ───────────────────────────────┐
//   │  (children — page content, max-w 1320, padding 28px)                │
//   └─────────────────────────────────────────────────────────────────────┘
//
// Auth gate: user must be authenticated AND have a client_profiles record
// AND have at least one inquiry to this tenantId (establishes a relationship).

import { notFound, redirect } from "next/navigation";
import { Toaster } from "sonner";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadClientSelfProfile } from "../_data-bridge";
import { signOut } from "@/app/auth/actions";
import { ClientTopbar } from "./client-topbar";

type LayoutParams = Promise<{ tenantSlug: string }>;

const C = {
  surface:    "#FAFAF7",
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.72)",
  inkDim:     "rgba(11,11,13,0.38)",
  borderSoft: "rgba(24,24,27,0.06)",
  accent:     "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
  blue:       "#2563EB",
  blueSoft:   "rgba(37,99,235,0.08)",
  blueDeep:   "#1D4ED8",
} as const;

const FONT_BODY    = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function userDisplayName(email: string | null | undefined, meta: Record<string, unknown> | undefined): string {
  if (meta?.full_name && typeof meta.full_name === "string") return meta.full_name;
  if (meta?.name && typeof meta.name === "string") return meta.name;
  if (email) return email.split("@")[0].replace(/[._-]/g, " ");
  return "You";
}

export default async function ClientLayout({
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
  if (!session.user) redirect(`/login?next=/${tenantSlug}/client`);

  // ── Tenant resolution ────────────────────────────────────────────────────────
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  // ── Client profile gate ────────────────────────────────────────────────────
  // User must be a registered client with a relationship to this agency.
  const clientProfile = await loadClientSelfProfile(session.user.id, scope.tenantId);
  if (!clientProfile) notFound();

  const userName = userDisplayName(
    session.user.email,
    session.user.user_metadata as Record<string, unknown> | undefined,
  );
  const userInitials = initials(clientProfile.displayName);

  return (
    <>
      <style>{`
        .client-root {
          --admin-workspace-fg:  ${C.ink};
          --admin-workspace-bg:  ${C.surface};
          --admin-border:        ${C.borderSoft};
          --admin-card-bg:       #ffffff;
          --admin-nav-idle:      ${C.inkMuted};
          --admin-accent:        ${C.accent};
          --background:          ${C.surface};
          --foreground:          ${C.ink};
          --card:                #ffffff;
          --card-foreground:     ${C.ink};
          --muted-foreground:    ${C.inkMuted};
          --border:              rgba(24,24,27,0.10);
        }
      `}</style>

      <div className="client-root" style={{ minHeight: "100dvh", background: C.surface, fontFamily: FONT_BODY }}>

        {/* ── Bar 1: Identity bar (56px) ── */}
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
            {/* Agency brand */}
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: -0.2,
                color: C.ink,
                paddingRight: 4,
                userSelect: "none",
              }}
            >
              {clientProfile.agencyName}
            </div>

            <div style={{ width: 1, height: 22, background: C.borderSoft, margin: "0 4px", flexShrink: 0 }} />

            {/* Client identity */}
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
                  background: C.blueSoft,
                  color: C.blueDeep,
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
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: FONT_BODY,
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: C.ink,
                    letterSpacing: -0.1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 200,
                  }}
                >
                  {clientProfile.displayName}
                </div>
                {clientProfile.company && (
                  <div
                    style={{
                      fontFamily: FONT_BODY,
                      fontSize: 11,
                      color: C.inkMuted,
                      letterSpacing: 0.1,
                      lineHeight: 1.2,
                    }}
                  >
                    {clientProfile.company}
                  </div>
                )}
              </div>
            </div>

            <span aria-hidden style={{ fontSize: 14, color: C.inkDim, flexShrink: 0 }}>/</span>

            {/* Role chip */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 999,
                background: C.accentSoft,
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: C.blue,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: FONT_BODY,
                  fontSize: 12,
                  fontWeight: 500,
                  color: C.accent,
                }}
              >
                Client
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
                }}
              >
                ↩
              </button>
            </form>
          </div>
        </header>

        {/* ── Bar 2: Client nav topbar ── */}
        <ClientTopbar tenantSlug={tenantSlug} />

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
