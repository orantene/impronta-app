import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DESTINATION_IDS,
  DESTINATION_REGISTRY,
  destinationPath,
  destinationsForActivities,
  destinationsByGroup,
} from "./destinations";

test("registry covers every destination id", () => {
  assert.equal(DESTINATION_IDS.length, 21);
  for (const id of DESTINATION_IDS) {
    assert.equal(DESTINATION_REGISTRY[id].id, id);
  }
});

test("paths map onto existing admin routes; unbuilt stay null", () => {
  assert.equal(destinationPath("sales", "acme"), "/acme/admin/sales");
  assert.equal(destinationPath("catalog", "acme"), "/acme/admin/menu");
  assert.equal(destinationPath("home", "acme"), "/acme/admin");
  assert.equal(destinationPath("projects", "acme"), null);
});

test("activity collapse hides unused operate surfaces but keeps settings", () => {
  const nav = destinationsForActivities(["pos"]);
  const ids = nav.map((d) => d.id);
  assert.ok(ids.includes("pos"));
  assert.ok(ids.includes("sales"));
  assert.ok(ids.includes("settings"));
  assert.equal(ids.includes("events"), false);
});

test("groups partition without dropping destinations", () => {
  const all = destinationsForActivities(["pos", "events", "appointments", "messaging", "catalog"]);
  const grouped = destinationsByGroup(all);
  const flat = Object.values(grouped).flat();
  assert.equal(flat.length, all.length);
});
