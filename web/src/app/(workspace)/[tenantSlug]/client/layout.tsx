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
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getFavoriteTalentIds, getSavedTalentIds } from "@/lib/public-discovery";
import {
  DiscoveryStateBridge,
  PublicDiscoveryStateProvider,
} from "@/components/directory/public-discovery-state";
import { MergeGuestFavorites } from "@/components/client/merge-guest-favorites";
import { loadClientSelfProfile } from "../_data-bridge";
import { ClientTopbar } from "./client-topbar";
import { ClientAccountMenu } from "./_components/ClientAccountMenu";
import { ClientKeyboardShortcuts, type KeyboardShortcutLabels } from "./_keyboard-shortcuts";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";

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

export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: LayoutParams;
}) {
  const { tenantSlug } = await params;
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const keyboardLabels: KeyboardShortcutLabels = {
    title: t("public.keyboard.title"),
    close: t("public.keyboard.close"),
    rows: {
      search: t("public.keyboard.rows.search"),
      toggleHelp: t("public.keyboard.rows.toggleHelp"),
      discover: t("public.keyboard.rows.discover"),
      favorites: t("public.keyboard.rows.favorites"),
      shortlists: t("public.keyboard.rows.shortlists"),
      pitches: t("public.keyboard.rows.pitches"),
      inquiries: t("public.keyboard.rows.inquiries"),
      bookings: t("public.keyboard.rows.bookings"),
      messages: t("public.keyboard.rows.messages"),
      today: t("public.keyboard.rows.today"),
      esc: t("public.keyboard.rows.esc"),
    },
  };

  // ── Auth ────────────────────────────────────────────────────────────────────
  const session = await getCachedActorSession();
  if (!session.supabase) redirect("/login?error=config");
  if (!session.user) redirect(`/login?next=/${tenantSlug}/client`);

  // ── Tenant resolution ────────────────────────────────────────────────────────
  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  // ── Client profile gate ────────────────────────────────────────────────────
  // User must be a registered client with a relationship to this agency.
  const clientProfile = await loadClientSelfProfile(session.user.id, scope.tenantId);
  if (!clientProfile) notFound();

  // D4 — seed the canonical discovery state so <TalentCardActions> /
  // useFavorites work on every client-dashboard surface, exactly as the
  // public layout does. favoriteIds ← client_favorites, savedIds ←
  // saved_talent cart. Both are global / cross-tenant.
  const [favoriteIds, savedIds] = await Promise.all([
    getFavoriteTalentIds(),
    getSavedTalentIds(),
  ]);

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
        .client-hd-row { overflow: hidden; }
        .client-hd-main { padding: 0 16px; }
        /* Narrow viewports: drop secondary utilities so the row fits. */
        @media (max-width: 640px) {
          .client-hd-role-chip,
          .client-hd-divider,
          .client-hd-slash,
          .client-hd-pill,
          .client-hd-company { display: none !important; }
        }
        @media (min-width: 641px) {
          .client-hd-main { padding: 0 24px; }
        }
        /* Main content area: tighter padding on phones. */
        .client-main { padding: 28px 28px 60px; }
        @media (max-width: 640px) {
          .client-main { padding: 16px 14px 56px; }
        }
      `}</style>

      <div className="client-root" style={{ minHeight: "100dvh", background: C.surface, fontFamily: FONT_BODY }}>
       <PublicDiscoveryStateProvider>
        {/* D4 — hydrate the canonical favorites + inquiry-cart stores from
            the SSR seed. The client dashboard uses the ♥ heart icon
            (matches every existing dashboard surface + page copy). */}
        <DiscoveryStateBridge
          savedIds={savedIds}
          favoriteIds={favoriteIds}
          favoriteIcon="heart"
        />
        {/* Sweeps any guest-mode localStorage favorites into client_favorites
            on first authed render — mirrors (public)/layout.tsx, so a save
            made before sign-in still lands in /client/favorites. */}
        <MergeGuestFavorites serverFavoriteIds={favoriteIds} />

        {/* ── Bar 1: Identity bar (56px) ── */}
        <header
          className="client-hd-main"
          style={{
            background: "#fff",
            borderBottom: `1px solid ${C.borderSoft}`,
            position: "sticky",
            top: 0,
            zIndex: 50,
            height: 56,
          }}
        >
          <div
            className="client-hd-row"
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

            <div className="client-hd-divider" style={{ width: 1, height: 22, background: C.borderSoft, margin: "0 4px", flexShrink: 0 }} />

            {/* Account menu — clickable identity (avatar + name + caret).
                Folds: profile · notifications · language · shortcuts · sign-out.
                Replaces the prior dead avatar + dead role chip + duplicate
                "Client" pill + orphan ↩ icon. */}
            <ClientAccountMenu
              tenantSlug={tenantSlug}
              userName={clientProfile.displayName}
              userEmail={session.user.email ?? ""}
              userInitials={userInitials}
              company={clientProfile.company ?? null}
              labels={{
                signedInAs: t("dashboard.signedInAs"),
                profile: t("dashboard.accountMenu.profile"),
                profileSub: t("dashboard.accountMenu.profileSub"),
                notifications: t("dashboard.accountMenu.notifications"),
                notificationsSub: t("dashboard.accountMenu.notificationsSub"),
                language: t("dashboard.accountMenu.language"),
                languageSub: t("dashboard.accountMenu.languageSub"),
                shortcuts: t("dashboard.accountMenu.shortcuts"),
                shortcutsSub: t("dashboard.accountMenu.shortcutsSub"),
                signOut: t("dashboard.signOut"),
                signingOut: t("dashboard.signingOut"),
                openMenu: t("dashboard.accountMenu.openMenu"),
              }}
            />

            <span className="client-hd-slash" aria-hidden style={{ fontSize: 14, color: C.inkDim, flexShrink: 0 }}>/</span>

            {/* Role chip — single surface indicator. Drops on narrow widths
                (the menu header still shows full identity). */}
            <div
              className="client-hd-role-chip"
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
                {t("dashboard.roleClient")}
              </span>
            </div>

            <div style={{ flex: 1 }} />
          </div>
        </header>

        {/* ── Bar 2: Client nav topbar ── */}
        <ClientTopbar tenantSlug={tenantSlug} locale={locale} />

        {/* D9 polish — global keyboard shortcuts (renders null unless help open) */}
        <ClientKeyboardShortcuts tenantSlug={tenantSlug} labels={keyboardLabels} />

        {/* ── Content area ── */}
        <main
          className="client-main"
          style={{
            maxWidth: 1320,
            margin: "0 auto",
          }}
        >
          {children}
        </main>
       </PublicDiscoveryStateProvider>
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
