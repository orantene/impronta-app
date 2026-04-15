import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Home, LogOut } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import {
  DashboardSidebarNavLinks,
} from "@/components/dashboard/dashboard-nav-links";
import { DashboardMobileMenu } from "@/components/dashboard/dashboard-mobile-menu";
import { DashboardLocaleToggle } from "@/components/dashboard-locale-toggle";
import { Button } from "@/components/ui/button";
import {
  dashboardGroupsForRole,
} from "@/lib/dashboard/architecture";
import {
  buildTalentPreviewHref,
  fetchTalentNavProfileGroupItems,
  mergeTalentPreviewNavHref,
  mergeTalentProfileNavItems,
} from "@/lib/talent-nav-groups";
import { getDashboardTheme } from "@/lib/dashboard-theme";
import {
  isStaffRole,
  resolveAuthenticatedDestination,
} from "@/lib/auth-flow";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { stripLocaleFromPathname } from "@/i18n/pathnames";
import { getRequestLocale, ORIGINAL_PATHNAME_HEADER } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { cn } from "@/lib/utils";
import { DashboardPersonInline } from "@/components/dashboard/dashboard-person-inline";
import { ImpersonationBanner } from "@/components/dashboard/impersonation-banner";
import { WorkspaceSwitcher } from "@/components/dashboard/workspace-switcher";
import { resolveDashboardIdentity } from "@/lib/impersonation/dashboard-identity";
import { subjectUserId } from "@/lib/impersonation/subject-user";
import {
  qaClientUserIdEnv,
  qaTalentUserIdEnv,
} from "@/lib/impersonation/validate";

/** Supabase session uses cookies — dashboard routes must not be statically prerendered. */
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const identity = await resolveDashboardIdentity();
  if (!identity) {
    redirect("/login");
  }

  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    redirect("/login");
  }

  const user = identity.actorUser;

  const profile = identity.effectiveProfile;
  const role = identity.subjectRole;
  const destination = resolveAuthenticatedDestination(identity.actorProfile);
  const dashboardTheme = await getDashboardTheme(supabase);

  if (destination === "/onboarding/role" || destination === "/") {
    redirect(destination);
  }

  const staff =
    isStaffRole(identity.actorProfile?.app_role) && !identity.isImpersonating;

  const locale = await getRequestLocale();
  const t = createTranslator(locale);

  const roleLabel = staff
    ? t("dashboard.roleAdmin")
    : role === "talent"
      ? t("dashboard.roleTalent")
      : role === "client"
        ? t("dashboard.roleClient")
        : t("dashboard.roleDashboard");

  if (!role) {
    redirect("/onboarding/role");
  }

  /**
   * Real `/admin` uses its own shell in `admin/layout.tsx`. Only skip the shared dashboard
   * chrome for staff **on `/admin` routes** — otherwise client/talent dashboards break (no
   * theme wrapper, no sidebar) when a staff account hits those URLs.
   */
  const headerList = await headers();
  const rawPath = headerList.get(ORIGINAL_PATHNAME_HEADER) ?? "";
  const pathOnly = rawPath.split("?")[0]?.split("#")[0] ?? "";
  const { pathnameWithoutLocale } = stripLocaleFromPathname(pathOnly);
  const normalizedPath =
    pathnameWithoutLocale.replace(/\/+$/, "") || "/";
  const staffOnAdminRoute =
    normalizedPath === "/admin" || normalizedPath.startsWith("/admin/");
  if (staff && staffOnAdminRoute) {
    return <>{children}</>;
  }

  let navGroups = dashboardGroupsForRole(
    staff ? "admin" : role === "talent" ? "talent" : role === "client" ? "client" : "guest",
  );

  if (role === "talent" && supabase) {
    const subjectId = subjectUserId(identity);
    const { data: talentRow } = await supabase
      .from("talent_profiles")
      .select("profile_code, workflow_status, visibility")
      .eq("user_id", subjectId)
      .maybeSingle();
    if (talentRow?.profile_code) {
      navGroups = mergeTalentPreviewNavHref(
        navGroups,
        buildTalentPreviewHref({
          profileCode: talentRow.profile_code,
          workflowStatus: talentRow.workflow_status,
          visibility: talentRow.visibility,
        }),
      );
    }
    const dynamicProfileItems = await fetchTalentNavProfileGroupItems(supabase);
    if (process.env.DEBUG_TALENT_NAV === "1") {
      console.info("[talent-nav] layout merge", {
        userId: subjectId,
        dynamicProfileItems: dynamicProfileItems.map((item) => ({
          id: item.id,
          href: item.href,
          label: item.label,
        })),
      });
    }
    navGroups = mergeTalentProfileNavItems(navGroups, dynamicProfileItems);
  }

  const sidebarEmail = identity.isImpersonating
    ? `${identity.actorUser.email ?? t("dashboard.noEmail")} · ${t("dashboard.impersonationActorNote")}`
    : (user.email ?? t("dashboard.noEmail"));

  const displayName = identity.isImpersonating
    ? (profile?.display_name?.trim() || t("dashboard.accountFallback"))
    : (profile?.display_name?.trim() ||
        user.email ||
        t("dashboard.accountFallback"));

  const effectiveAvatarUrl = profile?.avatar_url ?? null;
  const actorAvatarUrl = identity.actorProfile?.avatar_url ?? null;
  const actorDisplayLabel =
    identity.actorProfile?.display_name?.trim() ||
    user.email ||
    t("dashboard.agencyStaffFallback");

  const impersonationRoleLabel =
    role === "talent"
      ? t("dashboard.roleTalent")
      : role === "client"
        ? t("dashboard.roleClient")
        : t("dashboard.roleDashboard");

  const showWorkspaceSwitcher =
    identity.actorProfile?.app_role === "super_admin" &&
    !identity.isImpersonating &&
    Boolean(process.env.IMPERSONATION_COOKIE_SECRET?.trim()) &&
    (Boolean(qaTalentUserIdEnv()) || Boolean(qaClientUserIdEnv()));

  const workspaceSwitcherProps = {
    label: t("dashboard.switchWorkspace"),
    hint: t("dashboard.workspaceSwitcherHint"),
    talentLabel: t("dashboard.workspaceTalentQa"),
    clientLabel: t("dashboard.workspaceClientQa"),
    hasTalent: Boolean(qaTalentUserIdEnv()),
    hasClient: Boolean(qaClientUserIdEnv()),
  } as const;

  const workspaceSwitcherHeader = showWorkspaceSwitcher ? (
    <WorkspaceSwitcher {...workspaceSwitcherProps} variant="header" />
  ) : null;

  const workspaceSwitcherDrawer = showWorkspaceSwitcher ? (
    <WorkspaceSwitcher {...workspaceSwitcherProps} variant="drawer" />
  ) : null;

  return (
    <div
      data-dashboard-theme={dashboardTheme}
      className={`dashboard-theme-${dashboardTheme} flex min-h-screen bg-background text-foreground`}
    >
      {/* Sidebar — desktop: sticky so it stays in view while long pages (e.g. talent editor) scroll */}
      <aside className="hidden w-72 shrink-0 flex-col border-r border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)] lg:sticky lg:top-0 lg:z-30 lg:flex lg:h-[100dvh] lg:max-h-[100dvh] lg:self-start">
        {/* Logo */}
        <div className="flex h-14 shrink-0 items-center border-b border-[var(--impronta-gold-border)] px-5">
          <Link
            href="/"
            className="font-display text-m font-semibold tracking-widest text-[var(--impronta-gold)] uppercase"
          >
            IMPRONTA
          </Link>
        </div>

        {/* Role label + identity */}
        <div className="shrink-0 px-5 pt-5 pb-3">
          <DashboardPersonInline
            avatarUrl={effectiveAvatarUrl}
            name={displayName}
            avatarSize="md"
            className="mt-0"
          >
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--impronta-muted)]">
              {roleLabel}
            </span>
            <p className="mt-1 text-m font-medium text-[var(--impronta-foreground)]">{displayName}</p>
            <p className="text-sm text-[var(--impronta-muted)]">{sidebarEmail}</p>
          </DashboardPersonInline>
        </div>

        {/* Nav links */}
        <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 pb-6">
          <Suspense
            fallback={
              <div className="px-3 text-xs text-[var(--impronta-muted)]">
                {t("dashboard.loadingNav")}
              </div>
            }
          >
            <DashboardSidebarNavLinks groups={navGroups} />
          </Suspense>
        </nav>

        {/* Footer */}
        <div className="shrink-0 space-y-2 border-t border-[var(--impronta-gold-border)] px-3 py-4">
          <form action={signOut}>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="h-10 w-full gap-2 rounded-xl border-[var(--impronta-gold-border)]/60 font-medium"
            >
              <LogOut className="size-4 shrink-0" aria-hidden />
              {t("dashboard.signOut")}
            </Button>
          </form>
          <Link
            href="/"
            className="flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium text-[var(--impronta-muted)] transition-colors hover:bg-[var(--impronta-gold)]/5 hover:text-[var(--impronta-foreground)]"
          >
            <Home className="size-4 shrink-0" aria-hidden />
            {t("dashboard.exitToSite")}
          </Link>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar — mobile & desktop header strip */}
        <header className="sticky top-0 z-40 flex min-h-14 items-center justify-between gap-3 border-b border-[var(--impronta-gold-border)]/80 bg-[var(--impronta-surface)]/95 px-4 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.1)] backdrop-blur-md supports-[backdrop-filter]:bg-[var(--impronta-surface)]/90 lg:px-6">
          <Link
            href="/"
            className="shrink-0 font-display text-sm font-semibold tracking-[0.18em] text-[var(--impronta-gold)] uppercase lg:hidden"
          >
            IMPRONTA
          </Link>

          <div
            className={cn(
              "hidden min-w-0 flex-1 items-center gap-3",
              workspaceSwitcherHeader
                ? "lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center lg:gap-x-3"
                : "lg:flex",
            )}
          >
            <div className="flex min-w-0 items-center justify-self-start">
              {staff ? (
                <DashboardPersonInline
                  avatarUrl={actorAvatarUrl}
                  name={actorDisplayLabel}
                  avatarSize="md"
                  align="center"
                >
                  <p className="truncate text-sm font-medium text-[var(--impronta-foreground)]">
                    {t("dashboard.agencyWorkspace")}
                    <span className="font-normal text-[var(--impronta-muted)]"> · </span>
                    <span className="text-[var(--impronta-muted)]">{actorDisplayLabel}</span>
                  </p>
                </DashboardPersonInline>
              ) : role === "client" ? (
                <DashboardPersonInline
                  avatarUrl={effectiveAvatarUrl}
                  name={displayName}
                  avatarSize="md"
                  align="center"
                >
                  <p className="truncate text-sm font-semibold text-[var(--impronta-foreground)]">
                    {displayName}
                  </p>
                  <p className="truncate text-xs text-[var(--impronta-muted)]">
                    {t("dashboard.clientPortalLine")}
                  </p>
                </DashboardPersonInline>
              ) : (
                <DashboardPersonInline
                  avatarUrl={effectiveAvatarUrl}
                  name={displayName}
                  avatarSize="md"
                  align="center"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--impronta-muted)]">
                    {roleLabel}
                  </p>
                  <p className="truncate text-sm font-medium text-[var(--impronta-foreground)]">
                    {displayName}
                  </p>
                </DashboardPersonInline>
              )}
            </div>
            {workspaceSwitcherHeader ? (
              <div className="flex w-full max-w-[min(100vw-18rem,30rem)] shrink justify-center justify-self-center px-1">
                {workspaceSwitcherHeader}
              </div>
            ) : null}
            {workspaceSwitcherHeader ? (
              <span className="min-w-0 justify-self-end" aria-hidden />
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
            <DashboardLocaleToggle className="hidden sm:flex" />
            <span className="lg:hidden">
              <DashboardMobileMenu
                roleLabel={roleLabel}
                profileName={displayName}
                avatarUrl={effectiveAvatarUrl}
                email={sidebarEmail}
                menuCopy={{
                  sheetDashboardTitle: t("dashboard.sheetDashboardTitle"),
                  menuButton: t("dashboard.menuButton"),
                  loadingNav: t("dashboard.loadingNav"),
                  exitToSite: t("dashboard.exitToSite"),
                }}
                groups={navGroups}
                workspaceSwitcher={workspaceSwitcherDrawer}
                signOutForm={
                  <form action={signOut} className="w-full">
                    <Button
                      type="submit"
                      variant="outline"
                      className="h-11 w-full gap-2 rounded-2xl border-border/70 font-medium"
                    >
                      <LogOut className="size-4 shrink-0" aria-hidden />
                      {t("dashboard.signOut")}
                    </Button>
                  </form>
                }
              />
            </span>
            <form action={signOut} className={role === "client" ? "lg:hidden" : undefined}>
              <Button
                variant="outline"
                size="sm"
                type="submit"
                className="h-10 gap-2 rounded-xl border-border/70 px-3 font-medium lg:h-9"
              >
                <LogOut className="size-4 shrink-0" aria-hidden />
                {t("dashboard.signOut")}
              </Button>
            </form>
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="h-10 gap-1.5 rounded-xl px-3 text-muted-foreground hover:text-foreground lg:hidden"
            >
              <Link href="/">
                <Home className="size-4 shrink-0" aria-hidden />
                {t("dashboard.exit")}
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              asChild
              className={cn(
                "h-9 gap-2 rounded-xl border-border/70 font-medium",
                role === "client" ? "hidden" : "hidden lg:inline-flex",
              )}
            >
              <Link href="/">
                <Home className="size-4 shrink-0" aria-hidden />
                {t("dashboard.exitToSite")}
              </Link>
            </Button>
          </div>
        </header>

        {identity.isImpersonating ? (
          <ImpersonationBanner
            effectiveName={displayName}
            effectiveAvatarUrl={effectiveAvatarUrl}
            roleLabel={impersonationRoleLabel}
            readOnlyLine={t("dashboard.impersonationReadOnly")}
            v1ReadOnlyQaLine={t("dashboard.impersonationV1ReadOnlyQa")}
            returnCta={t("dashboard.returnToAdmin")}
          />
        ) : null}

        {/* Page content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
