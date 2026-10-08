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

test("talent hosts, agency custom domains and the hub keep the 404", () => {
  for (const hostKind of ["talent", "agency", "hub", "not_found"]) {
    assert.equal(startDoorRedirect({ ...base, pathname: "/start", hostKind }), null, hostKind);
    assert.equal(startDoorRedirect({ ...base, pathname: "/signup", hostKind }), null, hostKind);
  }
});

test("never redirects unsafe methods or other paths", () => {
  assert.equal(startDoorRedirect({ ...base, method: "POST", pathname: "/start", hostKind: "app" }), null);
  assert.equal(startDoorRedirect({ ...base, pathname: "/starting", hostKind: "app" }), null);
  assert.equal(startDoorRedirect({ ...base, pathname: "/start/extra", hostKind: "app" }), null);
});
