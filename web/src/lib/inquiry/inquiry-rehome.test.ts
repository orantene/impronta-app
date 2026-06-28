import { strict as assert } from "node:assert";
import { describe, it, afterEach } from "node:test";

import { resolveInquiryHome } from "./inquiry-rehome";
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
