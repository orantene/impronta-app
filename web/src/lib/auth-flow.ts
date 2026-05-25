import {
  stripDefaultLocalePrefixFromPath,
  stripLocaleFromPathname,
} from "@/i18n/pathnames";
import { isWorkspaceOnboardingPath } from "@/lib/saas/workspace-signup";

export type AccessProfile = {
  account_status: string | null;
  app_role: string | null;
  onboarding_completed_at?: string | null;
};

export function normalizeNextPath(
  nextPath: string | null | undefined,
  fallback = "/",
): string {
  if (!nextPath) return fallback;
  return nextPath.startsWith("/") && !nextPath.startsWith("//")
    ? nextPath
    : fallback;
}

/**
 * For login/register: returns `undefined` when absent or when the value is not
 * a usable internal path (so hidden fields omit `next` and post-auth uses defaults).
 */
export function normalizeOptionalNextPath(
  next: string | null | undefined,
): string | undefined {
  const raw = typeof next === "string" ? next.trim() : "";
  if (!raw) return undefined;
  const n = normalizeNextPath(raw);
  return n === "/" ? undefined : n;
}

const TENANT_SCOPED_NEXT_RESERVED_SEGMENTS = new Set([
  "_next",
  "account",
  "admin",
  "api",
  "auth",
  "client",
  "forgot-password",
  "invite",
  "login",
  "onboarding",
  "platform",
  "prototypes",
  "register",
  "t",
  "talent",
  "update-password",
]);

function postAuthPathnameOnly(normalizedNext: string): string {
  const noQuery = normalizedNext.split("?")[0] ?? normalizedNext;
  const noHash = noQuery.split("#")[0] ?? noQuery;
  return noHash || "/";
}

/**
 * After sign-in, active users may only be sent to their dashboard tree, selected
 * public marketing/directory routes, or auth entry pages — not another role's area.
 */
export function isPostAuthNextAllowedForActiveUser(
  normalizedNext: string,
  appRole: string | null | undefined,
): boolean {
  const { pathnameWithoutLocale } = stripLocaleFromPathname(
    postAuthPathnameOnly(normalizedNext),
  );
  const path =
    pathnameWithoutLocale === "" ? "/" : pathnameWithoutLocale;

  if (path === "/") {
    return true;
  }

  if (isWorkspaceOnboardingPath(normalizedNext)) {
    return true;
  }

  const isPublicPostAuth =
    path === "/login" ||
    path === "/register" ||
    path === "/forgot-password" ||
    path === "/contact" ||
    path.startsWith("/directory") ||
    path.startsWith("/models") ||
    path.startsWith("/t/") ||
    path.startsWith("/auth/");

  if (isPublicPostAuth) {
    return true;
  }

  const dashboardBase =
    appRole === "super_admin" || appRole === "agency_staff"
      ? "/admin"
      : appRole === "talent"
        ? "/talent"
        : appRole === "client"
          ? "/client"
          : null;

  if (!dashboardBase) {
    return false;
  }

  const segments = path.split("/").filter(Boolean);
  const tenantScopedSurface =
    segments.length >= 2 &&
    !TENANT_SCOPED_NEXT_RESERVED_SEGMENTS.has(segments[0] ?? "")
      ? segments[1]
      : null;
  if (
    (appRole === "super_admin" || appRole === "agency_staff") &&
    tenantScopedSurface === "admin"
  ) {
    return true;
  }
  if (appRole === "talent" && tenantScopedSurface === "talent") {
    return true;
  }
  if (appRole === "client" && tenantScopedSurface === "client") {
    return true;
  }

  return path === dashboardBase || path.startsWith(`${dashboardBase}/`);
}

export function isOnboardingNextAllowed(normalizedNext: string): boolean {
  if (isWorkspaceOnboardingPath(normalizedNext)) {
    return true;
  }

  const { pathnameWithoutLocale } = stripLocaleFromPathname(
    postAuthPathnameOnly(normalizedNext),
  );
  const path =
    pathnameWithoutLocale === "" ? "/" : pathnameWithoutLocale;

  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return false;

  const rootSurface = segments[0];
  if (rootSurface === "client" || rootSurface === "talent") {
    return true;
  }

  const tenantScopedSurface =
    segments.length >= 2 &&
    !TENANT_SCOPED_NEXT_RESERVED_SEGMENTS.has(rootSurface ?? "")
      ? segments[1]
      : null;
  return tenantScopedSurface === "client" || tenantScopedSurface === "talent";
}

export function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000")
    .trim()
    .replace(/\/$/, "");
}

export function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000"
  )
    .trim()
    .replace(/\/$/, "");
}

export function dashboardPathForRole(
  role: string | null | undefined,
): "/admin" | "/talent" | "/client" | "/onboarding/role" {
  if (role === "super_admin" || role === "agency_staff") return "/admin";
  if (role === "talent") return "/talent";
  if (role === "client") return "/client";
  return "/onboarding/role";
}

export function isStaffRole(role: string | null | undefined): boolean {
  return role === "super_admin" || role === "agency_staff";
}

export function isOnboardingStatus(
  status: string | null | undefined,
): boolean {
  return status === "onboarding" || status === "registered";
}

export function resolveAccountHref(
  userLoggedIn: boolean,
  profile: AccessProfile | null | undefined,
): { href: string; label: string } {
  if (!userLoggedIn) {
    return { href: "/login", label: "Log in or sign up" };
  }

  const destination = resolveAuthenticatedDestination(profile);

  return {
    href: destination,
    label: destination === "/onboarding/role"
      ? "Finish account setup"
      : isStaffRole(profile?.app_role)
      ? "Admin"
      : profile?.app_role === "talent"
        ? "Profile"
        : "Dashboard",
  };
}

export function resolveAuthenticatedDestination(
  profile: AccessProfile | null | undefined,
): "/admin" | "/talent" | "/client" | "/onboarding/role" | "/" {
  if (!profile?.app_role) {
    return "/onboarding/role";
  }

  if (isOnboardingStatus(profile.account_status)) {
    return "/onboarding/role";
  }

  if (profile.account_status !== "active") {
    return "/";
  }

  return dashboardPathForRole(profile.app_role);
}

export function resolvePostAuthDestination(
  profile: AccessProfile | null | undefined,
  nextPath: string | null | undefined,
): string {
  const safeNext = normalizeNextPath(nextPath);

  // Password recovery: honor before role routing (legacy emails may use /auth/update-password).
  if (safeNext === "/update-password" || safeNext === "/auth/update-password") {
    return "/update-password";
  }

  const destination = resolveAuthenticatedDestination(profile);

  if (destination === "/onboarding/role") {
    if (safeNext !== "/" && isWorkspaceOnboardingPath(safeNext)) {
      return stripDefaultLocalePrefixFromPath(safeNext);
    }
    // Talent register flow: allow direct jump to profile completion,
    // bypassing the role-selection page (the user already chose "I'm Talent"
    // when they navigated to /talent/register).
    if (safeNext === "/onboarding/talent-location") {
      return safeNext;
    }
    if (safeNext !== "/" && isOnboardingNextAllowed(safeNext)) {
      const next = stripDefaultLocalePrefixFromPath(safeNext);
      return `/onboarding/role?next=${encodeURIComponent(next)}`;
    }
    return destination;
  }

  if (destination === "/") {
    return destination;
  }

  if (profile?.account_status === "active") {
    if (safeNext === "/") {
      return destination;
    }
    if (isPostAuthNextAllowedForActiveUser(safeNext, profile.app_role)) {
      return stripDefaultLocalePrefixFromPath(safeNext);
    }
    return destination;
  }

  return destination;
}
