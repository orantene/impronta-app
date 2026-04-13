import {
  dashboardPathForRole,
  isStaffRole,
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
    pathname.startsWith("/register")
  );
}

export function resolveAuthRoutingDecision({
  pathname,
  userId,
  sessionProfile,
  routingProfile,
  isImpersonating,
}: AuthRoutingInput): AuthRoutingDecision {
  const authFlowPath = isAuthFlowPath(pathname);
  const dashboardDestination = userId
    ? resolveAuthenticatedDestination(sessionProfile)
    : "/login";
  const dash = pathname.split("/")[1];
  const isDashboardPath =
    dash === "admin" || dash === "talent" || dash === "client";

  const pathRole = routingProfile?.app_role ?? null;

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

  if (userId && (pathname === "/login" || pathname === "/register")) {
    return {
      redirectTo: dashboardDestination,
      loginNext: null,
      dashboardDestination,
      isDashboardPath,
    };
  }

  if (!isDashboardPath) {
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

  if (pathname.startsWith("/talent") && pathRole !== "talent") {
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
