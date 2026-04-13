import {
  stripDefaultLocalePrefixFromPath,
  stripLocaleFromPathname,
} from "@/i18n/pathnames";

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

  return path === dashboardBase || path.startsWith(`${dashboardBase}/`);
}

export function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000")
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

  if (destination === "/onboarding/role" || destination === "/") {
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
