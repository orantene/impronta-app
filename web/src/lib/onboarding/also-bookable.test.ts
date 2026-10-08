import assert from "node:assert/strict";
import test from "node:test";

import { runAlsoBookable, type AlsoBookableDeps, type AlsoBookableFacts } from "./also-bookable";

const studio: AlsoBookableFacts = {
  hasTalentProfile: false, ownsWorkspace: true, bookable: false,
  tenantId: "t1", tenantSlug: "acme", talentProfileId: null, displayName: "Nia",
  isOwner: true, hasOwnSite: false,
};

/** A tiny in-memory world so a second call really sees the first call's writes. */
function world(fail?: string) {
  const db = { profile: null as string | null, live: false, roster: false, site: false };
  const calls: string[] = [];
  const step = (name: string, write: () => void) => async () => {
    calls.push(name);
    if (name === fail) return { ok: false as const, error: name };
    write();
    return { ok: true as const };
  };
  const deps: AlsoBookableDeps = {
    async addProvider() {
      calls.push("addProvider");
      if (fail === "addProvider") return { ok: false, error: "addProvider" };
      db.profile = "tp1";
      return { ok: true, talentProfileId: "tp1" };
    },
    promoteProfileLive: step("promoteProfileLive", () => { db.live = true; }),
    ensureSelfRoster: step("ensureSelfRoster", () => { db.roster = true; }),
    ensureOwnSite: step("ensureOwnSite", () => { db.site = true; }),
  };
  const facts = (): AlsoBookableFacts => ({
    ...studio,
    hasTalentProfile: Boolean(db.profile),
    talentProfileId: db.profile,
    bookable: db.roster,
    hasOwnSite: db.site,
  });
  return { db, calls, deps, facts };
}

test("converts once: profile, live, roster, own site in order", async () => {
  const w = world();
  const r = await runAlsoBookable(w.facts(), {}, w.deps);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.changed, true);
    assert.equal(r.slug, "acme");
  }
  assert.deepEqual(w.calls, ["addProvider", "promoteProfileLive", "ensureSelfRoster", "ensureOwnSite"]);
  assert.deepEqual(w.db, { profile: "tp1", live: true, roster: true, site: true });
});

test("second call changes nothing and calls no writer", async () => {
  const w = world();
  await runAlsoBookable(w.facts(), {}, w.deps);
  w.calls.length = 0;
  const r = await runAlsoBookable(w.facts(), {}, w.deps);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.changed, false);
  assert.deepEqual(w.calls, []);
});

test("non-owner is refused before any write", async () => {
  const w = world();
  const r = await runAlsoBookable({ ...w.facts(), isOwner: false }, {}, w.deps);
  assert.equal(r.ok, false);
  assert.deepEqual(w.calls, []);
});

test("not a studio (no owned workspace) is refused before any write", async () => {
  const w = world();
  const r = await runAlsoBookable({ ...w.facts(), ownsWorkspace: false, tenantId: null, tenantSlug: null }, {}, w.deps);
  assert.equal(r.ok, false);
  assert.deepEqual(w.calls, []);
});

test("site failure is reported with what finished, and the retry finishes it", async () => {
  const w = world("ensureOwnSite");
  const r = await runAlsoBookable(w.facts(), {}, w.deps);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.deepEqual(r.completed, ["profile", "live", "roster"]);
    assert.deepEqual(r.pending, ["site"]);
  }
  assert.deepEqual(w.db, { profile: "tp1", live: true, roster: true, site: false });

  const retry = world();
  retry.db.profile = "tp1"; retry.db.live = true; retry.db.roster = true;
  const r2 = await runAlsoBookable(retry.facts(), {}, retry.deps);
  assert.equal(r2.ok, true);
  assert.deepEqual(retry.calls, ["promoteProfileLive", "ensureSelfRoster", "ensureOwnSite"]);
  assert.equal(retry.db.site, true);
});

test("profile failure writes nothing and reports everything pending", async () => {
  const w = world("addProvider");
  const r = await runAlsoBookable(w.facts(), {}, w.deps);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.deepEqual(r.completed, []);
    assert.deepEqual(r.pending, ["profile", "live", "roster", "site"]);
  }
  assert.deepEqual(w.db, { profile: null, live: false, roster: false, site: false });
});

test("owner who already has a profile reuses it (no addProvider)", async () => {
  const w = world();
  w.db.profile = "tp1";
  const r = await runAlsoBookable(w.facts(), {}, w.deps);
  assert.equal(r.ok, true);
  assert.equal(w.calls.includes("addProvider"), false);
});
