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
