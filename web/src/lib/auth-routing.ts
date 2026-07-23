import {
  dashboardPathForRole,
  isStaffRole,
  normalizeOptionalNextPath,
  resolveAuthenticatedDestination,
  type AccessProfile,
} from "@/lib/auth-flow";

export type AuthRoutingInput = {
  pathname: string;
  userId: string | null;
  /** Actor session profile (JWT user). */
  sessionProfile: AccessProfile | null;
  /** Profile whose `app_role` gates /talent and /client (effective user when impersonating). */
  routingProfile: AccessProfile | null;
  isImpersonating: boolean;
  /**
   * Raw `?next=` searchParam value from the current request URL. When an
   * already-logged-in user lands on /login or /register with `?next=<path>`,
   * the post-auth redirect honors that path instead of bouncing to the
   * default dashboard (which would drop them into the wrong workspace).
   * Used primarily by the funnel: a signed-in client/talent clicking
   * "Continue to Studio checkout" from /get-started must land on
   * /onboarding/workspace?lead=<id>, not their existing dashboard.
   */
  nextParam?: string | null | undefined;
};

export type AuthRoutingDecision = {
  redirectTo: string | null;
  loginNext: string | null;
  dashboardDestination:
    | "/admin"
    | "/talent"
    | "/client"
    | "/onboarding/role"
    | "/"
    | "/login";
  isDashboardPath: boolean;
};

function isAuthFlowPath(pathname: string): boolean {
  return (
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname === "/join" ||
    // Phase 3.14 — role-specific registration entry points on agency domains.
    // These live in the (auth) route group (unauthenticated-accessible) but
    // sit under /talent/ and /client/ URL segments, which auth-routing
    // ordinarily treats as dashboard paths requiring auth. Treat them as
    // auth flow paths so unauthenticated visitors can reach them directly
    // (e.g. improntamodels.com/talent/register).
    pathname === "/talent/register" ||
    pathname === "/client/register"
  );
}

export function resolveAuthRoutingDecision({
  pathname,
  userId,
  sessionProfile,
  routingProfile,
  isImpersonating,
  nextParam,
}: AuthRoutingInput): AuthRoutingDecision {
  const authFlowPath = isAuthFlowPath(pathname);
  const dashboardDestination = userId
    ? resolveAuthenticatedDestination(sessionProfile)
    : "/login";
  const dash = pathname.split("/")[1];
  const isDashboardPath =
    dash === "admin" || dash === "talent" || dash === "client";

  const pathRole = routingProfile?.app_role ?? null;
  // Safe internal path from `?next=` (validated: starts with "/", no "//"
  // protocol-relative escapes, not the bare root). Used to keep the
  // get-started funnel intact for users who already have an account.
  const safeNextPath = normalizeOptionalNextPath(nextParam);

  if (
    userId &&
    dashboardDestination === "/onboarding/role" &&
    !authFlowPath &&
    pathname !== "/onboarding/role"
  ) {
    return {
      redirectTo: "/onboarding/role",
      loginNext: null,
      dashboardDestination,
      isDashboardPath,
    };
  }

  if (
    userId &&
    (pathname === "/login" ||
      pathname === "/register" ||
      pathname === "/join" ||
      // Phase 3.14 — redirect already-logged-in users away from the
      // role-specific register pages, just as we do for /register.
      pathname === "/talent/register" ||
      pathname === "/client/register")
  ) {
    return {
      // If `?next=<safe>` was on the URL, honor it. This is the
      // get-started → "Sign in and continue to checkout" path: the user
      // explicitly asked to land somewhere specific, not the default dash.
      redirectTo: safeNextPath ?? dashboardDestination,
      loginNext: null,
      dashboardDestination,
      isDashboardPath,
    };
  }

  // Auth flow paths (including role-specific register pages) are reachable
  // without auth even when isDashboardPath is true, so let them through.
  if (!isDashboardPath || authFlowPath) {
    return {
      redirectTo: null,
      loginNext: null,
      dashboardDestination,
      isDashboardPath,
    };
  }

  if (!userId) {
    return {
      redirectTo: "/login",
      loginNext: pathname,
      dashboardDestination,
      isDashboardPath,
    };
  }

  if (!sessionProfile || sessionProfile.account_status !== "active") {
    return {
      redirectTo: dashboardDestination,
      loginNext: null,
      dashboardDestination,
      isDashboardPath,
    };
  }

  if (pathname.startsWith("/admin") && !isStaffRole(sessionProfile.app_role)) {
    return {
      redirectTo: dashboardDestination,
      loginNext: null,
      dashboardDestination,
      isDashboardPath,
    };
  }

  if (isImpersonating && pathname.startsWith("/admin")) {
    return {
      redirectTo: dashboardPathForRole(pathRole),
      loginNext: null,
      dashboardDestination,
      isDashboardPath,
    };
  }

  // Hybrid access: a workspace owner / super-admin can ALSO be a talent on a
  // roster (they own an agency AND have their own talent profile). Their
  // `app_role` is a staff role, not "talent", so the plain `pathRole !==
  // "talent"` gate bounced every `/talent/*` request back to `/admin` — which
  // made the Talent toggle inert and sent the welcome-panel quick links
  // (Messages/Bookings/Edit profile/…) to the workspace dashboard. Let staff
  // through; the talent layout is the real gate (it `notFound()`s anyone
  // without a talent profile), so a staff user with no talent profile still
  // can't see a talent surface, while a genuine hybrid finally can.
  if (
    pathname.startsWith("/talent") &&
    pathRole !== "talent" &&
    !isStaffRole(pathRole)
  ) {
    return {
      redirectTo: dashboardPathForRole(pathRole),
      loginNext: null,
      dashboardDestination,
      isDashboardPath,
    };
  }
  if (pathname.startsWith("/client") && pathRole !== "client") {
    return {
      redirectTo: dashboardPathForRole(pathRole),
      loginNext: null,
      dashboardDestination,
      isDashboardPath,
    };
  }

  return {
    redirectTo: null,
    loginNext: null,
    dashboardDestination,
    isDashboardPath,
  };
}

export function buildAuthDebugHeaders(input: {
  userId: string | null;
  profile: AccessProfile | null;
  dashboardDestination: string;
}) {
  return {
    "x-impronta-auth-user-id": input.userId ?? "anonymous",
    "x-impronta-profile-found": input.profile ? "true" : "false",
    "x-impronta-app-role": input.profile?.app_role ?? "null",
    "x-impronta-account-status": input.profile?.account_status ?? "null",
    "x-impronta-dashboard-destination": input.dashboardDestination,
  } as const;
}

export function shouldAttachAuthDebug(searchParams: URLSearchParams): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    searchParams.get("__auth_debug") === "1"
  );
}
