import { strict as assert } from "node:assert";
import { describe, it, afterEach } from "node:test";

import { resolveInquiryHome, isCrossChannelRehomedInquiry } from "./inquiry-rehome";
import type { OwningParty } from "./owning-party-resolver";

const HOST = "host-hub";
const AGENCY = "agency-x";
const AGENCY2 = "agency-y";
const mk = (entries: Array<[string, OwningParty]>) => new Map<string, OwningParty>(entries);

describe("resolveInquiryHome (Phase B re-home)", () => {
  afterEach(() => {
    delete process.env.XTENANT_REHOME;
  });

  it("flag OFF → always the host (pure no-op)", () => {
    assert.equal(
      resolveInquiryHome(mk([["t1", { type: "agency", id: AGENCY }]]), ["t1"], HOST),
      HOST,
    );
  });

  it("flag ON, single managing agency != host → re-home to that agency", () => {
    process.env.XTENANT_REHOME = "1";
    assert.equal(
      resolveInquiryHome(mk([["t1", { type: "agency", id: AGENCY }]]), ["t1"], HOST),
      AGENCY,
    );
  });

  it("flag ON, any talent-direct participant → stay on the host", () => {
    process.env.XTENANT_REHOME = "1";
    const owning = mk([
      ["t1", { type: "agency", id: AGENCY }],
      ["t2", { type: "talent", id: "tp-2" }],
    ]);
    assert.equal(resolveInquiryHome(owning, ["t1", "t2"], HOST), HOST);
  });

  it("flag ON, mixed managing agencies → stay on the host", () => {
    process.env.XTENANT_REHOME = "1";
    const owning = mk([
      ["t1", { type: "agency", id: AGENCY }],
      ["t2", { type: "agency", id: AGENCY2 }],
    ]);
    assert.equal(resolveInquiryHome(owning, ["t1", "t2"], HOST), HOST);
  });

  it("flag ON, single managing tenant == host (same-tenant storefront) → host", () => {
    process.env.XTENANT_REHOME = "1";
    assert.equal(
      resolveInquiryHome(mk([["t1", { type: "workspace", id: HOST }]]), ["t1"], HOST),
      HOST,
    );
  });

  it("flag ON, two talents under the SAME managing agency → re-home", () => {
    process.env.XTENANT_REHOME = "1";
    const owning = mk([
      ["t1", { type: "agency", id: AGENCY }],
      ["t2", { type: "workspace", id: AGENCY }],
    ]);
    assert.equal(resolveInquiryHome(owning, ["t1", "t2"], HOST), AGENCY);
  });
});

// FIX 1 (charge/payout coherence) — the predicate that forces a re-homed
// inquiry's client charge onto the PLATFORM account. Proves: NATIVE
// (source == tenant) keeps Direct-Charge routing; RE-HOMED (source != tenant)
// forces the platform charge; null source is a strict no-op.
describe("isCrossChannelRehomedInquiry (checkout routing predicate)", () => {
  it("NATIVE agency inquiry (source_workspace_id == tenant_id) → FALSE (Connect Direct Charge unchanged)", () => {
    // Client on the agency's own storefront contacting the agency's own talent:
    // the host IS the owning tenant, so nothing was re-homed. Direct Charge must
    // continue to route to the agency's Connect account exactly as today.
    assert.equal(isCrossChannelRehomedInquiry(AGENCY, AGENCY), false);
  });

  it("RE-HOMED hub/Discover inquiry (source_workspace_id != tenant_id) → TRUE (force platform charge)", () => {
    // Filed under the managing agency but the client came in through the hub
    // host — the money-mis-route case. Predicate fires so the charge is forced
    // onto the platform account, keeping the platform-funded transfer fan-out
    // correct instead of stranding it on a Direct Charge.
    assert.equal(isCrossChannelRehomedInquiry(AGENCY, HOST), true);
  });

  it("null source_workspace_id (pre-attribution legacy row) → FALSE (unchanged Direct Charge)", () => {
    // We only re-route when we can positively prove channel != home. A null
    // channel cannot prove a re-home, so routing is left untouched.
    assert.equal(isCrossChannelRehomedInquiry(AGENCY, null), false);
    assert.equal(isCrossChannelRehomedInquiry(AGENCY, undefined), false);
  });

  it("safety: with XTENANT_REHOME off, real rows have source == tenant → predicate never fires", () => {
    // resolveInquiryHome with the flag off always files under the host, and the
    // engine defaults source_workspace_id to that same host tenant. Model that
    // invariant: home == host == source → FALSE for every non-Discover row.
    const home = resolveInquiryHome(
      mk([["t1", { type: "agency", id: AGENCY }]]),
      ["t1"],
      HOST,
    );
    assert.equal(home, HOST); // flag off → filed under host
    assert.equal(isCrossChannelRehomedInquiry(home, HOST), false);
  });
});
