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

