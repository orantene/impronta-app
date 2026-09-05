import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveUpgradeForCapability, paywallMessage } from "./paywall";
import { entitlementKey, type PlanEntitlementMap } from "./plan-capabilities";
import type { CapabilityKey } from "./capabilities";
import type { PlanKey } from "./plan-catalog";

const CAP = "agency.pitch.manage" as CapabilityKey;

function matrix(entries: [PlanKey, CapabilityKey, boolean][]): PlanEntitlementMap {
  return new Map(entries.map(([p, c, v]) => [entitlementKey(p, c), v]));
}

test("offers the cheapest plan ABOVE the caller that grants it", () => {
  // The live shape of the pitch rows: withheld on free and studio, granted
  // above. A Free workspace should be offered Agency, not Website — Website is
  // ranked between them and does not grant it.
  const m = matrix([
    ["free", CAP, false],
    ["studio", CAP, false],
  ]);
  const upgrade = resolveUpgradeForCapability("free", CAP, m);
  assert.equal(upgrade?.planKey, "agency");
  assert.equal(upgrade?.displayName, "Agency");
  assert.equal(upgrade?.isSelfServe, true);
});

test("never offers a plan at or below the caller's rank", () => {
  // Studio is denied and Website also lacks it, so the only answer is Agency.
  // Offering Website — cheaper in dollars, lower in rank — would be a sideways
  // move into a tier that seats nobody.
  const m = matrix([
    ["free", CAP, false],
    ["website", CAP, false],
    ["studio", CAP, false],
  ]);
  assert.equal(resolveUpgradeForCapability("studio", CAP, m)?.planKey, "agency");
});

test("returns null when nothing above grants it", () => {
  const m = matrix([
    ["free", CAP, false],
    ["website", CAP, false],
    ["studio", CAP, false],
    ["agency", CAP, false],
    ["network", CAP, false],
  ]);
  assert.equal(resolveUpgradeForCapability("free", CAP, m), null);
  // Null must read as "talk to us", never as a fabricated CTA.
  assert.match(paywallMessage("Pitches", null), /Talk to us/i);
});

test("an empty matrix offers nothing, because nothing is denied", () => {
  // Fail-open: with no rows, every plan grants everything, so the first
  // candidate above the caller matches immediately. This asserts the resolver
  // does not somehow disagree with the predicate that produced the denial.
  const upgrade = resolveUpgradeForCapability("free", CAP, new Map());
  assert.ok(upgrade, "an ungated capability should resolve to the next plan up");
});

test("a sales-led plan is offered as a conversation, not a checkout", () => {
  // Network is isSelfServe:false. Rendering "Upgrade to turn it on" for it
  // would send someone to a checkout that does not exist.
  const m = matrix([
    ["free", CAP, false],
    ["website", CAP, false],
    ["studio", CAP, false],
    ["agency", CAP, false],
  ]);
  const upgrade = resolveUpgradeForCapability("free", CAP, m);
  assert.equal(upgrade?.planKey, "network");
  assert.equal(upgrade?.isSelfServe, false);
  assert.match(paywallMessage("Cross-agency view", upgrade), /Talk to us/i);
});

test("the talent ladder never offers a workspace plan", () => {
  // Audience isolation. A talent on Free being told to buy Agency would be
  // nonsense, and the two ladders answer different questions.
  const m = matrix([["talent_basic", CAP, false]]);
  const upgrade = resolveUpgradeForCapability("talent_basic", CAP, m);
  assert.ok(upgrade);
  assert.ok(
    ["talent_pro", "talent_portfolio"].includes(upgrade.planKey),
    `expected a talent plan, got ${upgrade.planKey}`,
  );
});

test("the message never contains a price", () => {
  // Prices live in product_prices. Every copy of one in code has eventually
  // drifted from what the card is actually charged, which is most of what the
  // 2026-09-02 commerce audit found.
  const m = matrix([["free", CAP, false], ["studio", CAP, false]]);
  const msg = paywallMessage("Pitches", resolveUpgradeForCapability("free", CAP, m));
  assert.doesNotMatch(msg, /\$|\d+\s*(usd|mxn)/i);
  assert.match(msg, /Agency/);
});

test("the message is localised, and defaults to English", () => {
  const m = matrix([["free", CAP, false], ["studio", CAP, false]]);
  const upgrade = resolveUpgradeForCapability("free", CAP, m);

  assert.match(paywallMessage("Pitches", upgrade, "es"), /es parte de Agency/);
  assert.match(paywallMessage("Pitches", upgrade, "es"), /Mejora tu plan/);
  assert.match(paywallMessage("Pitches", upgrade, "en"), /is part of Agency/);
  // An unknown or absent locale must not produce an empty or half-built string.
  assert.match(paywallMessage("Pitches", upgrade), /is part of Agency/);
  assert.match(paywallMessage("Pitches", upgrade, "fr"), /is part of Agency/);
});

test("a sales-led plan says talk to us in both locales, never upgrade", () => {
  // "Mejora tu plan" on a plan with no checkout would send someone to a
  // purchase that does not exist.
  const m = matrix([
    ["free", CAP, false], ["website", CAP, false],
    ["studio", CAP, false], ["agency", CAP, false],
  ]);
  const upgrade = resolveUpgradeForCapability("free", CAP, m);
  assert.equal(upgrade?.isSelfServe, false);
  assert.match(paywallMessage("Red", upgrade, "es"), /Hablemos/);
  assert.doesNotMatch(paywallMessage("Red", upgrade, "es"), /Mejora tu plan/);
  assert.match(paywallMessage("Cross-agency view", upgrade, "en"), /Talk to us/i);
});

test("no locale leaks a price into the message", () => {
  const m = matrix([["free", CAP, false], ["studio", CAP, false]]);
  const upgrade = resolveUpgradeForCapability("free", CAP, m);
  for (const loc of ["en", "es"]) {
    assert.doesNotMatch(paywallMessage("Pitches", upgrade, loc), /\$|\d+\s*(usd|mxn)/i);
  }
});

test("KNOWN LIMIT: the feature name stays English in a Spanish message", () => {
  // Not an oversight and not acceptable long-term. The capability registry has
  // English displayName only, so a Spanish sentence carries an English noun.
  // Pinned so that adding Spanish registry names later is a deliberate change
  // that breaks this test, rather than something nobody remembers is owed.
  const m = matrix([["free", CAP, false], ["studio", CAP, false]]);
  const msg = paywallMessage("Pitches", resolveUpgradeForCapability("free", CAP, m), "es");
  assert.match(msg, /^Pitches es parte de/);
});
