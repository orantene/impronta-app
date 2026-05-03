// Phase 3.3 — canonical talent self-dashboard shell.
// Server Component — no "use client".
//
// Two-bar horizontal layout matching the prototype's TalentShell:
//   ┌──────────────────────── 56px identity bar ──────────────────────────┐
//   │  Tulala  /  Talent Name  [primary-type]    agency: Impronta    [↩]  │
//   └─────────────────────────────────────────────────────────────────────┘
//   ┌──────────────────────── 52px talent nav ────────────────────────────┐
//   │  Today  Inbox  Calendar  Profile  Agencies  Settings   [Preview ↗]  │
//   └─────────────────────────────────────────────────────────────────────┘
//   ┌──────────────────────── content area ───────────────────────────────┐
//   │  (children — page content, max-w 1320, padding 28px)                │
//   └─────────────────────────────────────────────────────────────────────┘
//
// Auth gate: user must be authenticated AND have a talent profile rostered
// in this agency (agency_talent_roster WHERE tenant_id = tenantId AND
// talent_profiles.user_id = auth.user.id AND status != removed).

import { notFound, redirect } from "next/navigation";
import { Toaster } from "sonner";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadTalentSelfProfile } from "../_data-bridge";
import { signOut } from "@/app/auth/actions";
import { TalentTopbar } from "./talent-topbar";

type LayoutParams = Promise<{ tenantSlug: string }>;

const C = {
  surface:    "#FAFAF7",
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.72)",
  inkDim:     "rgba(11,11,13,0.38)",
  borderSoft: "rgba(24,24,27,0.06)",
  accent:     "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.10)",
  green:      "#2E7D5B",
  indigoSoft: "rgba(43,63,163,0.08)",
  indigoDeep: "#2B3FA3",
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
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  // ── Talent profile gate ────────────────────────────────────────────────────
  // User must be a rostered talent for this agency.
  const talentProfile = await loadTalentSelfProfile(session.user.id, scope.tenantId);
  if (!talentProfile) notFound();

  const userName = userDisplayName(
    session.user.email,
    session.user.user_metadata as Record<string, unknown> | undefined,
  );
  const userInitials = initials(talentProfile.displayName);

  const publicProfileUrl = talentProfile.profileCode
    ? `https://tulala.digital/t/${talentProfile.profileCode}`
    : null;

  return (
    <>
      <style>{`
        .talent-root {
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
        .talent-root .font-display {
          font-family: "Inter", system-ui, sans-serif;
        }
      `}</style>

      <div className="talent-root" style={{ minHeight: "100dvh", background: C.surface, fontFamily: FONT_BODY }}>

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

            {/* Talent identity */}
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
                  background: C.indigoSoft,
                  color: C.indigoDeep,
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
                    maxWidth: 180,
                  }}
                >
                  {talentProfile.displayName}
                </div>
                {talentProfile.primaryTypeLabel && (
                  <div
                    style={{
                      fontFamily: FONT_BODY,
                      fontSize: 11,
                      color: C.inkMuted,
                      letterSpacing: 0.1,
                      lineHeight: 1.2,
                    }}
                  >
                    {talentProfile.primaryTypeLabel}
                  </div>
                )}
              </div>
            </div>

            <span aria-hidden style={{ fontSize: 14, color: C.inkDim, flexShrink: 0 }}>/</span>

            {/* Agency context chip */}
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
                  background: C.green,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: FONT_BODY,
                  fontSize: 12,
                  fontWeight: 500,
                  color: C.accent,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 160,
                }}
              >
                {talentProfile.agencyName}
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

        {/* ── Bar 2: Talent nav topbar ── */}
        <TalentTopbar
          tenantSlug={tenantSlug}
          publicProfileUrl={publicProfileUrl}
        />

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
