import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  collectSubtreeTermIds,
  DISABLE_HOLDERS_CODE,
  disableHoldersBlockedMessage,
  disableHoldersClearedMessage,
  holderProfileIdsForTerms,
} from "./disable-term-holders";

describe("collectSubtreeTermIds", () => {
  test("includes the root and every descendant", () => {
    const children = new Map<string, string[]>([
      ["performers", ["stage-show-acts"]],
      ["stage-show-acts", ["cabaret-act", "comedy-act"]],
      ["cabaret-act", []],
      ["comedy-act", []],
    ]);
    assert.deepEqual(collectSubtreeTermIds("stage-show-acts", children).sort(), [
      "cabaret-act",
      "comedy-act",
      "stage-show-acts",
    ]);
  });

  test("a leaf returns only itself", () => {
    const children = new Map<string, string[]>([["cabaret-act", []]]);
    assert.deepEqual(collectSubtreeTermIds("cabaret-act", children), ["cabaret-act"]);
  });
});

describe("holderProfileIdsForTerms", () => {
  const roster = new Set(["t1", "t2", "t3"]);
  const termIds = new Set(["cabaret-act", "nightlife-influencer"]);

  test("counts only this tenant's roster holders of the switched-off terms", () => {
    const holders = holderProfileIdsForTerms({
      termIds,
      rosterProfileIds: roster,
      tenantId: "impronta",
      assignments: [
        { talent_profile_id: "t1", taxonomy_term_id: "cabaret-act", tenant_id: "impronta" },
        { talent_profile_id: "t2", taxonomy_term_id: "nightlife-influencer", tenant_id: "impronta" },
        // other tenant — must not count
        { talent_profile_id: "t3", taxonomy_term_id: "cabaret-act", tenant_id: "tulala" },
        // not on roster
        { talent_profile_id: "t9", taxonomy_term_id: "cabaret-act", tenant_id: "impronta" },
        // different term
        { talent_profile_id: "t1", taxonomy_term_id: "actor", tenant_id: "impronta" },
      ],
    });
    assert.deepEqual(holders, ["t1", "t2"]);
  });

  test("legacy null-tenant rows still count (hide must clear them too)", () => {
    const holders = holderProfileIdsForTerms({
      termIds,
      rosterProfileIds: roster,
      tenantId: "impronta",
      assignments: [
        { talent_profile_id: "t1", taxonomy_term_id: "cabaret-act", tenant_id: null },
      ],
    });
    assert.deepEqual(holders, ["t1"]);
  });

  test("empty when nobody holds the term on this tenant", () => {
    assert.deepEqual(
      holderProfileIdsForTerms({
        termIds,
        rosterProfileIds: roster,
        tenantId: "impronta",
        assignments: [
          { talent_profile_id: "t1", taxonomy_term_id: "cabaret-act", tenant_id: "tulala" },
        ],
      }),
      [],
    );
  });
});

describe("disable holders copy", () => {
  test("blocked message names the count and offers hide vs migrate", () => {
    const one = disableHoldersBlockedMessage(1);
    assert.match(one, /1 person/);
    assert.match(one, /hide/i);
    assert.match(one, /migrate/i);
    const many = disableHoldersBlockedMessage(4);
    assert.match(many, /4 people/);
    assert.equal(DISABLE_HOLDERS_CODE, "taxonomy_disable_has_holders");
  });

  test("cleared message confirms the hide", () => {
    assert.match(disableHoldersClearedMessage(1), /1 person/);
    assert.match(disableHoldersClearedMessage(4), /4 people/);
  });
});
