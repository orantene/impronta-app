// Phase 3.11 — Tulala HQ platform super_admin console layout.
// Server Component — no "use client".
//
// This layout is NOT tenant-scoped. It renders the global Tulala HQ
// operations console for users with app_role = 'super_admin'.
//
// Shell structure (dark theme):
//   ┌─────────────────────────────── 56px ────────────────────────────────┐
//   │  Tulala  /  userName  [super admin]             [sign out]          │  ← identity bar
//   └──────────────────────────────────────────────────────────────────────┘
//   ┌──── [T] Tulala HQ  |  Today  Tenants  Users  Network  Billing  … ──┐
//   │                                                                      │  ← platform topbar
//   └──────────────────────────────────────────────────────────────────────┘
//   ┌──────────────────────── content ────────────────────────────────────┐
//   │  (children — page content, max-w 1280, padding 28px)                │
//   └──────────────────────────────────────────────────────────────────────┘

import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { signOut } from "@/app/auth/actions";
import { PlatformTopbar } from "./platform-topbar";

// ─── HQ design tokens ────────────────────────────────────────────────────────

const HQ = {
  bg: "#0F0F11",
  card: "#16161A",
  border: "rgba(255,255,255,0.10)",
  borderSoft: "rgba(255,255,255,0.06)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
  inkDim: "rgba(245,242,235,0.38)",
  accentSoft: "rgba(93,211,160,0.12)",
  accentGreen: "#5DD3A0",
} as const;

const FONT_BODY    = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

// ─── Display name helper ──────────────────────────────────────────────────────

function userDisplayName(
  email: string | null | undefined,
  meta: Record<string, unknown> | undefined,
): string {
  if (meta?.full_name && typeof meta.full_name === "string") return meta.full_name;
  if (meta?.name && typeof meta.name === "string") return meta.name;
  if (email) return email.split("@")[0].replace(/[._-]/g, " ");
  return "You";
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default async function PlatformAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const session = await getCachedActorSession();
  if (!session.supabase) redirect("/login?error=config");
  if (!session.user) redirect("/login?next=/platform/admin");

  // ── Platform-role gate ──────────────────────────────────────────────────────
  // Only app_role = 'super_admin' (or platform_role = 'super_admin') may access.
  if (!isPlatformAdmin(session.profile)) {
    // Return 404 rather than a forbidden page — don't reveal this route exists
    // to users who aren't platform admins.
    notFound();
  }

  const userName = userDisplayName(
    session.user.email,
    session.user.user_metadata as Record<string, unknown> | undefined,
  );
  const userInitials = initials(userName);

  return (
    <>
      {/* Scoped dark-theme CSS vars for the HQ console */}
      <style>{`
        .platform-admin-root {
          --background: ${HQ.bg};
          --foreground: ${HQ.ink};
          --card: ${HQ.card};
          --card-foreground: ${HQ.ink};
          --muted-foreground: ${HQ.inkMuted};
          --border: ${HQ.border};
        }
      `}</style>

      <div
        className="platform-admin-root"
        style={{
          minHeight: "100dvh",
          background: HQ.bg,
          color: HQ.ink,
          fontFamily: FONT_BODY,
        }}
      >
        {/* ── Bar 1: Tulala Identity Bar (56px, dark) ── */}
        <header
          style={{
            background: HQ.card,
            borderBottom: `1px solid ${HQ.border}`,
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
                fontSize: 15,
                fontWeight: 500,
                letterSpacing: 0.4,
                color: HQ.ink,
                textTransform: "uppercase",
                userSelect: "none",
                flexShrink: 0,
              }}
            >
              Tulala
            </div>

            <div
              style={{
                width: 1,
                height: 20,
                background: HQ.borderSoft,
                flexShrink: 0,
              }}
            />

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
                  background: HQ.accentSoft,
                  color: HQ.accentGreen,
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
                  color: HQ.ink,
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
                color: HQ.inkDim,
                flexShrink: 0,
              }}
            >
              /
            </span>

            {/* Platform role badge */}
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 10px",
                borderRadius: 999,
                background: "rgba(93,211,160,0.10)",
                fontFamily: FONT_BODY,
                fontSize: 11.5,
                fontWeight: 600,
                color: HQ.accentGreen,
                letterSpacing: 0.3,
                textTransform: "uppercase",
                flexShrink: 0,
              }}
            >
              Super admin
            </span>

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
                  border: `1px solid ${HQ.borderSoft}`,
                  background: "transparent",
                  color: HQ.inkMuted,
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

        {/* ── Bar 2: Platform Topbar (nav tabs, dark) ── */}
        <Suspense
          fallback={
            <div
              style={{
                height: 56,
                background: HQ.card,
                borderBottom: `1px solid ${HQ.border}`,
              }}
            />
          }
        >
          <PlatformTopbar />
        </Suspense>

        {/* ── Content area ── */}
        <main
          style={{
            padding: "28px 28px 60px",
            maxWidth: 1280,
            margin: "0 auto",
          }}
        >
          {children}
        </main>
      </div>
    </>
  );
}
