import test from "node:test";
import assert from "node:assert/strict";
import { resolveLoginLoopGuard } from "@/lib/auth-login-loop-guard";
import { resolveAuthRoutingDecision } from "@/lib/auth-routing";

const activeClient = { app_role: "client", account_status: "active" };

test("first hop of a signed-in visitor forwards to next as before", () => {
  assert.deepEqual(
    resolveLoginLoopGuard({ reasonParam: null, nextPath: "/client", forwardMarker: null }),
    { kind: "forward" },
  );
});

test("a marker equal to next means the page bounced us back: break and restart as expired", () => {
  const d = resolveLoginLoopGuard({ reasonParam: null, nextPath: "/client", forwardMarker: "/client" });
  assert.equal(d.kind, "break");
  assert.equal(d.kind === "break" && d.redirectTo, "/login?next=%2Fclient&reason=session_expired");
});

test("a marker for a different target does not break the loop guard", () => {
  assert.equal(
    resolveLoginLoopGuard({ reasonParam: null, nextPath: "/client", forwardMarker: "/talent" }).kind,
    "forward",
  );
});

test("any reason flag shows the form and clears cookies, never forwards", () => {
  assert.equal(
    resolveLoginLoopGuard({ reasonParam: "session_expired", nextPath: "/client", forwardMarker: "/client" }).kind,
    "show-form-clear",
  );
});

test("a next that already carries a reason flag stops forwarding", () => {
  assert.equal(
    resolveLoginLoopGuard({ reasonParam: null, nextPath: "/client?reason=x", forwardMarker: null }).kind,
    "show-form-clear",
  );
});

test("routing: signed-in visitor on /login with reason renders the form once and clears auth cookies", () => {
  const d = resolveAuthRoutingDecision({
    pathname: "/login",
    userId: "u1",
    sessionProfile: activeClient,
    routingProfile: activeClient,
    isImpersonating: false,
    nextParam: "/client",
    reasonParam: "session_expired",
  });
  assert.equal(d.redirectTo, null);
  assert.equal(d.clearAuthCookies, true);
});

test("routing: normal forward stamps the loop marker target; second hop breaks", () => {
  const base = {
    pathname: "/login",
    userId: "u1",
    sessionProfile: activeClient,
    routingProfile: activeClient,
    isImpersonating: false,
    nextParam: "/client",
  };
  const first = resolveAuthRoutingDecision(base);
  assert.equal(first.redirectTo, "/client");
  assert.equal(first.forwardedFromLogin, "/client");
  const second = resolveAuthRoutingDecision({ ...base, loginForwardMarker: first.forwardedFromLogin });
  assert.equal(second.redirectTo, "/login?next=%2Fclient&reason=session_expired");
  assert.equal(second.clearAuthCookies, true);
});

test("routing: signed-out visitors are unaffected", () => {
  const d = resolveAuthRoutingDecision({
    pathname: "/login",
    userId: null,
    sessionProfile: null,
    routingProfile: null,
    isImpersonating: false,
    nextParam: "/client",
    reasonParam: "session_expired",
  });
  assert.equal(d.redirectTo, null);
  assert.notEqual(d.clearAuthCookies, true);
});
