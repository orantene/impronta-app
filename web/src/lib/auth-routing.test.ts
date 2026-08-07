import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveAccountHref,
  resolveAuthenticatedDestination,
  resolvePostAuthDestination,
} from "@/lib/auth-flow";
import { resolveAuthRoutingDecision } from "@/lib/auth-routing";
import { isPathAllowedForHostKind } from "@/lib/saas/surface-allow-list";

const activeAdmin = {
  app_role: "super_admin",
  account_status: "active",
};

const activeAgencyStaff = {
  app_role: "agency_staff",
  account_status: "active",
};

const activeTalent = {
  app_role: "talent",
  account_status: "active",
};

const activeClient = {
  app_role: "client",
  account_status: "active",
};

const onboardingUser = {
  app_role: null,
  account_status: "onboarding",
};

test("admin users resolve to /admin", () => {
  assert.equal(resolveAuthenticatedDestination(activeAdmin), "/admin");
  assert.deepEqual(resolveAccountHref(true, activeAdmin), {
    href: "/admin",
    label: "Admin",
  });
  assert.equal(
    resolveAuthRoutingDecision({
      pathname: "/admin",
      userId: "user-1",
      sessionProfile: activeAdmin,
      routingProfile: activeAdmin,
      isImpersonating: false,
    }).redirectTo,
    null,
  );
});

test("new onboarding users resolve to /onboarding/role", () => {
  assert.equal(resolveAuthenticatedDestination(onboardingUser), "/onboarding/role");
  assert.deepEqual(resolveAccountHref(true, onboardingUser), {
    href: "/onboarding/role",
    label: "Finish account setup",
  });
  assert.equal(
    resolveAuthRoutingDecision({
      pathname: "/directory",
      userId: "user-2",
      sessionProfile: onboardingUser,
      routingProfile: onboardingUser,
      isImpersonating: false,
    }).redirectTo,
    "/onboarding/role",
  );
});

test("post-auth preserves branded portal next for onboarding users", () => {
  assert.equal(
    resolvePostAuthDestination(onboardingUser, "/impronta/client/inquiries/new?talent=abc"),
    "/onboarding/role?next=%2Fimpronta%2Fclient%2Finquiries%2Fnew%3Ftalent%3Dabc",
  );
  assert.equal(
    resolvePostAuthDestination(onboardingUser, "/en/impronta/talent"),
    "/onboarding/role?next=%2Fimpronta%2Ftalent",
  );
  assert.equal(
    resolvePostAuthDestination(onboardingUser, "/admin"),
    "/onboarding/role",
  );
  assert.equal(
    resolvePostAuthDestination(onboardingUser, "/onboarding/workspace?lead=abc123"),
    "/onboarding/workspace?lead=abc123",
  );
});

test("talent users resolve to /talent and are redirected away from /admin", () => {
  assert.equal(resolveAuthenticatedDestination(activeTalent), "/talent");
  assert.deepEqual(resolveAccountHref(true, activeTalent), {
    href: "/talent",
    label: "Profile",
  });
  assert.equal(
    resolveAuthRoutingDecision({
      pathname: "/admin",
      userId: "user-3",
      sessionProfile: activeTalent,
      routingProfile: activeTalent,
      isImpersonating: false,
    }).redirectTo,
    "/talent",
  );
});

test("hybrid staff (super_admin / agency_staff) are NOT bounced off /talent", () => {
  // A workspace owner / super-admin can also be a talent on a roster. The
  // /talent guard must let staff through (the talent layout gates on the
  // actual talent profile) so the Talent toggle + welcome-panel links work.
  for (const staff of [activeAdmin, activeAgencyStaff]) {
    for (const path of ["/talent", "/talent/inbox", "/talent/calendar", "/talent/profile"]) {
      assert.equal(
        resolveAuthRoutingDecision({
          pathname: path,
          userId: "hybrid-1",
          sessionProfile: staff,
          routingProfile: staff,
          isImpersonating: false,
        }).redirectTo,
        null,
        `${staff.app_role} should reach ${path}, not be redirected`,
      );
    }
  }
  // Clients (non-staff, non-talent) are still bounced off /talent.
  assert.equal(
    resolveAuthRoutingDecision({
      pathname: "/talent/inbox",
      userId: "client-1",
      sessionProfile: activeClient,
      routingProfile: activeClient,
      isImpersonating: false,
    }).redirectTo,
    "/client",
  );
});

test("client users resolve to /client and are redirected away from /admin", () => {
  assert.equal(resolveAuthenticatedDestination(activeClient), "/client");
  assert.deepEqual(resolveAccountHref(true, activeClient), {
    href: "/client",
    label: "Dashboard",
  });
  assert.equal(
    resolveAuthRoutingDecision({
      pathname: "/admin",
      userId: "user-4",
      sessionProfile: activeClient,
      routingProfile: activeClient,
      isImpersonating: false,
    }).redirectTo,
    "/client",
  );
});


test("super admin impersonating talent is redirected away from /admin", () => {
  assert.equal(
    resolveAuthRoutingDecision({
      pathname: "/admin",
      userId: "admin-1",
      sessionProfile: activeAdmin,
      routingProfile: activeTalent,
      isImpersonating: true,
    }).redirectTo,
    "/talent",
  );
});

test("anonymous users attempting a dashboard route are sent to login with next", () => {
  const decision = resolveAuthRoutingDecision({
    pathname: "/client",
    userId: null,
    sessionProfile: null,
    routingProfile: null,
    isImpersonating: false,
  });

  assert.equal(decision.redirectTo, "/login");
  assert.equal(decision.loginNext, "/client");
});

test("post-auth redirects cross-role dashboard targets to the user's home", () => {
  assert.equal(resolvePostAuthDestination(activeClient, "/admin"), "/client");
  assert.equal(resolvePostAuthDestination(activeTalent, "/client"), "/talent");
  assert.equal(resolvePostAuthDestination(activeAdmin, "/talent/overview"), "/admin");
  assert.equal(resolvePostAuthDestination(activeAgencyStaff, "/impronta/talent"), "/admin");
  assert.equal(resolvePostAuthDestination(activeClient, "/impronta/admin/site"), "/client");
  assert.equal(resolvePostAuthDestination(activeTalent, "/impronta/admin/site"), "/talent");
});

test("post-auth honors public and locale-prefixed directory paths", () => {
  assert.equal(
    resolvePostAuthDestination(activeTalent, "/directory"),
    "/directory",
  );
  assert.equal(
    resolvePostAuthDestination(activeClient, "/en/directory"),
    "/directory",
  );
  assert.equal(resolvePostAuthDestination(activeTalent, "/t/abc"), "/t/abc");
});

test("post-auth still sends password recovery to update-password", () => {
  assert.equal(
    resolvePostAuthDestination(activeAdmin, "/update-password"),
    "/update-password",
  );
});

test("post-auth maps bare / to role home for active users", () => {
  assert.equal(resolvePostAuthDestination(activeTalent, "/"), "/talent");
});

test("post-auth sends talent registration next into the live profile fields engine", () => {
  assert.equal(
    resolvePostAuthDestination(activeTalent, "/talent/profile/fields"),
    "/talent/profile/fields",
  );
  assert.equal(
    resolvePostAuthDestination(onboardingUser, "/talent/profile/fields"),
    "/onboarding/role?next=%2Ftalent%2Fprofile%2Ffields",
  );
});

test("post-auth honors tenant-scoped dashboard next paths for the matching active role", () => {
  assert.equal(
    resolvePostAuthDestination(activeAgencyStaff, "/impronta/admin/site"),
    "/impronta/admin/site",
  );
  assert.equal(
    resolvePostAuthDestination(activeTalent, "/impronta/talent/inbox"),
    "/impronta/talent/inbox",
  );
  assert.equal(
    resolvePostAuthDestination(activeClient, "/impronta/client/inquiries/new"),
    "/impronta/client/inquiries/new",
  );
});

test("post-auth rejects external or protocol-relative next paths", () => {
  assert.equal(resolvePostAuthDestination(activeAgencyStaff, "https://evil.example/admin"), "/admin");
  assert.equal(resolvePostAuthDestination(activeAgencyStaff, "//evil.example/admin"), "/admin");
  assert.equal(resolvePostAuthDestination(activeAgencyStaff, "/api/admin/search"), "/admin");
});

test("active users may continue into workspace signup onboarding", () => {
  assert.equal(
    resolvePostAuthDestination(activeAdmin, "/onboarding/workspace?lead=abc123"),
    "/onboarding/workspace?lead=abc123",
  );
});

// ─── ?next= preservation for already-logged-in users on /login or /register ───

test("logged-in user on /login with safe ?next= is redirected to the next path, not their dashboard", () => {
  const decision = resolveAuthRoutingDecision({
    pathname: "/login",
    userId: "user-1",
    sessionProfile: activeClient,
    routingProfile: activeClient,
    isImpersonating: false,
    nextParam: "/onboarding/workspace?lead=abc-123",
  });
  assert.equal(decision.redirectTo, "/onboarding/workspace?lead=abc-123");
});

test("logged-in user on /register with safe ?next= is redirected to the next path", () => {
  const decision = resolveAuthRoutingDecision({
    pathname: "/register",
    userId: "user-1",
    sessionProfile: activeTalent,
    routingProfile: activeTalent,
    isImpersonating: false,
    nextParam: "/onboarding/workspace?lead=xyz",
  });
  assert.equal(decision.redirectTo, "/onboarding/workspace?lead=xyz");
});

test("logged-in user on /login WITHOUT ?next= still bounces to their dashboard", () => {
  const decision = resolveAuthRoutingDecision({
    pathname: "/login",
    userId: "user-1",
    sessionProfile: activeAdmin,
    routingProfile: activeAdmin,
    isImpersonating: false,
  });
  assert.equal(decision.redirectTo, "/admin");
});

test("logged-in user on /login with protocol-relative ?next= falls back to dashboard (no open redirect)", () => {
  const decision = resolveAuthRoutingDecision({
    pathname: "/login",
    userId: "user-1",
    sessionProfile: activeAdmin,
    routingProfile: activeAdmin,
    isImpersonating: false,
    nextParam: "//evil.example/admin",
  });
  assert.equal(decision.redirectTo, "/admin");
});

test("logged-in user on /login with empty ?next= falls back to dashboard", () => {
  const decision = resolveAuthRoutingDecision({
    pathname: "/login",
    userId: "user-1",
    sessionProfile: activeAdmin,
    routingProfile: activeAdmin,
    isImpersonating: false,
    nextParam: "",
  });
  assert.equal(decision.redirectTo, "/admin");
});

// ─── Host-aware redirects: never send anyone to a path this surface 404s ───
//
// Live repro (2026-08-07): a brand-new signup (handle_new_user lands them as
// app_role='client', account_status='onboarding', onboarding_completed_at=null)
// signed in, then opened tulala.digital/get-started. Auth routing bounced them
// to /onboarding/role, which the marketing surface allow-list 404s, so the
// signup entry point became a hard dead end. Anonymous /get-started was fine,
// so only an already-signed-in, mid-onboarding account hit it.

const onboardingClient = {
  app_role: "client",
  account_status: "onboarding",
};

test("signed-in onboarding account sees /get-started on the marketing host (no 404 bounce)", () => {
  const decision = resolveAuthRoutingDecision({
    pathname: "/get-started",
    userId: "fresh-signup-1",
    sessionProfile: onboardingClient,
    routingProfile: onboardingClient,
    isImpersonating: false,
    hostKind: "marketing",
  });
  assert.equal(decision.redirectTo, null);
  // The destination itself is unchanged — only where we are willing to send
  // them from this surface is.
  assert.equal(decision.dashboardDestination, "/onboarding/role");
});

test("/get-started is never bounced for an onboarding account on ANY surface", () => {
  for (const hostKind of ["marketing", "app", "agency", "hub"] as const) {
    assert.equal(
      resolveAuthRoutingDecision({
        pathname: "/get-started",
        userId: "fresh-signup-2",
        sessionProfile: onboardingClient,
        routingProfile: onboardingClient,
        isImpersonating: false,
        hostKind,
      }).redirectTo,
      null,
      `/get-started must render on ${hostKind}`,
    );
  }
});

test("onboarding bounce is suppressed on surfaces without /onboarding, kept where it exists", () => {
  const on = (pathname: string, hostKind: "marketing" | "app" | "agency" | "hub") =>
    resolveAuthRoutingDecision({
      pathname,
      userId: "fresh-signup-3",
      sessionProfile: onboardingClient,
      routingProfile: onboardingClient,
      isImpersonating: false,
      hostKind,
    }).redirectTo;

  // Marketing + hub do not serve /onboarding/* — let the requested page render
  // rather than redirect into a 404.
  assert.equal(on("/pricing", "marketing"), null);
  assert.equal(on("/directory", "marketing"), null);
  assert.equal(on("/t/abc123", "hub"), null);

  // App + agency serve it, so the funnel is unchanged there.
  assert.equal(on("/", "app"), "/onboarding/role");
  assert.equal(on("/", "agency"), "/onboarding/role");
});

test("host-blind callers (no hostKind) keep the legacy bounce", () => {
  assert.equal(
    resolveAuthRoutingDecision({
      pathname: "/directory",
      userId: "fresh-signup-4",
      sessionProfile: onboardingClient,
      routingProfile: onboardingClient,
      isImpersonating: false,
    }).redirectTo,
    "/onboarding/role",
  );
});

test("signed-in user on /login is not sent to a dashboard the surface 404s", () => {
  // /login is allow-listed on marketing, but /client is not: the old bounce
  // dead-ended an active client who reopened tulala.digital/login.
  assert.equal(
    resolveAuthRoutingDecision({
      pathname: "/login",
      userId: "user-9",
      sessionProfile: activeClient,
      routingProfile: activeClient,
      isImpersonating: false,
      hostKind: "marketing",
    }).redirectTo,
    "/",
  );
  // Same request on the app host still lands on the dashboard.
  assert.equal(
    resolveAuthRoutingDecision({
      pathname: "/login",
      userId: "user-9",
      sessionProfile: activeClient,
      routingProfile: activeClient,
      isImpersonating: false,
      hostKind: "app",
    }).redirectTo,
    "/client",
  );
});

test("an unreachable ?next= on this surface degrades to / instead of a 404", () => {
  assert.equal(
    resolveAuthRoutingDecision({
      pathname: "/login",
      userId: "user-10",
      sessionProfile: activeClient,
      routingProfile: activeClient,
      isImpersonating: false,
      nextParam: "/onboarding/workspace?lead=abc-123",
      hostKind: "marketing",
    }).redirectTo,
    "/",
  );
  assert.equal(
    resolveAuthRoutingDecision({
      pathname: "/login",
      userId: "user-10",
      sessionProfile: activeClient,
      routingProfile: activeClient,
      isImpersonating: false,
      nextParam: "/onboarding/workspace?lead=abc-123",
      hostKind: "app",
    }).redirectTo,
    "/onboarding/workspace?lead=abc-123",
  );
});

test("every redirect this resolver can emit exists on the surface that emits it", () => {
  // Blanket invariant: whatever combination of profile, path, and surface we
  // throw at it, the answer must be a path the surface allow-list serves.
  const profiles = [
    activeAdmin,
    activeAgencyStaff,
    activeTalent,
    activeClient,
    onboardingUser,
    onboardingClient,
    null,
  ];
  const paths = [
    "/",
    "/get-started",
    "/login",
    "/register",
    "/directory",
    "/pricing",
    "/admin",
    "/talent",
    "/client",
    "/onboarding/role",
    "/c/inq-1",
  ];
  for (const hostKind of ["marketing", "app", "agency", "hub"] as const) {
    for (const profile of profiles) {
      for (const pathname of paths) {
        const { redirectTo } = resolveAuthRoutingDecision({
          pathname,
          userId: profile ? "user-x" : null,
          sessionProfile: profile,
          routingProfile: profile,
          isImpersonating: false,
          hostKind,
        });
        if (!redirectTo) continue;
        const [targetPath] = redirectTo.split("?", 1);
        assert.equal(
          isPathAllowedForHostKind(hostKind, targetPath),
          true,
          `${hostKind} ${pathname} → ${redirectTo} is a 404 on this surface`,
        );
      }
    }
  }
});
