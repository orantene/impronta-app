import {
  dashboardPathForRole,
  isStaffRole,
  normalizeOptionalNextPath,
  resolveAuthenticatedDestination,
  type AccessProfile,
} from "@/lib/auth-flow";
import {
  isPathAllowedForHostKind,
  isSurfaceHostKind,
} from "@/lib/saas/surface-allow-list";

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
  /**
   * Host kind serving this request (`marketing`, `app`, `agency`, `hub`).
   *
   * Auth routing used to be host-blind: it happily redirected to `/admin`,
   * `/client`, or `/onboarding/role` no matter which surface the request
   * arrived on. Those paths only exist on the app + agency surfaces, so on
   * the marketing apex (tulala.digital) or the hub the redirect landed on a
   * path the surface allow-list 404s — a hard dead end with no way forward.
   *
   * Live repro (2026-08-07): a brand-new signup (app_role='client',
   * account_status='onboarding') visiting tulala.digital/get-started was
   * bounced to /onboarding/role and got "Page not found" instead of the
   * workspace signup form.
   *
   * Left optional so existing callers/tests keep their host-blind behavior;
   * middleware always passes it.
   */
  hostKind?: string | null | undefined;
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
    pathname === "/client/register" ||
    // `/get-started` is the workspace signup entry point, not a page to be
    // bounced off. A signed-in-but-still-onboarding account (the state every
    // brand-new signup is in) landing here from a bookmark, the back button,
    // a marketing CTA, or an email link must SEE the form: it is the only
    // path that leads forward for someone who wants a workspace. The page
    // itself handles signed-in visitors (#1038).
    pathname === "/get-started" ||
    pathname.startsWith("/get-started/")
  );
}

/**
 * Strip the query string so a redirect target like
 * `/onboarding/workspace?lead=abc` is allow-list-checked as a path.
 */
function pathnameOfTarget(target: string): string {
  const q = target.indexOf("?");
  return q === -1 ? target : target.slice(0, q);
}

/**
 * True when `target` can actually render on `hostKind`.
 *
 * The surface allow-list is the same gate middleware applies to the inbound
 * request, so this answers exactly the question that matters: would
 * redirecting there produce a 404? An unknown `hostKind` (callers that do
 * not pass one) answers `true`, preserving the previous host-blind behavior.
 */
function targetExistsOnHost(
  target: string,
  hostKind: string | null | undefined,
): boolean {
  if (!hostKind || !isSurfaceHostKind(hostKind)) return true;
  return isPathAllowedForHostKind(hostKind, pathnameOfTarget(target));
}

export function resolveAuthRoutingDecision({
  pathname,
  userId,
  sessionProfile,
  routingProfile,
  isImpersonating,
  nextParam,
  hostKind,
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

  /**
   * Never redirect to a path this surface 404s. When the intended target does
   * not exist here, fall back to `/`, which every host kind serves and which
   * always leads forward (the header carries a "Finish account setup" link).
   */
  const hostSafeRedirect = (target: string): string =>
    targetExistsOnHost(target, hostKind) ? target : "/";

  if (
    userId &&
    dashboardDestination === "/onboarding/role" &&
    !authFlowPath &&
    pathname !== "/onboarding/role" &&
    // Host-aware: `/onboarding/*` lives on the app + agency surfaces only.
    // On marketing/hub this bounce produced a 404, so let the requested page
    // render instead. The user keeps a working page and can still finish
    // setup from the header link.
    targetExistsOnHost("/onboarding/role", hostKind)
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
      // Host-guarded: a signed-in client hitting tulala.digital/login used to
      // be sent to /client, which does not exist on the marketing surface.
      redirectTo: hostSafeRedirect(safeNextPath ?? dashboardDestination),
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
      redirectTo: hostSafeRedirect(dashboardDestination),
      loginNext: null,
      dashboardDestination,
      isDashboardPath,
    };
  }

  if (pathname.startsWith("/admin") && !isStaffRole(sessionProfile.app_role)) {
    return {
      redirectTo: hostSafeRedirect(dashboardDestination),
      loginNext: null,
      dashboardDestination,
      isDashboardPath,
    };
  }

  if (isImpersonating && pathname.startsWith("/admin")) {
    return {
      redirectTo: hostSafeRedirect(dashboardPathForRole(pathRole)),
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
      redirectTo: hostSafeRedirect(dashboardPathForRole(pathRole)),
      loginNext: null,
      dashboardDestination,
      isDashboardPath,
    };
  }
  if (pathname.startsWith("/client") && pathRole !== "client") {
    return {
      redirectTo: hostSafeRedirect(dashboardPathForRole(pathRole)),
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
