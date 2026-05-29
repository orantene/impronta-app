/**
 * /{tenantSlug}/talent — workspace-scoped talent entry point.
 *
 * Phase E (F19) — NEVER silently switch workspaces. Resolution order:
 *
 *  1. Workspace owner/admin for this slug → redirect to /{slug}/admin/roster
 *     (they want to manage talent, not be one).
 *  2. Has a talent profile in this tenant → redirect to the platform talent
 *     surface (/talent/today).
 *  3. No membership + no talent profile → render a soft "Create your talent
 *     profile here" CTA rather than a confusing silent workspace switch.
 */

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug, getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadTalentSelfProfile } from "@/app/(workspace)/[tenantSlug]/_data-bridge/talent";

// Design tokens inlined as literals. This is a Server Component — importing
// COLORS/FONTS from the admin-shell `state` barrel pulls the barrel's
// client-only modules (field-catalog.ts → useState/useEffect) into the server
// bundle and fails `next build`. Values mirror admin/shell/internal/state.
const ACCENT = "#0F4F3E";
const ACCENT_SOFT = "rgba(15,79,62,0.10)";
const FONT_DISPLAY =
  'var(--font-geist-sans), "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif';
const FONT_BODY = '"Inter", system-ui, sans-serif';

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

export default async function WorkspaceTalentIndexPage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;

  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await getCachedActorSession();
  if (!session.supabase) redirect("/login?error=config");
  if (!session.user) redirect(`/login?next=/${tenantSlug}/talent`);

  // ── 1. Workspace owner / admin? → send to admin roster ──────────────────
  const adminScope = await getTenantScopeBySlug(tenantSlug);
  if (adminScope) {
    // User has a workspace membership here — they belong in admin, not talent.
    redirect(`/${tenantSlug}/admin/roster`);
  }

  // ── 2. Has a talent profile in this tenant? → platform talent surface ────
  const portalScope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!portalScope) notFound();

  const talentProfile = await loadTalentSelfProfile(
    session.user.id,
    portalScope.tenantId,
  );

  if (talentProfile) {
    // Talent is rostered here → use the canonical /talent/* platform routes.
    redirect("/talent/today");
  }

  // ── 3. No talent profile → show creation CTA (don't silently switch) ─────
  const tenantDisplayName = tenantSlug
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 20px",
        background: "#FAFAF7",
        fontFamily: FONT_BODY,
      }}
    >
      <div
        style={{
          maxWidth: 440,
          width: "100%",
          background: "#fff",
          border: `1px solid rgba(24,24,27,0.08)`,
          borderRadius: 16,
          padding: "36px 32px",
          textAlign: "center",
          boxShadow: "0 2px 16px rgba(11,11,13,0.06)",
        }}
      >
        {/* Icon */}
        <div
          aria-hidden
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: ACCENT_SOFT,
            color: ACCENT,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <circle cx="11" cy="7" r="4" stroke="currentColor" strokeWidth="1.6"/>
            <path d="M3 19c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        </div>

        <h1
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 20,
            fontWeight: 700,
            margin: "0 0 8px",
            color: "#0B0B0D",
          }}
        >
          Create your talent profile here
        </h1>

        <p style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(11,11,13,0.64)", margin: "0 0 24px" }}>
          You don&apos;t have a talent profile on <strong>{tenantDisplayName}</strong> yet.
          Join the roster to be visible to clients booking through this workspace.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <a
            href={`/${tenantSlug}/admin`}
            style={{
              display: "block",
              padding: "11px 20px",
              borderRadius: 10,
              background: ACCENT,
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Open workspace admin
          </a>
          <Link
            href="/talent/today"
            style={{
              display: "block",
              padding: "11px 20px",
              borderRadius: 10,
              border: `1px solid rgba(24,24,27,0.10)`,
              background: "transparent",
              color: "#0B0B0D",
              fontWeight: 600,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Go to my talent dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
