import assert from "node:assert/strict";
import test from "node:test";

import { startDoorRedirect } from "./start-door-redirect";

const base = { method: "GET", search: "", marketingOrigin: "https://tulala.digital/" };

test("app host: /start and /signup go to the marketing /start", () => {
  assert.equal(startDoorRedirect({ ...base, pathname: "/start", hostKind: "app" }), "https://tulala.digital/start");
  assert.equal(startDoorRedirect({ ...base, pathname: "/signup", hostKind: "app" }), "https://tulala.digital/start");
  assert.equal(startDoorRedirect({ ...base, pathname: "/signup/", hostKind: "app" }), "https://tulala.digital/start");
});

test("the query string survives the hop", () => {
  assert.equal(
    startDoorRedirect({ ...base, pathname: "/start", hostKind: "app", search: "?lang=es&choice=myself" }),
    "https://tulala.digital/start?lang=es&choice=myself",
  );
});

test("marketing host: only /signup redirects; /start is served", () => {
  assert.equal(startDoorRedirect({ ...base, pathname: "/signup", hostKind: "marketing" }), "https://tulala.digital/start");
  assert.equal(startDoorRedirect({ ...base, pathname: "/start", hostKind: "marketing" }), null);
});

test("agency hosts and talent sites redirect too (TUL-163: a 404 is a dead end)", () => {
  for (const hostKind of ["agency", "talent_site"]) {
    assert.equal(startDoorRedirect({ ...base, pathname: "/start", hostKind }), "https://tulala.digital/start", hostKind);
    assert.equal(startDoorRedirect({ ...base, pathname: "/signup", hostKind }), "https://tulala.digital/start", hostKind);
  }
});

test("the hub and unregistered hosts are left alone", () => {
  for (const hostKind of ["hub", "not_found"]) {
    assert.equal(startDoorRedirect({ ...base, pathname: "/start", hostKind }), null, hostKind);
    assert.equal(startDoorRedirect({ ...base, pathname: "/signup", hostKind }), null, hostKind);
  }
});

test("never redirects unsafe methods or other paths", () => {
  assert.equal(startDoorRedirect({ ...base, method: "POST", pathname: "/start", hostKind: "app" }), null);
  assert.equal(startDoorRedirect({ ...base, pathname: "/starting", hostKind: "app" }), null);
  assert.equal(startDoorRedirect({ ...base, pathname: "/start/extra", hostKind: "app" }), null);
});

test("the legacy /onboarding/role URL: marketing host hands it to /start, every other host keeps its own behavior", () => {
  assert.equal(startDoorRedirect({ ...base, pathname: "/onboarding/role", hostKind: "marketing" }), "https://tulala.digital/start");
  assert.equal(
    startDoorRedirect({ ...base, pathname: "/onboarding/role", hostKind: "marketing", search: "?lang=es" }),
    "https://tulala.digital/start?lang=es",
  );
  for (const hostKind of ["app", "agency", "talent_site", "hub", "not_found"]) {
    assert.equal(startDoorRedirect({ ...base, pathname: "/onboarding/role", hostKind }), null, hostKind);
  }
  assert.equal(startDoorRedirect({ ...base, method: "POST", pathname: "/onboarding/role", hostKind: "marketing" }), null);
});

test("a Spanish prefix is kept: app/agency/talent /es/start goes to the marketing /es/start", () => {
  for (const hostKind of ["app", "agency", "talent_site"]) {
    assert.equal(startDoorRedirect({ ...base, pathname: "/es/start", hostKind }), "https://tulala.digital/es/start", hostKind);
    assert.equal(startDoorRedirect({ ...base, pathname: "/es/signup/", hostKind }), "https://tulala.digital/es/start", hostKind);
  }
  assert.equal(
    startDoorRedirect({ ...base, pathname: "/es/start", hostKind: "app", search: "?choice=myself" }),
    "https://tulala.digital/es/start?choice=myself",
  );
  assert.equal(startDoorRedirect({ ...base, pathname: "/es/start", hostKind: "marketing" }), null);
  assert.equal(startDoorRedirect({ ...base, pathname: "/es/signup", hostKind: "marketing" }), "https://tulala.digital/es/start");
  assert.equal(startDoorRedirect({ ...base, pathname: "/es/onboarding/role", hostKind: "marketing" }), "https://tulala.digital/es/start");
  assert.equal(startDoorRedirect({ ...base, pathname: "/es/onboarding/role", hostKind: "app" }), null);
  assert.equal(startDoorRedirect({ ...base, pathname: "/es/start", hostKind: "hub" }), null);
  assert.equal(startDoorRedirect({ ...base, pathname: "/es", hostKind: "app" }), null);
  assert.equal(startDoorRedirect({ ...base, pathname: "/esx/start", hostKind: "app" }), null);
});

test("TUL-905: the platform app host hands /help (and its pages) to the marketing help centre", () => {
  assert.equal(startDoorRedirect({ ...base, pathname: "/help", hostKind: "app" }), "https://tulala.digital/help");
  assert.equal(startDoorRedirect({ ...base, pathname: "/help/", hostKind: "app" }), "https://tulala.digital/help");
  assert.equal(
    startDoorRedirect({ ...base, pathname: "/help/talents", hostKind: "app", search: "?lang=es" }),
    "https://tulala.digital/help/talents?lang=es",
  );
  // Tenant-branded hosts and the marketing host keep their own routing.
  for (const hostKind of ["marketing", "agency", "talent_site", "hub"]) {
    assert.equal(startDoorRedirect({ ...base, pathname: "/help", hostKind }), null, hostKind);
  }
  assert.equal(startDoorRedirect({ ...base, pathname: "/helpdesk", hostKind: "app" }), null);
  assert.equal(startDoorRedirect({ ...base, method: "POST", pathname: "/help", hostKind: "app" }), null);
});
