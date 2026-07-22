import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveAccountHref,
  resolveAuthenticatedDestination,
  resolvePostAuthDestination,
} from "@/lib/auth-flow";
import { resolveAuthRoutingDecision } from "@/lib/auth-routing";

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
