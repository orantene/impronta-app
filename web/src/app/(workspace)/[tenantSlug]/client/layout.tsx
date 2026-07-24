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
import { tenantReviewsEnabled } from "@/lib/reviews/reviews-entitlement";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getFavoriteTalentIds, getSavedTalentIds } from "@/lib/public-discovery";
import {
  DiscoveryStateBridge,
  PublicDiscoveryStateProvider,
} from "@/components/directory/public-discovery-state";
import { MergeGuestFavorites } from "@/components/client/merge-guest-favorites";
import { loadClientSelfProfile } from "../_data-bridge";
import { ClientTopbar } from "./client-topbar";
import { ClientSidebar } from "./client-sidebar";
import { loadClientSubscription } from "@/lib/discover/client-subscription";
import { loadClientTrustBillingState } from "../_data-bridge";
import { ClientAccountMenu } from "./_components/ClientAccountMenu";
import { ClientNotificationBell } from "./_components/ClientNotificationBell";
import { GlobalSearch } from "./_components/GlobalSearch";
import { ClientKeyboardShortcuts, type KeyboardShortcutLabels } from "./_keyboard-shortcuts";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { loadMyNotifications } from "@/lib/server-actions/notifications-self";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { loadTenantWhitelabel } from "@/lib/brand/tenant-whitelabel";
import { TULALA_BRAND } from "@/lib/brand/tulala";

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
  // Phase E (F20) — instead of a branded 404, show a soft landing page that
  // surfaces the two most useful next actions: sign-in as a client or open
  // the admin dashboard (workspace owners land here by accident often).
  const clientProfile = await loadClientSelfProfile(session.user.id, scope.tenantId);
  if (!clientProfile) {
    const tenantDisplayName = tenantSlug
      .split(/[-_]/)
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    return (
      <div style={{
        minHeight: "100dvh",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "32px 20px",
        background: "#FAFAF7",
        fontFamily: '"Inter", system-ui, sans-serif',
      }}>
        <div style={{
          maxWidth: 440, width: "100%",
          background: "#fff",
          border: "1px solid rgba(24,24,27,0.08)",
          borderRadius: 16,
          padding: "36px 32px",
          textAlign: "center",
          boxShadow: "0 2px 16px rgba(11,11,13,0.06)",
        }}>
          <div aria-hidden style={{
            width: 48, height: 48, borderRadius: 14,
            background: "rgba(29,78,216,0.08)", color: "#1D4ED8",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            marginBottom: 16,
          }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <circle cx="11" cy="7" r="4" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M3 19c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 style={{
            fontSize: 20, fontWeight: 700, margin: "0 0 8px", color: "#0B0B0D",
            fontFamily: 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif',
          }}>
            No client account here
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(11,11,13,0.64)", margin: "0 0 24px" }}>
            You don&apos;t have a client account on <strong>{tenantDisplayName}</strong>. You can ask the workspace admin to add you, or open the admin dashboard if you run this workspace.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <a href={`/${tenantSlug}/admin`} style={{
              display: "block", padding: "11px 20px", borderRadius: 10,
              background: "#1D4ED8", color: "#fff",
              fontWeight: 700, fontSize: 14, textDecoration: "none",
            }}>
              Open admin dashboard
            </a>
            <a href={`/login?next=/${tenantSlug}/client`} style={{
              display: "block", padding: "11px 20px", borderRadius: 10,
              border: "1px solid rgba(24,24,27,0.10)", background: "transparent",
              color: "#0B0B0D", fontWeight: 600, fontSize: 14, textDecoration: "none",
            }}>
              Sign in as a client
            </a>
          </div>
        </div>
      </div>
    );
  }

  // D4 — seed the canonical discovery state so <TalentCardActions> /
  // useFavorites work on every client-dashboard surface, exactly as the
  // public layout does. favoriteIds ← client_favorites, savedIds ←
  // saved_talent cart. Both are global / cross-tenant.
  //
  // D1 — seed initial notifications for the bell (zero client waterfalls).
  // Locale settings are also pre-fetched here so the DashboardLocaleToggle
  // inside ClientAccountMenu knows the tenant's supported languages.
  // Reviews are a PREMIUM capability gated on the surface tenant's entitlement.
  // Resolved here (server component) so the nav can hide the "reviews" entry on
  // a non-entitled workspace. Fails closed via tenantReviewsEnabled.
  const [
    favoriteIds,
    savedIds,
    initialNotifications,
    tenantLocaleSettings,
    reviewsEnabled,
    whitelabel,
    clientSubscription,
    clientTrust,
  ] = await Promise.all([
    getFavoriteTalentIds(),
    getSavedTalentIds(),
    loadMyNotifications(50),
    loadTenantLocaleSettings(scope.tenantId),
    tenantReviewsEnabled(scope.tenantId),
    loadTenantWhitelabel(scope.tenantId),
    // CW1 — plan + trust standing surface permanently in the sidebar rail
    // footer. Both loaders degrade to their safe defaults on error.
    loadClientSubscription(session.user.id),
    loadClientTrustBillingState(session.user.id, scope.tenantId),
  ]);

  // Whitelabel branding: the client portal carries the agency's name only when
  // the agency is on a whitelabel tier; otherwise it reads as the Tulala
  // platform (everyone is a Tulala client by default).
  const clientBrandLabel = whitelabel ? clientProfile.agencyName : TULALA_BRAND.name;

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
          /* Override the dark-theme tokens that leak from .site-theme-dark
             on ancestor surfaces — otherwise shared components that use
             bg-muted (e.g. DashboardLocaleToggle's active EN/ES pill)
             render as a solid black square with invisible text. */
          --muted:               #f1f1ee;
          --popover:             #ffffff;
          --popover-foreground:  ${C.ink};
        }
        /* Clip horizontally so the bar can't overflow the viewport on
           narrow widths, but stay visible vertically so the account-menu
           dropdown can escape the 56px bar. overflow-x: clip is the
           modern primitive that does NOT force overflow-y to auto. */
        .client-hd-row { overflow-x: clip; overflow-y: visible; }
        .client-hd-main { padding: 0 16px; }
        /* Narrow viewports: drop secondary utilities so the row fits. */
        @media (max-width: 640px) {
          .client-hd-role-chip,
          .client-hd-divider,
          .client-hd-slash,
          .client-hd-pill,
          .client-hd-search,
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
        /* CW1 — sidebar shell grid. Desktop: 240px rail + content (the
           workspace/talent design language). Under 900px the rail hides and
           the legacy topbar strip returns as the mobile nav. */
        .client-shell-grid {
          display: grid;
          grid-template-columns: 240px minmax(0, 1fr);
          align-items: start;
        }
        .client-topbar-mobile { display: none; }
        @media (max-width: 900px) {
          .client-shell-grid { grid-template-columns: 1fr; }
          [data-tulala-client-sidebar] { display: none !important; }
          .client-topbar-mobile { display: block; }
        }
      `}</style>

      <div className="client-root" style={{ minHeight: "100dvh", background: C.surface, fontFamily: FONT_BODY }}>
       <PublicDiscoveryStateProvider
         initialSavedIds={savedIds}
         initialFavoriteIds={favoriteIds}
       >
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
              {clientBrandLabel}
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
              supportedLocales={tenantLocaleSettings.supportedLocales}
              defaultLocale={tenantLocaleSettings.defaultLocale}
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

            {/* Global search — inquiries, bookings, messages, talent */}
            <div className="client-hd-search">
              <GlobalSearch />
            </div>

            {/* D1 — notification bell: unread count badge + popover */}
            <ClientNotificationBell
              initialNotifications={initialNotifications}
              tenantSlug={tenantSlug}
            />
          </div>
        </header>

        {/* ── Mobile nav: the legacy horizontal strip, phones/tablets only.
            Desktop navigation moved into the CW1 sidebar rail below. ── */}
        <div className="client-topbar-mobile">
          <ClientTopbar
            tenantSlug={tenantSlug}
            locale={locale}
            reviewsEnabled={reviewsEnabled}
          />
        </div>

        {/* D9 polish — global keyboard shortcuts (renders null unless help open) */}
        <ClientKeyboardShortcuts tenantSlug={tenantSlug} labels={keyboardLabels} />

        {/* ── CW1 shell grid: sidebar rail + content area ── */}
        <div className="client-shell-grid">
          <ClientSidebar
            tenantSlug={tenantSlug}
            locale={locale}
            reviewsEnabled={reviewsEnabled}
            subscriptionTier={clientSubscription.tier}
            trustLevel={clientTrust.trustLevel}
            showHub={!whitelabel}
          />
          <main
            className="client-main"
            style={{
              maxWidth: 1320,
              margin: "0 auto",
              width: "100%",
              minWidth: 0,
            }}
          >
            {children}
          </main>
        </div>
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
